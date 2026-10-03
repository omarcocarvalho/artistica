import type { CropRect } from '../../shared/model/image'

export const MIN_CROP_PX = 16
export const HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type Handle = (typeof HANDLES)[number]

const EPS = 1e-6
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback)

export interface CropLimits {
  maxW: number
  maxH: number
  minW: number
  minH: number
}

/** Size limits for a crop inside a W x H image. `ratio` is w/h, or null for free. */
export function cropLimits(W: number, H: number, ratio: number | null): CropLimits {
  const maxW = ratio === null ? W : Math.min(W, H * ratio)
  const maxH = ratio === null ? H : maxW / ratio
  const baseW = Math.min(MIN_CROP_PX, W)
  const baseH = Math.min(MIN_CROP_PX, H)
  const minW = ratio === null ? baseW : Math.min(maxW, Math.max(baseW, baseH * ratio))
  const minH = ratio === null ? baseH : minW / ratio
  return { maxW, maxH, minW, minH }
}

export const fullCrop = (W: number, H: number): CropRect => ({ x: 0, y: 0, w: W, h: H })

export function largestCrop(W: number, H: number, ratio: number | null): CropRect {
  if (ratio === null) return fullCrop(W, H)
  const { maxW, maxH } = cropLimits(W, H, ratio)
  return { x: (W - maxW) / 2, y: (H - maxH) / 2, w: maxW, h: maxH }
}

export function isFullCrop(r: CropRect, W: number, H: number): boolean {
  return (
    Math.abs(r.x) < EPS && Math.abs(r.y) < EPS && Math.abs(r.w - W) < EPS && Math.abs(r.h - H) < EPS
  )
}

export function isValidCrop(r: CropRect, W: number, H: number, ratio: number | null): boolean {
  const { minW, minH } = cropLimits(W, H, ratio)
  const finiteAll = [r.x, r.y, r.w, r.h].every(Number.isFinite)
  if (!finiteAll) return false
  const inside = r.x >= -EPS && r.y >= -EPS && r.x + r.w <= W + EPS && r.y + r.h <= H + EPS
  const bigEnough = r.w >= minW - EPS && r.h >= minH - EPS
  const aspectOk = ratio === null || Math.abs(r.w - r.h * ratio) <= EPS * Math.max(1, r.w)
  return inside && bigEnough && aspectOk
}

/** Fit any rect to the image and aspect, keeping its centre (and width) where possible. */
export function clampCrop(r: CropRect, W: number, H: number, ratio: number | null): CropRect {
  const lim = cropLimits(W, H, ratio)
  const w = clamp(finite(r.w, lim.maxW), lim.minW, lim.maxW)
  const h = ratio === null ? clamp(finite(r.h, lim.maxH), lim.minH, lim.maxH) : w / ratio
  const cx = finite(r.x, 0) + finite(r.w, w) / 2
  const cy = finite(r.y, 0) + finite(r.h, h) / 2
  return { x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - h / 2, 0, H - h), w, h }
}

export function moveCrop(r: CropRect, dx: number, dy: number, W: number, H: number): CropRect {
  return {
    x: clamp(r.x + finite(dx, 0), 0, W - r.w),
    y: clamp(r.y + finite(dy, 0), 0, H - r.h),
    w: r.w,
    h: r.h,
  }
}

/**
 * Resize from the START rect by the TOTAL delta (no drift). `start` must already be valid.
 * With a ratio, corner handles anchor the opposite corner; edge handles anchor the opposite edge
 * and keep the other axis centred.
 */
export function resizeCrop(
  start: CropRect,
  handle: Handle,
  dx: number,
  dy: number,
  W: number,
  H: number,
  ratio: number | null,
): CropRect {
  const mx = finite(dx, 0)
  const my = finite(dy, 0)
  const lim = cropLimits(W, H, ratio)
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')

  if (ratio === null) {
    let left = start.x
    let right = start.x + start.w
    let top = start.y
    let bottom = start.y + start.h
    if (west) left = clamp(left + mx, 0, right - lim.minW)
    if (east) right = clamp(right + mx, left + lim.minW, W)
    if (north) top = clamp(top + my, 0, bottom - lim.minH)
    if (south) bottom = clamp(bottom + my, top + lim.minH, H)
    return { x: left, y: top, w: right - left, h: bottom - top }
  }

  if ((west || east) && (north || south)) {
    const sx = east ? 1 : -1
    const sy = south ? 1 : -1
    const ax = east ? start.x : start.x + start.w
    const ay = south ? start.y : start.y + start.h
    const byX = sx * mx
    const byY = (start.h + sy * my) * ratio - start.w
    const target = start.w + (Math.abs(byX) >= Math.abs(byY) ? byX : byY)
    const availW = east ? W - ax : ax
    const availH = south ? H - ay : ay
    const wmax = Math.min(availW, availH * ratio, lim.maxW)
    const w = Math.min(wmax, Math.max(target, lim.minW))
    const h = w / ratio
    return { x: east ? ax : ax - w, y: south ? ay : ay - h, w, h }
  }

  if (west || east) {
    const sx = east ? 1 : -1
    const ax = east ? start.x : start.x + start.w
    const availW = east ? W - ax : ax
    const wmax = Math.min(availW, lim.maxW)
    const w = Math.min(wmax, Math.max(start.w + sx * mx, lim.minW))
    const h = w / ratio
    const cy = start.y + start.h / 2
    return { x: east ? ax : ax - w, y: clamp(cy - h / 2, 0, H - h), w, h }
  }

  const sy = south ? 1 : -1
  const ay = south ? start.y : start.y + start.h
  const availH = south ? H - ay : ay
  const hmax = Math.min(availH, lim.maxH)
  const h = Math.min(hmax, Math.max(start.h + sy * my, lim.minH))
  const w = h * ratio
  const cx = start.x + start.w / 2
  return { x: clamp(cx - w / 2, 0, W - w), y: south ? ay : ay - h, w, h }
}

export function arrowDelta(key: string, step: number): { dx: number; dy: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 }
    case 'ArrowRight':
      return { dx: step, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -step }
    case 'ArrowDown':
      return { dx: 0, dy: step }
    default:
      return null
  }
}

export const keyboardStep = (W: number, H: number): number =>
  Math.max(1, Math.round(Math.max(W, H) / 200))
