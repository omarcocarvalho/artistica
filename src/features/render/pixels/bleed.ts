/**
 * Bleed by edge extension (spec §2.3, Q17): the outermost pixel row/column of the image is replicated
 * outward. Done with getImageData/putImageData on 1-px strips, not by stretching drawImage, because
 * stretched draws interpolate differently per browser even with smoothing off, and drawing a canvas
 * onto itself is a spec corner case. This way every browser produces identical pixels.
 */

/** out (w × times rows) ← `row` (w px) repeated `times` times. */
export function repeatRow(row: Uint8ClampedArray, times: number, out: Uint8ClampedArray): void {
  for (let i = 0; i < times; i++) out.set(row, i * row.length)
}

/** out (times × h) ← each pixel of `col` (h px tall) repeated `times` times across its row. */
export function repeatColumn(col: Uint8ClampedArray, times: number, out: Uint8ClampedArray): void {
  const h = col.length / 4
  for (let y = 0; y < h; y++) {
    const px = col.subarray(y * 4, y * 4 + 4)
    for (let x = 0; x < times; x++) out.set(px, (y * times + x) * 4)
  }
}

/** out (any size) ← one RGBA pixel everywhere. */
export function fillPixel(px: Uint8ClampedArray, out: Uint8ClampedArray): void {
  for (let i = 0; i < out.length; i += 4) out.set(px.subarray(0, 4), i)
}

export interface PixelCtx {
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData
  createImageData(sw: number, sh: number): ImageData
  putImageData(data: ImageData, dx: number, dy: number): void
}

/**
 * Fill the bleed ring of a canvas whose image occupies (b, b, w, h):
 * 4 edge strips from the outermost row/column, then the 4 corners from the corner pixels.
 */
export function extendEdges(ctx: PixelCtx, b: number, w: number, h: number): void {
  if (b <= 0) return
  const strip = (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dw: number,
    dh: number,
    dx: number,
    dy: number,
    fill: (src: Uint8ClampedArray, out: Uint8ClampedArray) => void,
  ): void => {
    const src = ctx.getImageData(sx, sy, sw, sh)
    const out = ctx.createImageData(dw, dh)
    fill(src.data, out.data)
    ctx.putImageData(out, dx, dy)
  }
  const right = b + w - 1
  const bottom = b + h - 1
  strip(b, b, w, 1, w, b, b, 0, (s, o) => {
    repeatRow(s, b, o)
  }) // top
  strip(b, bottom, w, 1, w, b, b, b + h, (s, o) => {
    repeatRow(s, b, o)
  }) // bottom
  strip(b, b, 1, h, b, h, 0, b, (s, o) => {
    repeatColumn(s, b, o)
  }) // left
  strip(right, b, 1, h, b, h, b + w, b, (s, o) => {
    repeatColumn(s, b, o)
  }) // right
  strip(b, b, 1, 1, b, b, 0, 0, fillPixel) // top-left
  strip(right, b, 1, 1, b, b, b + w, 0, fillPixel) // top-right
  strip(b, bottom, 1, 1, b, b, 0, b + h, fillPixel) // bottom-left
  strip(right, bottom, 1, 1, b, b, b + w, b + h, fillPixel) // bottom-right
}
