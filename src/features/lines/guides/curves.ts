import { KAPPA } from '../spiral'
import type { PathCmd } from '../types'

/** A circle as 'M' + 4 cubic quarter arcs with KAPPA, clockwise from the top (y down). */
export function circlePath(cx: number, cy: number, r: number): PathCmd[] {
  const k = KAPPA * r
  return [
    { op: 'M', x: cx, y: cy - r },
    { op: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
    { op: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
    { op: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
    { op: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
  ]
}
