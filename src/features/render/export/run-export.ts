import type { ImageId } from '../../../shared/model/image'
import {
  forCroppedSource,
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

export type GetBitmap = (id: ImageId) => ImageBitmap | undefined

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
  /** Copy just the integer crop box out of the main-thread bitmap: `createImageBitmap(bitmap, x, y, w, h)`. */
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

/** A closed or removed image makes createImageBitmap reject with InvalidStateError (Q7). */
async function cropOrMissing(deps: ExportDeps, bitmap: ImageBitmap, box: PxRect) {
  try {
    return await deps.cropBitmap(bitmap, box)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'InvalidStateError') {
      throw new ExportError('missing-image', { cause: e })
    }
    throw e
  }
}

/**
 * Drives the export one page and one tile at a time. Main-thread memory peak is one cropped clone;
 * worker peak is one tile canvas. Identical tiles (same tileRenderKey) are encoded once.
 * On abort it rejects with an AbortError right away, even if a worker call is in flight.
 */
export async function runExport(
  pages: readonly PageModel[],
  getBitmap: GetBitmap,
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

  const encoded = new Set<string>()
  const pageCount = pages.length
  for (const [pageIndex, page] of pages.entries()) {
    onProgress?.({ pageIndex, pageCount, fraction: (pageIndex / pageCount) * (1 - SAVE_SHARE) })
    for (const [t, tile] of page.tiles.entries()) {
      checkAborted(signal)
      const plan = planTilePixels(tile)
      // Ruling D-1: the key always comes from the ORIGINAL plan.
      const key = tileRenderKey(tile, plan)
      if (!encoded.has(key)) {
        const bitmap = getBitmap(tile.imageId)
        if (!bitmap) throw new ExportError('missing-image')
        // Not raced: createImageBitmap always settles, and we must own the clone to close it.
        const clone = await cropOrMissing(deps, bitmap, integerCropBox(plan.src))
        if (signal?.aborted) {
          clone.close()
          checkAborted(signal)
        }
        try {
          await race(
            deps.api.encodeTile(key, forCroppedSource(plan), deps.transfer(clone, [clone])),
          )
        } catch (e) {
          clone.close() // no-op once transferred; frees the clone if posting failed
          throw e
        }
        encoded.add(key)
      }
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
