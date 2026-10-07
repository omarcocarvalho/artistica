import { lightness8, oklchToRgb8, type Rgb8 } from '../../../shared/colour/oklch'

/**
 * A w × h neutral image whose OKLab lightness rises evenly from `lo` to `hi`, left to right.
 * Mid-range lightness keeps 8-bit quantisation (≈ 0.004 L per level) far finer than any value step.
 */
export function lightnessRampImage(w: number, h: number, lo = 0.3, hi = 0.9): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let x = 0; x < w; x++) {
    const { r, g, b } = oklchToRgb8(lo + ((hi - lo) * x) / Math.max(1, w - 1), 0, 0)
    for (let y = 0; y < h; y++) d.set([r, g, b, 255], (y * w + x) * 4)
  }
  return d
}

/** Distinct RGB triples, as 'r,g,b' strings. */
export function distinctColours(d: Uint8ClampedArray): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < d.length; i += 4) {
    out.add(`${String(d[i])},${String(d[i + 1])},${String(d[i + 2])}`)
  }
  return out
}

export const key = (c: Rgb8): string => `${String(c.r)},${String(c.g)},${String(c.b)}`

/** OKLab L re-measured from the 8-bit colour (what a printer actually gets). */
export const measuredLightness = (c: Rgb8): number => lightness8(c.r, c.g, c.b)
