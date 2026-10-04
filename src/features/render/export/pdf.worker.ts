import { expose, transfer } from 'comlink'
import { JPEG_QUALITY } from '../pixels/tile-plan'
import type { ExportWorkerApi } from './run-export'
import { createExportWorkerApi } from './worker-api'

const api = createExportWorkerApi<OffscreenCanvas>({
  supported: () =>
    typeof OffscreenCanvas === 'function' && 'convertToBlob' in OffscreenCanvas.prototype,
  createCanvas: (w, h) => new OffscreenCanvas(w, h),
  encodeJpeg: async (canvas) => {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    return new Uint8Array(await blob.arrayBuffer())
  },
})

const exposed: ExportWorkerApi = {
  ...api,
  // Transfer the finished PDF instead of copying it (it can be tens of MB).
  finish: async () => {
    const bytes = await api.finish()
    return transfer(bytes, [bytes.buffer as ArrayBuffer])
  },
}

expose(exposed)
