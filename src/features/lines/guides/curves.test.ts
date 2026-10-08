import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { PathCmd } from '../types'
import { circlePath } from './curves'

type Cubic = Extract<PathCmd, { op: 'C' }>

function at(from: { x: number; y: number }, c: Cubic, t: number): { x: number; y: number } {
  const s = 1 - t
  const a = s * s * s
  const b = 3 * s * s * t
  const d = 3 * s * t * t
  const e = t * t * t
  return {
    x: a * from.x + b * c.x1 + d * c.x2 + e * c.x,
    y: a * from.y + b * c.y1 + d * c.y2 + e * c.y,
  }
}

function maxRelativeError(cx: number, cy: number, r: number): number {
  const cmds = circlePath(cx, cy, r)
  let worst = 0
  for (let i = 1; i < cmds.length; i++) {
    const prev = cmds[i - 1]
    const c = cmds[i]
    if (prev === undefined || c?.op !== 'C') throw new Error('expected a cubic after a point')
    for (let k = 0; k <= 64; k++) {
      const p = at(prev, c, k / 64)
      worst = Math.max(worst, Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) / r)
    }
  }
  return worst
}

describe('circlePath', () => {
  it('circlePath starts at the top and runs clockwise with four quarter arcs', () => {
    const c = circlePath(10, 20, 5)
    expect(c[0]).toEqual({ op: 'M', x: 10, y: 15 })
    expect(c.slice(1).map((p) => p.op)).toEqual(['C', 'C', 'C', 'C'])
    expect(c.map((p) => [p.x, p.y]).slice(1)).toEqual([
      [15, 20],
      [10, 25],
      [5, 20],
      [10, 15],
    ])
  })

  it('leaves each end along the tangent, clockwise with y down', () => {
    const [, first] = circlePath(0, 0, 1)
    if (first?.op !== 'C') throw new Error('expected a cubic')
    expect(first.x1).toBeGreaterThan(0)
    expect(first.y1).toBeCloseTo(-1, 12)
    expect(first.x2).toBeCloseTo(1, 12)
    expect(first.y2).toBeLessThan(0)
  })

  it('stays within 0.03% of the true radius (sampled)', () => {
    expect(maxRelativeError(10, 20, 5)).toBeLessThan(3e-4)
    fc.assert(
      fc.property(
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: 0.01, max: 1e4, noNaN: true }),
        (cx, cy, r) => {
          expect(maxRelativeError(cx, cy, r)).toBeLessThan(3e-4)
        },
      ),
    )
  })
})
