/** Test-only RGBA builders and statistics. Alpha is always 255 (M1 flattens transparency on white). */

export type Px = readonly [number, number, number]

/** w × h image from a pixel function. */
export function rgba(w: number, h: number, f: (x: number, y: number) => Px): Uint8ClampedArray {
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

export const solid = (w: number, h: number, px: Px): Uint8ClampedArray => rgba(w, h, () => px)

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

export function noise(w: number, h: number, seed: number): Uint8ClampedArray {
  const rnd = mulberry32(seed)
  return rgba(w, h, () => [
    Math.floor(rnd() * 256),
    Math.floor(rnd() * 256),
    Math.floor(rnd() * 256),
  ])
}

/** Mean of channel c (0 = R, 1 = G, 2 = B, 3 = A). */
export function channelMean(d: Uint8ClampedArray, c: number): number {
  let s = 0
  for (let i = c; i < d.length; i += 4) s += d[i] ?? 0
  return s / (d.length / 4)
}

export function channelRange(d: Uint8ClampedArray, c: number): { min: number; max: number } {
  let min = 255
  let max = 0
  for (let i = c; i < d.length; i += 4) {
    const v = d[i] ?? 0
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}
