import type { SpiralCorner } from '../../shared/model/lines.ts'
import { PHI } from './geometry.ts'
import type { FrameSize, PathCmd } from './types.ts'

export const KAPPA = (4 / 3) * (Math.SQRT2 - 1)
export const SPIRAL_ARCS = 12

/** Quarter arc from C + u to C + v (u ⊥ v, |u| = |v|) as one cubic Bézier. */
function quarter(cx: number, cy: number, ux: number, uy: number, vx: number, vy: number): PathCmd {
  return {
    op: 'C',
    x1: cx + ux + KAPPA * vx,
    y1: cy + uy + KAPPA * vy,
    x2: cx + vx + KAPPA * ux,
    y2: cy + vy + KAPPA * uy,
    x: cx + vx,
    y: cy + vy,
  }
}

/** Portrait golden rectangle [0,1] × [0,φ], y down, from the top-right corner along the top edge. */
function canonicalSpiral(): PathCmd[] {
  let x = 0
  let y = 0
  let w = 1
  let h = PHI
  const cmds: PathCmd[] = [{ op: 'M', x: 1, y: 0 }]
  for (let k = 0; k < SPIRAL_ARCS; k++) {
    const s = Math.min(w, h)
    switch (k % 4) {
      case 0:
        cmds.push(quarter(x + s, y + s, 0, -s, -s, 0))
        y += s
        h -= s
        break
      case 1:
        cmds.push(quarter(x + s, y, -s, 0, 0, s))
        x += s
        w -= s
        break
      case 2:
        cmds.push(quarter(x, y + h - s, 0, s, s, 0))
        h -= s
        break
      default:
        cmds.push(quarter(x + w - s, y + h, s, 0, 0, -s))
        w -= s
        break
    }
  }
  return cmds
}

/** M3-R10: fills the frame; a square frame takes the landscape construction. */
export function goldenSpiral(corner: SpiralCorner, { w, h }: FrameSize): PathCmd[] {
  const portrait = h > w
  const right = corner === 'topRight' || corner === 'bottomRight'
  const bottom = corner === 'bottomLeft' || corner === 'bottomRight'
  const map = (cx: number, cy: number): [number, number] => {
    // Portrait: the canonical start is top right. Landscape: transposed, it is bottom left.
    let px = portrait ? cx * w : (cy / PHI) * w
    let py = portrait ? (cy / PHI) * h : cx * h
    if (portrait !== right) px = w - px
    if (!portrait !== bottom) py = h - py
    return [px, py]
  }
  return canonicalSpiral().map((c) => {
    if (c.op !== 'C') {
      const [x, y] = map(c.x, c.y)
      return { op: c.op, x, y }
    }
    const [x1, y1] = map(c.x1, c.y1)
    const [x2, y2] = map(c.x2, c.y2)
    const [x, y] = map(c.x, c.y)
    return { op: 'C', x1, y1, x2, y2, x, y }
  })
}
