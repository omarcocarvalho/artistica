import type { PathCmd } from '../types'

export interface Pt {
  readonly x: number
  readonly y: number
}

export interface Seg {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

/** Every end point and every Bézier control point, in command order. */
export function points(cmds: readonly PathCmd[]): Pt[] {
  return cmds.flatMap((c) =>
    c.op === 'C'
      ? [
          { x: c.x1, y: c.y1 },
          { x: c.x2, y: c.y2 },
          { x: c.x, y: c.y },
        ]
      : [{ x: c.x, y: c.y }],
  )
}

/** The straight segments drawn by 'L' commands, each from the current point to its end. */
export function segments(cmds: readonly PathCmd[]): Seg[] {
  const out: Seg[] = []
  let at: Pt | null = null
  for (const c of cmds) {
    if (c.op === 'L' && at !== null) out.push({ x1: at.x, y1: at.y, x2: c.x, y2: c.y })
    at = { x: c.x, y: c.y }
  }
  return out
}

/** The commands split into subpaths, each starting at its 'M'. */
export function subpaths(cmds: readonly PathCmd[]): PathCmd[][] {
  const out: PathCmd[][] = []
  for (const c of cmds) {
    const last = out.at(-1)
    if (c.op === 'M' || last === undefined) out.push([c])
    else last.push(c)
  }
  return out
}
