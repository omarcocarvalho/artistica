import { lightness8, type Rgb8 } from '../../shared/colour/oklch'

export interface LightnessRange {
  readonly lo: number
  readonly hi: number
}

export const LIGHTNESS_BINS = 1024
/** Share of pixels ignored at each end of the lightness range (owner Q11, default). */
export const VALUE_CLIP = 0.01

const binOf = (L: number): number =>
  Math.min(LIGHTNESS_BINS - 1, Math.max(0, Math.floor(L * LIGHTNESS_BINS)))

/** The tile's own lightness range, VALUE_CLIP of the pixels clipped at each end. */
export function lightnessRange(data: Uint8ClampedArray, w: number, h: number): LightnessRange {
  const n = w * h
  if (n <= 0) return { lo: 0, hi: 1 }
  const hist = new Uint32Array(LIGHTNESS_BINS)
  for (let i = 0; i < n * 4; i += 4) {
    const bin = binOf(lightness8(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0))
    hist[bin] = (hist[bin] ?? 0) + 1
  }
  const k = Math.floor(VALUE_CLIP * n)
  let cum = 0
  let loBin = -1
  let hiBin = LIGHTNESS_BINS - 1
  for (let b = 0; b < LIGHTNESS_BINS; b++) {
    cum += hist[b] ?? 0
    if (loBin < 0 && cum > k) loBin = b
    if (cum >= n - k) {
      hiBin = b
      break
    }
  }
  const lo = Math.max(0, loBin)
  if (hiBin <= lo) return { lo: (lo + 0.5) / LIGHTNESS_BINS, hi: (lo + 0.5) / LIGHTNESS_BINS }
  return { lo: lo / LIGHTNESS_BINS, hi: (hiBin + 1) / LIGHTNESS_BINS }
}

/** N equal steps over the range; a value exactly on an edge goes up; a flat range → the middle. */
export function valueIndex(L: number, range: LightnessRange, count: number): number {
  const span = range.hi - range.lo
  if (!(span >= 1e-6)) return Math.floor(count / 2)
  const k = Math.floor(((L - range.lo) / span) * count)
  return k < 0 ? 0 : k > count - 1 ? count - 1 : k
}

/** In place: every pixel becomes the ramp colour of its value; alpha 255. */
export function posterizeRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  ramp: readonly Rgb8[],
  range: LightnessRange,
): void {
  const n = w * h * 4
  for (let i = 0; i < n; i += 4) {
    const L = lightness8(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)
    const c = ramp[valueIndex(L, range, ramp.length)]
    if (!c) continue
    data[i] = c.r
    data[i + 1] = c.g
    data[i + 2] = c.b
    data[i + 3] = 255
  }
}
