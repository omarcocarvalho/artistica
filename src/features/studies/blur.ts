import { BLUR_SIGMA_AT_MAX } from '../../shared/model/study'

export function blurSigmaPx(blurPct: number, w: number, h: number): number {
  return (blurPct / 100) * BLUR_SIGMA_AT_MAX * Math.min(w, h)
}

/** Below this σ the outer taps weigh under 1/510, so even a 0 → 255 edge moves by less than half a level. */
export const MIN_SIGMA_PX = 0.0625

/**
 * The σ at which three boxes of radii 3, 3, 4 have a variance of exactly σ². From here up the boxes
 * stay within 5% of σ; below it they drift further (up to 100%: no blur at all under 1/√3), so the
 * blur convolves with `gaussianTaps` instead.
 */
export const EXACT_GAUSSIAN_BELOW_SIGMA = Math.sqrt(44 / 3)

/** Kovesi, "Fast almost-Gaussian filtering", with n = 3 boxes. */
export function boxRadiiForGauss(sigma: number): readonly [number, number, number] {
  const n = 3
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl -= 1
  const wu = wl + 2
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)
  const m = Math.min(n, Math.max(0, Math.round(mIdeal)))
  const radius = (i: number): number => ((i < m ? wl : wu) - 1) / 2
  return [radius(0), radius(1), radius(2)]
}

function fillTaps(taps: Float64Array, s: number): number {
  let sum = 0
  for (let k = 0; k < taps.length; k++) {
    const t = Math.exp((-k * k) / (2 * s * s))
    taps[k] = t
    sum += k === 0 ? t : 2 * t
  }
  let v = 0
  for (let k = 0; k < taps.length; k++) {
    const t = (taps[k] ?? 0) / sum
    taps[k] = t
    v += 2 * k * k * t
  }
  return v
}

/**
 * Half of a symmetric kernel (taps[0] is the centre) of radius max(1, ⌈3σ⌉): Gaussian-shaped,
 * summing to 1, with its width chosen so that the variance of the sampled, truncated kernel is σ².
 */
export function gaussianTaps(sigma: number): Float64Array {
  const taps = new Float64Array(Math.max(1, Math.ceil(3 * sigma)) + 1)
  let lo = 0
  let hi = taps.length
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    if (fillTaps(taps, mid) < sigma * sigma) lo = mid
    else hi = mid
  }
  fillTaps(taps, (lo + hi) / 2)
  return taps
}

function gaussLine(
  data: Uint8ClampedArray,
  buf: Uint8ClampedArray,
  start: number,
  step: number,
  n: number,
  taps: Float64Array,
): void {
  const r = taps.length - 1
  for (let i = -r; i < n + r; i++) {
    const j = (i + r) * 4
    const src = start + (i < 0 ? 0 : i >= n ? n - 1 : i) * step
    buf[j] = data[src] ?? 0
    buf[j + 1] = data[src + 1] ?? 0
    buf[j + 2] = data[src + 2] ?? 0
  }
  const t0 = taps[0] ?? 0
  for (let x = 0, to = start; x < n; x++, to += step) {
    const c = (x + r) * 4
    let sr = t0 * (buf[c] ?? 0)
    let sg = t0 * (buf[c + 1] ?? 0)
    let sb = t0 * (buf[c + 2] ?? 0)
    for (let k = 1; k <= r; k++) {
      const t = taps[k] ?? 0
      const a = c - 4 * k
      const b = c + 4 * k
      sr += t * ((buf[a] ?? 0) + (buf[b] ?? 0))
      sg += t * ((buf[a + 1] ?? 0) + (buf[b + 1] ?? 0))
      sb += t * ((buf[a + 2] ?? 0) + (buf[b + 2] ?? 0))
    }
    data[to] = Math.floor(sr + 0.5)
    data[to + 1] = Math.floor(sg + 0.5)
    data[to + 2] = Math.floor(sb + 0.5)
  }
}

function boxLine(
  data: Uint8ClampedArray,
  buf: Uint8ClampedArray,
  start: number,
  step: number,
  n: number,
  r: number,
): void {
  for (let i = 0, from = start; i < n; i++, from += step) {
    const j = i * 4
    buf[j] = data[from] ?? 0
    buf[j + 1] = data[from + 1] ?? 0
    buf[j + 2] = data[from + 2] ?? 0
  }
  const d = 2 * r + 1
  const last = 4 * (n - 1)
  const at = (i: number): number => (i < 0 ? 0 : i > last ? last : i)
  let sr = 0
  let sg = 0
  let sb = 0
  for (let i = -r; i <= r; i++) {
    const j = at(i * 4)
    sr += buf[j] ?? 0
    sg += buf[j + 1] ?? 0
    sb += buf[j + 2] ?? 0
  }
  for (let x = 0, to = start; x < n; x++, to += step) {
    data[to] = Math.floor((sr + r) / d)
    data[to + 1] = Math.floor((sg + r) / d)
    data[to + 2] = Math.floor((sb + r) / d)
    const add = at((x + r + 1) * 4)
    const sub = at((x - r) * 4)
    sr += (buf[add] ?? 0) - (buf[sub] ?? 0)
    sg += (buf[add + 1] ?? 0) - (buf[sub + 1] ?? 0)
    sb += (buf[add + 2] ?? 0) - (buf[sub + 2] ?? 0)
  }
}

/** In place, alpha untouched; one line buffer of extra memory whatever the image size. */
export function gaussianBlurRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sigma: number,
): void {
  if (!(sigma >= MIN_SIGMA_PX) || w <= 0 || h <= 0) return
  if (sigma < EXACT_GAUSSIAN_BELOW_SIGMA) {
    const taps = gaussianTaps(sigma)
    const buf = new Uint8ClampedArray(4 * (Math.max(w, h) + 2 * (taps.length - 1)))
    for (let y = 0; y < h; y++) gaussLine(data, buf, y * w * 4, 4, w, taps)
    for (let x = 0; x < w; x++) gaussLine(data, buf, x * 4, w * 4, h, taps)
    return
  }
  const radii = boxRadiiForGauss(sigma)
  const buf = new Uint8ClampedArray(4 * Math.max(w, h))
  for (const r of radii) {
    if (r === 0) continue
    for (let y = 0; y < h; y++) boxLine(data, buf, y * w * 4, 4, w, r)
  }
  for (const r of radii) {
    if (r === 0) continue
    for (let x = 0; x < w; x++) boxLine(data, buf, x * 4, w * 4, h, r)
  }
}
