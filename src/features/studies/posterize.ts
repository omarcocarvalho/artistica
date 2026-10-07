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
  return clippedRange(hist, n)
}

function clippedRange(hist: Uint32Array, n: number): LightnessRange {
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

/** 1024 histogram bins → 256 codes of 4 bins, so a pixel's bin group fits its alpha byte. */
const CODE_SHIFT = 2
const BINS_PER_CODE = 1 << CODE_SHIFT
const CACHE_BITS = 12
const NO_KEY = 0xffffffff

/** `lightness8` with a small fixed-size memo of recent colours (smooth tiles repeat colours). */
function memoLightness8(): (r: number, g: number, b: number) => number {
  const keys = new Uint32Array(1 << CACHE_BITS).fill(NO_KEY)
  const values = new Float64Array(1 << CACHE_BITS)
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b
    const slot = Math.imul(key, 0x9e3779b1) >>> (32 - CACHE_BITS)
    if (keys[slot] === key) return values[slot] ?? 0
    const L = lightness8(r, g, b)
    keys[slot] = key
    values[slot] = L
    return L
  }
}

/**
 * In place, the same pixels as `posterizeRGBA(data, w, h, ramp, lightnessRange(data, w, h))`, with
 * lightness computed about once per pixel instead of twice. The range pass stores each pixel's bin
 * group in its alpha byte. `valueIndex` is monotone in L, so a group whose lowest and highest
 * lightness give the same value decides every pixel in it; only pixels in a group that holds a
 * value edge are measured again. Alpha ends at 255, as `posterizeRGBA` sets it.
 */
export function posterizeOwnRangeRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  ramp: readonly Rgb8[],
): void {
  const n = w * h
  if (n <= 0) return
  const L8 = memoLightness8()
  const hist = new Uint32Array(LIGHTNESS_BINS)
  for (let i = 0; i < n * 4; i += 4) {
    const bin = binOf(L8(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0))
    hist[bin] = (hist[bin] ?? 0) + 1
    data[i + 3] = bin >> CODE_SHIFT
  }
  const range = clippedRange(hist, n)
  const count = ramp.length
  const valueOfCode = new Int8Array(256)
  for (let code = 0; code < 256; code++) {
    const first = valueIndex((code * BINS_PER_CODE) / LIGHTNESS_BINS, range, count)
    const last = valueIndex(((code + 1) * BINS_PER_CODE) / LIGHTNESS_BINS, range, count)
    valueOfCode[code] = first === last ? first : -1
  }
  for (let i = 0; i < n * 4; i += 4) {
    let k = valueOfCode[data[i + 3] ?? 0] ?? -1
    if (k < 0) k = valueIndex(L8(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0), range, count)
    const c = ramp[k]
    if (!c) continue
    data[i] = c.r
    data[i + 1] = c.g
    data[i + 2] = c.b
    data[i + 3] = 255
  }
}
