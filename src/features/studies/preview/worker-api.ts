import type { TileStudy } from '../../../shared/model/study'
import { releaseCanvas, renderTile, type TileCanvas } from '../../render/pixels/render-tile'
import type { TilePixelPlan } from '../../render/pixels/tile-plan'

export interface StudyWorkerApi {
  /** Rejects with "studies:unsupported" when this context cannot render tiles. */
  init(): Promise<void>
  /** Takes ownership of `bitmap` (closed on every path). Resolves with a new bitmap the caller owns. */
  renderStudyTile(plan: TilePixelPlan, bitmap: ImageBitmap, study: TileStudy): Promise<ImageBitmap>
}

export interface StudyWorkerEnv<C extends TileCanvas & CanvasImageSource> {
  readonly supported: () => boolean
  readonly createCanvas: (w: number, h: number) => C
  readonly toBitmap: (canvas: C) => Promise<ImageBitmap>
}

/** One study tile through the export's own renderTile, at whatever resolution the plan says. */
export function createStudyWorkerApi<C extends TileCanvas & CanvasImageSource>(
  env: StudyWorkerEnv<C>,
): StudyWorkerApi {
  return {
    init: () =>
      Promise.resolve().then(() => {
        if (!env.supported()) throw new Error('studies:unsupported')
      }),

    async renderStudyTile(plan, bitmap, study) {
      let canvas: C | undefined
      try {
        canvas = renderTile(bitmap, plan, env.createCanvas, study)
        return await env.toBitmap(canvas)
      } finally {
        bitmap.close()
        if (canvas) releaseCanvas(canvas)
      }
    },
  }
}

export function offscreenCanvas2d(): boolean {
  if (typeof OffscreenCanvas !== 'function') return false
  if (!('transferToImageBitmap' in OffscreenCanvas.prototype)) return false
  try {
    return new OffscreenCanvas(1, 1).getContext('2d') !== null
  } catch {
    return false
  }
}

/** The studies worker's canvases; also the main-thread fallback's wherever OffscreenCanvas 2D exists. */
export function offscreenEnv(): StudyWorkerEnv<OffscreenCanvas> {
  return {
    supported: offscreenCanvas2d,
    createCanvas: (w, h) => new OffscreenCanvas(w, h),
    toBitmap: (canvas) => Promise.resolve(canvas.transferToImageBitmap()),
  }
}
