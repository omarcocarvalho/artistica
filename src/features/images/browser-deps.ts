import type { Matrix } from './exif'
import type { CanvasLike, DecodeDeps } from './decode'
import { loadHeicConverter } from './heic'
import { probeBrowserAppliesExif } from './orientation-probe'
import { probeResizeOnDecode, resizeOnDecodeSavesMemory } from './resize-probe'

function createCanvas(w: number, h: number): CanvasLike {
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  return {
    get width() {
      return el.width
    },
    get height() {
      return el.height
    },
    paint(bitmap: ImageBitmap, matrix: Matrix): boolean {
      const ctx = el.getContext('2d')
      if (ctx === null) return false
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, el.width, el.height)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.setTransform(...matrix)
      ctx.drawImage(bitmap, 0, 0)
      return true
    },
    toBlob: (type, quality) =>
      new Promise((resolve) => {
        el.toBlob(resolve, type, quality)
      }),
    toBitmap: () => createImageBitmap(el),
    release() {
      el.width = 0
      el.height = 0
    },
  }
}

export function createBrowserDecodeDeps(): DecodeDeps {
  let probe: Promise<boolean> | undefined
  let resizeProbe: Promise<boolean> | undefined
  const deps: DecodeDeps = {
    createImageBitmap: (blob, options) => createImageBitmap(blob, options),
    createCanvas,
    browserAppliesExif: () => (probe ??= probeBrowserAppliesExif(deps)),
    resizeOnDecode: () =>
      (resizeProbe ??= resizeOnDecodeSavesMemory(navigator.userAgent)
        ? probeResizeOnDecode(deps)
        : Promise.resolve(false)),
    loadHeicConverter,
    createObjectURL: (blob) => URL.createObjectURL(blob),
  }
  return deps
}
