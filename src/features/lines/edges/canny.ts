import type { EdgeParams } from './detail'

export interface GreyImage {
  readonly w: number
  readonly h: number
  readonly data: Uint8Array
}

/**
 * The squared magnitude a pixel needs to seed an edge, whatever `keepShare` says. A ramp of slope s
 * grey levels per pixel has |g| = 8s, so shading gentler than 4 levels per pixel never seeds one.
 */
export const MIN_STRONG_MAG2 = 32 * 32

const NO_DIRECTION = 4

export function toGrey(rgba: Uint8ClampedArray, w: number, h: number): GreyImage {
  const n = w * h
  const data = new Uint8Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    data[i] = (77 * (rgba[p] ?? 0) + 150 * (rgba[p + 1] ?? 0) + 29 * (rgba[p + 2] ?? 0)) >> 8
  }
  return { w, h, data }
}

/**
 * One binomial 1-4-6-4-1 pass in x and y, edges clamped. The 2D sum is exact and divided once
 * (>> 8, i.e. >> 4 per direction), so the pass commutes with a transpose.
 */
export function binomialBlur(src: Uint8Array, w: number, h: number): Uint8Array {
  const rows = new Uint16Array(w * h)
  for (let y = 0; y < h; y++) {
    const r = y * w
    for (let x = 0; x < w; x++) {
      const a = src[r + Math.max(0, x - 2)] ?? 0
      const b = src[r + Math.max(0, x - 1)] ?? 0
      const c = src[r + x] ?? 0
      const d = src[r + Math.min(w - 1, x + 1)] ?? 0
      const e = src[r + Math.min(w - 1, x + 2)] ?? 0
      rows[r + x] = a + 4 * b + 6 * c + 4 * d + e
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const a = Math.max(0, y - 2) * w
    const b = Math.max(0, y - 1) * w
    const c = y * w
    const d = Math.min(h - 1, y + 1) * w
    const e = Math.min(h - 1, y + 2) * w
    for (let x = 0; x < w; x++) {
      const s =
        (rows[a + x] ?? 0) +
        4 * (rows[b + x] ?? 0) +
        6 * (rows[c + x] ?? 0) +
        4 * (rows[d + x] ?? 0) +
        (rows[e + x] ?? 0)
      out[c + x] = s >> 8
    }
  }
  return out
}

/**
 * The neighbour (dx, dy) a gradient points to, coded (dy + 1) · 3 + (dx + 1): left/right when
 * |gy| · 99 ≤ |gx| · 41 (tan 22.5° ≈ 41/99), up/down for the mirror case, else the diagonal of
 * the two signs (M4-R15).
 */
export function gradientStep(gx: number, gy: number): number {
  const ax = Math.abs(gx)
  const ay = Math.abs(gy)
  const dx = ax * 99 <= ay * 41 ? 0 : Math.sign(gx)
  const dy = ay * 99 <= ax * 41 ? 0 : Math.sign(gy)
  return (dy + 1) * 3 + (dx + 1)
}

/** Integer Sobel: `mag2` = gx² + gy², `dir` = gradientStep (NO_DIRECTION where flat). */
function sobel(g: Uint8Array, w: number, h: number): { mag2: Int32Array; dir: Uint8Array } {
  const mag2 = new Int32Array(w * h)
  const dir = new Uint8Array(w * h).fill(NO_DIRECTION)
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w
    const mid = y * w
    const down = Math.min(h - 1, y + 1) * w
    for (let x = 0; x < w; x++) {
      const l = Math.max(0, x - 1)
      const r = Math.min(w - 1, x + 1)
      const ul = g[up + l] ?? 0
      const uc = g[up + x] ?? 0
      const ur = g[up + r] ?? 0
      const ml = g[mid + l] ?? 0
      const mr = g[mid + r] ?? 0
      const dl = g[down + l] ?? 0
      const dc = g[down + x] ?? 0
      const dr = g[down + r] ?? 0
      const gx = ur + 2 * mr + dr - ul - 2 * ml - dl
      const gy = dl + 2 * dc + dr - ul - 2 * uc - ur
      const m = gx * gx + gy * gy
      if (m === 0) continue
      mag2[mid + x] = m
      dir[mid + x] = gradientStep(gx, gy)
    }
  }
  return { mag2, dir }
}

/**
 * Non-maximum suppression: a pixel survives when its magnitude is ≥ the neighbour ahead (where
 * the gradient points) and > the one behind. Both sides follow the gradient, so the rule is the
 * same for the transposed image, and a two-pixel plateau along the gradient keeps one pixel.
 */
function suppress(mag2: Int32Array, dir: Uint8Array, w: number, h: number): Uint8Array {
  const keep = new Uint8Array(w * h)
  const magAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h ? (mag2[y * w + x] ?? 0) : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const code = dir[i] ?? NO_DIRECTION
      if (code === NO_DIRECTION) continue
      const dx = (code % 3) - 1
      const dy = Math.floor(code / 3) - 1
      const m = mag2[i] ?? 0
      if (m >= magAt(x + dx, y + dy) && m > magAt(x - dx, y - dy)) keep[i] = 1
    }
  }
  return keep
}

/** `high`: the smallest magnitude among the strongest `keepShare` of survivors, at least MIN_STRONG_MAG2. */
function thresholds(
  mag2: Int32Array,
  keep: Uint8Array,
  keepShare: number,
): { high: number; low: number; survivors: number } {
  let n = 0
  for (const v of keep) n += v
  const survivors = new Int32Array(n)
  for (let i = 0, j = 0; i < keep.length; i++) if (keep[i]) survivors[j++] = mag2[i] ?? 0
  survivors.sort()
  const permille = Math.round(keepShare * 1000)
  const k = Math.max(1, Math.floor((n * permille) / 1000))
  const high = Math.max(MIN_STRONG_MAG2, survivors[n - k] ?? 0)
  return { high, low: Math.floor((high * 4) / 25), survivors: n }
}

/** 1 = edge pixel, 0 = not; integer arithmetic only (M4-R15). */
export function cannyEdges(grey: GreyImage, params: EdgeParams): Uint8Array {
  const { w, h } = grey
  let g = grey.data
  for (let p = 0; p < params.blurPasses; p++) g = binomialBlur(g, w, h)
  const { mag2, dir } = sobel(g, w, h)
  const keep = suppress(mag2, dir, w, h)
  const { high, low, survivors } = thresholds(mag2, keep, params.keepShare)

  const EDGE = 2
  const stack = new Int32Array(survivors)
  let top = 0
  for (let i = 0; i < keep.length; i++) {
    if (keep[i] !== 1 || (mag2[i] ?? 0) < high) continue
    keep[i] = EDGE
    stack[top++] = i
    while (top > 0) {
      const j = stack[--top] ?? 0
      const x = j % w
      const y = (j - x) / w
      for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
          const k = ny * w + nx
          if (keep[k] === 1 && (mag2[k] ?? 0) >= low) {
            keep[k] = EDGE
            stack[top++] = k
          }
        }
      }
    }
  }
  for (let i = 0; i < keep.length; i++) keep[i] = keep[i] === EDGE ? 1 : 0
  return keep
}
