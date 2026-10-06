import type { ImageId } from '../../../shared/model/image'
import {
  forCroppedSource,
  forScaledSource,
  integerCropBox,
  planTilePixels,
  tileRenderKey,
  type PxRect,
  type TilePixelPlan,
} from '../pixels/tile-plan'
import type { PageModel } from '../types'
import { ExportError } from './errors'

export interface ExportProgress {
  /** 0-based page being processed. */
  readonly pageIndex: number
  readonly pageCount: number
  /** 0..1 over the whole export. */
  readonly fraction: number
}

export interface ExportOptions {
  readonly onProgress?: (progress: ExportProgress) => void
  readonly signal?: AbortSignal
}

export interface ExportSource {
  /** The size page models are planned against. */
  readonly pxW: number
  readonly pxH: number
  /** The whole image at full resolution. The caller owns and closes the bitmap. */
  decode(): Promise<ImageBitmap>
}

/** Undefined when the image is gone (removed during the export). */
export type GetSource = (id: ImageId) => ExportSource | undefined

/** What the export worker exposes (via Comlink). All methods are async across the boundary. */
export interface ExportWorkerApi {
  /** Rejects with "export:unsupported" when OffscreenCanvas 2D / convertToBlob are unavailable. */
  init(): Promise<void>
  /** Render + JPEG-encode + embed one tile image. The worker closes `bitmap` when done. */
  encodeTile(key: string, plan: TilePixelPlan, bitmap: ImageBitmap): Promise<void>
  addPage(page: PageModel): Promise<void>
  finish(): Promise<Uint8Array>
}

export interface ExportDeps {
  readonly api: ExportWorkerApi
  /** Copy just the integer crop box out of the decoded image: `createImageBitmap(bitmap, x, y, w, h)`. */
  readonly cropBitmap: (bitmap: ImageBitmap, box: PxRect) => Promise<ImageBitmap>
  /** Mark a value for transfer (Comlink.transfer in the app; identity in tests). */
  readonly transfer: <T>(value: T, transferables: Transferable[]) => T
  /** Rejects if the worker dies (error event). Raced against every worker call. */
  readonly crashed?: Promise<never>
}

const ABORTED = (): DOMException => new DOMException('Aborted', 'AbortError')

/** A real AbortError for an aborted signal; an arbitrary abort reason is never leaked (CCR-D5). */
function abortError(signal: AbortSignal): DOMException {
  const reason: unknown = signal.reason
  return reason instanceof DOMException && reason.name === 'AbortError' ? reason : ABORTED()
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal)
}

function abortRejection(signal: AbortSignal | undefined): Promise<never> | undefined {
  if (!signal) return undefined
  return new Promise<never>((_, reject) => {
    const fail = (): void => {
      reject(abortError(signal))
    }
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}

/** Share of the progress bar kept for saving the PDF after the last page. */
const SAVE_SHARE = 0.05

interface TileJob {
  readonly key: string
  readonly plan: TilePixelPlan
}

/** Every distinct tile image to encode, grouped by source image (first appearance order). */
function jobsByImage(pages: readonly PageModel[]): Map<ImageId, TileJob[]> {
  const byImage = new Map<ImageId, TileJob[]>()
  const seen = new Set<string>()
  for (const page of pages) {
    for (const tile of page.tiles) {
      const plan = planTilePixels(tile)
      // Ruling D-1: the key always comes from the ORIGINAL plan.
      const key = tileRenderKey(tile, plan)
      if (seen.has(key)) continue
      seen.add(key)
      const jobs = byImage.get(tile.imageId) ?? []
      jobs.push({ key, plan })
      byImage.set(tile.imageId, jobs)
    }
  }
  return byImage
}

/**
 * Drives the export page by page. The first tile of an image decodes that image at full resolution
 * and encodes all of its tiles, on every page, before the bitmap is closed: each image is decoded
 * once and at most one full-resolution image is alive. Main-thread peak is that image plus one
 * cropped clone; worker peak is one tile canvas. Identical tiles (same tileRenderKey) are encoded once.
 * On abort it rejects with an AbortError right away, even if a decode or worker call is in flight.
 */
export async function runExport(
  pages: readonly PageModel[],
  getSource: GetSource,
  options: ExportOptions,
  deps: ExportDeps,
): Promise<Uint8Array> {
  const { signal, onProgress } = options
  const aborted = abortRejection(signal)
  void aborted?.catch(() => undefined) // avoid an unhandled rejection when nobody is racing it
  void deps.crashed?.catch(() => undefined)
  const race = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([p, ...(aborted ? [aborted] : []), ...(deps.crashed ? [deps.crashed] : [])])

  if (pages.length === 0) throw new ExportError('empty')
  checkAborted(signal)
  await race(deps.api.init())

  const jobs = jobsByImage(pages)
  const encoded = new Set<string>()

  const decodeRaced = async (source: ExportSource): Promise<ImageBitmap> => {
    const decoding = source.decode()
    try {
      return await race(decoding)
    } catch (e) {
      void decoding.then(
        (late) => {
          late.close()
        },
        () => undefined,
      )
      throw e
    }
  }

  const encodeImage = async (imageId: ImageId): Promise<void> => {
    const source = getSource(imageId)
    if (!source) throw new ExportError('missing-image')
    const full = await decodeRaced(source)
    try {
      const sx = full.width / source.pxW
      const sy = full.height / source.pxH
      for (const { key, plan } of jobs.get(imageId) ?? []) {
        checkAborted(signal)
        const scaled = forScaledSource(plan, sx, sy)
        // Not raced: createImageBitmap always settles, and we must own the clone to close it.
        const clone = await deps.cropBitmap(full, integerCropBox(scaled.src))
        if (signal?.aborted) {
          clone.close()
          checkAborted(signal)
        }
        try {
          await race(
            deps.api.encodeTile(key, forCroppedSource(scaled), deps.transfer(clone, [clone])),
          )
        } catch (e) {
          clone.close() // no-op once transferred; frees the clone if posting failed
          throw e
        }
        encoded.add(key)
      }
    } finally {
      full.close()
    }
  }

  const pageCount = pages.length
  for (const [pageIndex, page] of pages.entries()) {
    onProgress?.({ pageIndex, pageCount, fraction: (pageIndex / pageCount) * (1 - SAVE_SHARE) })
    for (const [t, tile] of page.tiles.entries()) {
      checkAborted(signal)
      if (!encoded.has(tileRenderKey(tile))) await encodeImage(tile.imageId)
      onProgress?.({
        pageIndex,
        pageCount,
        fraction: ((pageIndex + (t + 1) / page.tiles.length) / pageCount) * (1 - SAVE_SHARE),
      })
    }
    await race(deps.api.addPage(page))
  }
  const bytes = await race(deps.api.finish())
  onProgress?.({ pageIndex: pageCount - 1, pageCount, fraction: 1 })
  return bytes
}
