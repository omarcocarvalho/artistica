import { createPdfComposer, type PdfComposer } from '../pdf/compose'
import { releaseCanvas, renderTile, type TileCanvas } from '../pixels/render-tile'
import type { TilePixelPlan } from '../pixels/tile-plan'
import type { ExportWorkerApi } from './run-export'

export interface WorkerEnv<C extends TileCanvas & CanvasImageSource> {
  /** `typeof OffscreenCanvas === 'function' && 'convertToBlob' in OffscreenCanvas.prototype` in the worker. */
  readonly supported: () => boolean
  readonly createCanvas: (w: number, h: number) => C
  /** `canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })` → bytes. */
  readonly encodeJpeg: (canvas: C) => Promise<Uint8Array>
}

/** The export worker's logic, independent of Comlink and of real canvases (unit-tested in node). */
export function createExportWorkerApi<C extends TileCanvas & CanvasImageSource>(
  env: WorkerEnv<C>,
): ExportWorkerApi {
  let composer: PdfComposer | undefined
  const need = (): PdfComposer => {
    if (!composer) throw new Error('export:failed (init not called)')
    return composer
  }

  return {
    async init() {
      if (!env.supported()) throw new Error('export:unsupported')
      composer = await createPdfComposer()
    },

    async encodeTile(key: string, plan: TilePixelPlan, bitmap: ImageBitmap) {
      let canvas: C | undefined
      try {
        const c = need()
        canvas = renderTile(bitmap, plan, env.createCanvas)
        const bytes = await env.encodeJpeg(canvas)
        await c.embed(key, { format: 'jpeg', bytes, pxW: plan.canvasW, pxH: plan.canvasH })
      } finally {
        bitmap.close()
        if (canvas) releaseCanvas(canvas)
      }
    },

    // Promise.resolve().then(...) turns synchronous throws into rejections, as Comlink would.
    addPage(page) {
      return Promise.resolve().then(() => {
        need().addPage(page)
      })
    },

    finish() {
      return Promise.resolve().then(() => {
        const c = need()
        composer = undefined
        return c.save()
      })
    },
  }
}
