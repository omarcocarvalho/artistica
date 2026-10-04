import type { TileCanvas, TileCtx } from '../pixels/render-tile'

/** Test-only RGBA canvas: real pixel buffer for fillRect/get/putImageData, drawImage calls recorded. */
export interface DrawCall {
  readonly source: unknown
  readonly args: readonly number[]
  readonly transform: readonly number[]
  readonly smoothing: boolean
}

export class FakeCanvas implements TileCanvas {
  width: number
  height: number
  data: Uint8ClampedArray
  readonly draws: DrawCall[] = []
  private ctx: TileCtx

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
    let transform: number[] = [1, 0, 0, 1, 0, 0]
    const imageData = (
      w: number,
      h: number,
      data = new Uint8ClampedArray(w * h * 4),
    ): ImageData => ({ width: w, height: h, data, colorSpace: 'srgb' })
    const ctx: TileCtx = {
      fillStyle: '#000000',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
      fillRect: (x, y, w, h) => {
        const hex = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : '#000000'
        const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++)
            this.data.set([...rgb, 255], (yy * this.width + xx) * 4)
      },
      setTransform: (a, b, c, d, e, f) => {
        transform = [a, b, c, d, e, f]
      },
      resetTransform: () => {
        transform = [1, 0, 0, 1, 0, 0]
      },
      drawImage: (source: CanvasImageSource, ...args: number[]) => {
        this.draws.push({ source, args, transform, smoothing: ctx.imageSmoothingEnabled })
      },
      getImageData: (sx, sy, sw, sh) => {
        const out = new Uint8ClampedArray(sw * sh * 4)
        for (let y = 0; y < sh; y++)
          out.set(
            this.data.subarray(
              ((sy + y) * this.width + sx) * 4,
              ((sy + y) * this.width + sx + sw) * 4,
            ),
            y * sw * 4,
          )
        return imageData(sw, sh, out)
      },
      createImageData: (sw, sh) => imageData(sw, sh),
      putImageData: (img, dx, dy) => {
        for (let y = 0; y < img.height; y++)
          this.data.set(
            img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4),
            ((dy + y) * this.width + dx) * 4,
          )
      },
    }
    this.ctx = ctx
  }

  getContext(contextId: string): TileCtx | null {
    return contextId === '2d' ? this.ctx : null
  }

  pixel(x: number, y: number): number[] {
    return Array.from(this.data.subarray((y * this.width + x) * 4, (y * this.width + x) * 4 + 4))
  }

  setPixel(x: number, y: number, rgba: readonly number[]): void {
    this.data.set(rgba, (y * this.width + x) * 4)
  }
}

/** FakeCanvas typed as a drawable canvas for renderTile's generic factory. */
export type DrawableFake = FakeCanvas & CanvasImageSource
export const fakeFactory =
  (made: FakeCanvas[] = []) =>
  (w: number, h: number): DrawableFake => {
    const c = new FakeCanvas(w, h)
    made.push(c)
    return c as DrawableFake
  }
