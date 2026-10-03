import type { Mm } from '../../../shared/model/units'
import type { RectMm } from '../../layout/types'
import type { Segment } from '../types'

/** Grow a rect by `by` on every side. */
export function expandRect(r: RectMm, by: Mm): RectMm {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by }
}

/** Closed test: touching the boundary counts as intersecting. Works for any segment (Liang–Barsky). */
export function segmentIntersectsRect(s: Segment, r: RectMm): boolean {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return (
    clip(-dx, s.x1 - r.x) &&
    clip(dx, r.x + r.w - s.x1) &&
    clip(-dy, s.y1 - r.y) &&
    clip(dy, r.y + r.h - s.y1)
  )
}

/** Closed containment with a small tolerance for floating-point noise. */
export function pointInRect(x: Mm, y: Mm, r: RectMm, eps = 1e-9): boolean {
  return x >= r.x - eps && x <= r.x + r.w + eps && y >= r.y - eps && y <= r.y + r.h + eps
}
