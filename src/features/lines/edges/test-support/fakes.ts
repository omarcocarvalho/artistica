import type { PixelCanvas, PixelCtx } from '../worker-api'

export type TestBitmap = ImageBitmap & { closed: number; readonly pixels: Uint8ClampedArray }

export function bitmapOf(rgba: Uint8ClampedArray, w: number, h: number): TestBitmap {
  const b = {
    width: w,
    height: h,
    pixels: rgba,
    closed: 0,
    close: () => {
      b.closed++
      b.width = 0
      b.height = 0
    },
  }
  return b
}

export interface FakePixelCanvas extends PixelCanvas {
  readonly created: { readonly w: number; readonly h: number }
  readonly drawn: { readonly image: unknown; readonly dx: number; readonly dy: number }[]
  readonly reads: (readonly number[])[]
  readonly settings: unknown[]
}

/** A canvas whose pixels are those of the last bitmap drawn on it (a TestBitmap's `pixels`). */
export function fakePixelCanvas(
  w: number,
  h: number,
  overrides: Partial<PixelCtx> & { noContext?: boolean } = {},
): FakePixelCanvas {
  let pixels = new Uint8ClampedArray(w * h * 4)
  const canvas: FakePixelCanvas = {
    width: w,
    height: h,
    created: { w, h },
    drawn: [],
    reads: [],
    settings: [],
    getContext(_id, settings) {
      canvas.settings.push(settings)
      if (overrides.noContext === true) return null
      return {
        drawImage(image, dx, dy) {
          canvas.drawn.push({ image, dx, dy })
          pixels = (image as unknown as TestBitmap).pixels.slice()
        },
        getImageData(sx, sy, sw, sh) {
          canvas.reads.push([sx, sy, sw, sh])
          return { width: sw, height: sh, data: pixels, colorSpace: 'srgb' }
        },
        ...overrides,
      }
    },
  }
  return canvas
}
