import type { RectMm } from '../layout/types'
import type { FrameSize, PathCmd } from './types'

/** M3-R3: the picture as edited; its sides swap when the engine turned the item. */
export function frameOf(trim: RectMm, turned: boolean): FrameSize {
  return turned ? { w: trim.h, h: trim.w } : { w: trim.w, h: trim.h }
}

/** M3-R3: translate, or rotate 90° clockwise (as combineRotation) into the trim. Affine, so Béziers stay exact. */
export function frameToPage(cmd: PathCmd, trim: RectMm, turned: boolean): PathCmd {
  const at = (u: number, v: number): [number, number] =>
    turned ? [trim.x + trim.w - v, trim.y + u] : [trim.x + u, trim.y + v]
  if (cmd.op === 'C') {
    const [x1, y1] = at(cmd.x1, cmd.y1)
    const [x2, y2] = at(cmd.x2, cmd.y2)
    const [x, y] = at(cmd.x, cmd.y)
    return { op: 'C', x1, y1, x2, y2, x, y }
  }
  const [x, y] = at(cmd.x, cmd.y)
  return { op: cmd.op, x, y }
}
