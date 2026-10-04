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

function abortRejection(signal: AbortSignal | undefined): Promise<never> | undefined {
  if (!signal) return undefined
  return new Promise<never>((_, reject) => {
    const fail = (): void => {
      reject(
        signal.reason instanceof DOMException
          ? signal.reason
          : new DOMException('Aborted', 'AbortError'),
      )
    }
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
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
  signal?.throwIfAborted()
  await race(deps.api.init())

  const encoded = new Set<string>()
  const pageCount = pages.length
  for (const [pageIndex, page] of pages.entries()) {
    onProgress?.({ pageIndex, pageCount, fraction: pageIndex / pageCount })
    for (const [t, tile] of page.tiles.entries()) {
      signal?.throwIfAborted()
      const plan = planTilePixels(tile)
      // Ruling D-1: the key always comes from the ORIGINAL plan.
      const key = tileRenderKey(tile, plan)
      if (!encoded.has(key)) {
        const bitmap = getBitmap(tile.imageId)
        if (!bitmap) throw new ExportError('missing-image')
        // Not raced: createImageBitmap always settles, and we must own the clone to close it.
        const clone = await deps.cropBitmap(bitmap, integerCropBox(plan.src))
        if (signal?.aborted) {
          clone.close()
          signal.throwIfAborted()
        }
        await race(deps.api.encodeTile(key, forCroppedSource(plan), deps.transfer(clone, [clone])))
        encoded.add(key)
      }
      onProgress?.({
        pageIndex,
        pageCount,
        fraction: (pageIndex + (t + 1) / page.tiles.length) / pageCount,
      })
    }
    await race(deps.api.addPage(page))
  }
  return race(deps.api.finish())
}
