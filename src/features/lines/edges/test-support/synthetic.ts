/** Test-only RGBA images with known edges. Alpha is always 255. */

export type Rgb = readonly [number, number, number]

export const BLACK: Rgb = [0, 0, 0]
export const WHITE: Rgb = [255, 255, 255]

export function rgba(w: number, h: number, f: (x: number, y: number) => Rgb): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y)
      const i = (y * w + x) * 4
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    }
  }
  return d
}

/** Deterministic PRNG (mulberry32); never Math.random in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pixel (x, y) is inside when its centre lies within `r` of (cx, cy). */
export const insideDisc = (x: number, y: number, cx: number, cy: number, r: number): boolean =>
  (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r

export function disc(
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  fg: Rgb = WHITE,
  bg: Rgb = BLACK,
): Uint8ClampedArray {
  return rgba(w, h, (x, y) => (insideDisc(x, y, cx, cy, r) ? fg : bg))
}

/** Pixels x0 ≤ x < x1, y0 ≤ y < y1 are `fg`. */
export function square(
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fg: Rgb = WHITE,
  bg: Rgb = BLACK,
): Uint8ClampedArray {
  return rgba(w, h, (x, y) => (x >= x0 && x < x1 && y >= y0 && y < y1 ? fg : bg))
}

/** Grey ramp along the direction `angleDeg`, spanning 0..`span` over the whole image. */
export function gradient(w: number, h: number, angleDeg: number, span = 255): Uint8ClampedArray {
  const c = Math.cos((angleDeg * Math.PI) / 180)
  const s = Math.sin((angleDeg * Math.PI) / 180)
  const corners = [0, w - 1].flatMap((x) => [0, h - 1].map((y) => x * c + y * s))
  const lo = Math.min(...corners)
  const range = Math.max(...corners) - lo || 1
  return rgba(w, h, (x, y) => {
    const v = Math.round(((x * c + y * s - lo) / range) * span)
    return [v, v, v]
  })
}

export function noise(w: number, h: number, seed: number): Uint8ClampedArray {
  const rnd = mulberry32(seed)
  return rgba(w, h, () => [
    Math.floor(rnd() * 256),
    Math.floor(rnd() * 256),
    Math.floor(rnd() * 256),
  ])
}

/** Vertical stripes `period / 2` px wide, alternating `fg` and `bg`. */
export function stripes(
  w: number,
  h: number,
  period: number,
  fg: Rgb = WHITE,
  bg: Rgb = BLACK,
): Uint8ClampedArray {
  return rgba(w, h, (x) => (x % period < period / 2 ? fg : bg))
}

/** The RGBA image mirrored about its main diagonal (w × h → h × w). */
export function transposeRgba(d: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) out[(x * h + y) * 4 + c] = d[(y * w + x) * 4 + c] ?? 0
    }
  }
  return out
}

/** A one-byte-per-pixel map mirrored about its main diagonal (w × h → h × w). */
export function transposeMap(d: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(d.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[x * h + y] = d[y * w + x] ?? 0
  }
  return out
}

export const countOnes = (d: Uint8Array): number => d.reduce((s, v) => s + v, 0)
