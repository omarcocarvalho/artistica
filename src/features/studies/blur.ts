import { BLUR_SIGMA_AT_MAX } from '../../shared/model/study'

export function blurSigmaPx(blurPct: number, w: number, h: number): number {
  return (blurPct / 100) * BLUR_SIGMA_AT_MAX * Math.min(w, h)
}

const MIN_SIGMA_PX = 0.25

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
