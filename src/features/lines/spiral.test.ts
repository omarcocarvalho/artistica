import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SPIRAL_CORNERS } from '../../shared/model/lines'
import { goldenSpiral, KAPPA, SPIRAL_ARCS } from './spiral'
import type { PathCmd } from './types'

type Cubic = Extract<PathCmd, { op: 'C' }>
interface Pt {
  readonly x: number
  readonly y: number
}

const PHI = (1 + Math.sqrt(5)) / 2
const dim = fc.double({ min: 1, max: 1000, noNaN: true })
const frames = fc.record({ w: dim, h: dim })

const ends = (cmds: readonly PathCmd[]) => cmds.map((c) => [c.x, c.y])
const points = (cmds: readonly PathCmd[]): Pt[] =>
  cmds.flatMap((c) =>
    c.op === 'C'
      ? [
          { x: c.x1, y: c.y1 },
          { x: c.x2, y: c.y2 },
          { x: c.x, y: c.y },
        ]
      : [{ x: c.x, y: c.y }],
  )
const arcs = (cmds: readonly PathCmd[]): Cubic[] => cmds.flatMap((c) => (c.op === 'C' ? [c] : []))
const bezier = (p0: Pt, c: Cubic, t: number): Pt => {
  const s = 1 - t
  const a = s * s * s
  const b = 3 * s * s * t
  const d = 3 * s * t * t
  const e = t * t * t
  return {
    x: a * p0.x + b * c.x1 + d * c.x2 + e * c.x,
    y: a * p0.y + b * c.y1 + d * c.y2 + e * c.y,
  }
}
const mapPoints = (cmds: readonly PathCmd[], f: (p: Pt) => Pt): Pt[] => points(cmds).map(f)

describe('goldenSpiral', () => {
  it('reproduces the mockup spiral for a 300 × 400 frame starting top right', () => {
    const e = ends(goldenSpiral('topRight', { w: 300, h: 400 })).slice(0, 6)
    const want = [
      [300, 0],
      [0, 247.2],
      [185.4, 400],
      [300, 305.6],
      [229.2, 247.2],
      [185.4, 283.3],
    ]
    expect(e).toHaveLength(want.length)
    e.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(want[i]?.[0] ?? Number.NaN, 1)
      expect(y).toBeCloseTo(want[i]?.[1] ?? Number.NaN, 1)
    })
  })

  it.each([
    { w: 300, h: 400 },
    { w: 400, h: 300 },
    { w: 200, h: 200 },
  ])('starts with M at the chosen corner and then has 12 cubic arcs ($w × $h)', (frame) => {
    const { w, h } = frame
    const at: Record<(typeof SPIRAL_CORNERS)[number], number[]> = {
      topLeft: [0, 0],
      topRight: [w, 0],
      bottomLeft: [0, h],
      bottomRight: [w, h],
    }
    for (const corner of SPIRAL_CORNERS) {
      const s = goldenSpiral(corner, frame)
      expect(s[0]?.op).toBe('M')
      expect(ends(s)[0]).toEqual(at[corner])
      expect(s.slice(1).every((c) => c.op === 'C')).toBe(true)
      expect(s).toHaveLength(1 + SPIRAL_ARCS)
    }
    expect(SPIRAL_ARCS).toBe(12)
  })

  it('leaves the corner along the short edge', () => {
    const portrait = goldenSpiral('topLeft', { w: 300, h: 400 })[1]
    expect(portrait?.op === 'C' && portrait.y1).toBe(0)
    expect(portrait?.op === 'C' && portrait.x1).toBeGreaterThan(0)
    const landscape = goldenSpiral('topLeft', { w: 400, h: 300 })[1]
    expect(landscape?.op === 'C' && landscape.x1).toBe(0)
    expect(landscape?.op === 'C' && landscape.y1).toBeGreaterThan(0)
  })

  it('a square frame uses the landscape construction', () => {
    const square = goldenSpiral('topLeft', { w: 200, h: 200 })[1]
    expect(square?.op === 'C' && square.x1).toBe(0)
    expect(square?.op === 'C' && square.y1).toBeGreaterThan(0)
  })

  it('ends the first arc on the golden line of the long side', () => {
    const portrait = goldenSpiral('topLeft', { w: 300, h: 400 })[1]
    expect(portrait?.x).toBeCloseTo(300, 9)
    expect(portrait?.y).toBeCloseTo(400 / PHI, 9)
    const landscape = goldenSpiral('topLeft', { w: 400, h: 300 })[1]
    expect(landscape?.x).toBeCloseTo(400 / PHI, 9)
    expect(landscape?.y).toBeCloseTo(300, 9)
  })

  it('is tangent-continuous: each arc starts where the last ended, tangents parallel', () => {
    fc.assert(
      fc.property(frames, fc.constantFrom(...SPIRAL_CORNERS), (frame, corner) => {
        const cmds = goldenSpiral(corner, frame)
        const a = arcs(cmds)
        for (let i = 1; i < a.length; i++) {
          const prev = a[i - 1]
          const next = a[i]
          if (prev === undefined || next === undefined) throw new Error('missing arc')
          const inX = prev.x - prev.x2
          const inY = prev.y - prev.y2
          const outX = next.x1 - prev.x
          const outY = next.y1 - prev.y
          const cross = inX * outY - inY * outX
          const scale = Math.hypot(inX, inY) * Math.hypot(outX, outY)
          expect(Math.abs(cross) / scale).toBeLessThan(1e-9)
          expect(inX * outX + inY * outY).toBeGreaterThan(0)
        }
      }),
    )
  })

  it('shrinks every arc by 1/φ (canonical frame 1 × φ)', () => {
    const cmds = goldenSpiral('topRight', { w: 1, h: PHI })
    const e = ends(cmds)
    const chords = e.slice(1).map(([x, y], i) => {
      const [px, py] = e[i] ?? [Number.NaN, Number.NaN]
      return Math.hypot(
        (x ?? Number.NaN) - (px ?? Number.NaN),
        (y ?? Number.NaN) - (py ?? Number.NaN),
      )
    })
    expect(chords).toHaveLength(SPIRAL_ARCS)
    expect(chords[0]).toBeCloseTo(Math.SQRT2, 12)
    for (let i = 1; i < chords.length; i++) {
      expect((chords[i] ?? Number.NaN) / (chords[i - 1] ?? Number.NaN)).toBeCloseTo(1 / PHI, 9)
    }
  })

  it('the four corners are mirror images', () => {
    fc.assert(
      fc.property(frames, (frame) => {
        const { w, h } = frame
        const tl = goldenSpiral('topLeft', frame)
        const close = (got: readonly Pt[], want: readonly Pt[]) => {
          expect(got).toHaveLength(want.length)
          got.forEach((p, i) => {
            expect(p.x).toBeCloseTo(want[i]?.x ?? Number.NaN, 9)
            expect(p.y).toBeCloseTo(want[i]?.y ?? Number.NaN, 9)
          })
        }
        close(
          points(goldenSpiral('topRight', frame)),
          mapPoints(tl, (p) => ({ x: w - p.x, y: p.y })),
        )
        close(
          points(goldenSpiral('bottomLeft', frame)),
          mapPoints(tl, (p) => ({ x: p.x, y: h - p.y })),
        )
        close(
          points(goldenSpiral('bottomRight', frame)),
          mapPoints(tl, (p) => ({ x: w - p.x, y: h - p.y })),
        )
      }),
    )
  })

  it('stays inside the frame: every end and control point (convex hull ⇒ the curve)', () => {
    fc.assert(
      fc.property(frames, fc.constantFrom(...SPIRAL_CORNERS), ({ w, h }, corner) => {
        for (const p of points(goldenSpiral(corner, { w, h }))) {
          expect(p.x).toBeGreaterThanOrEqual(-1e-9)
          expect(p.x).toBeLessThanOrEqual(w + 1e-9)
          expect(p.y).toBeGreaterThanOrEqual(-1e-9)
          expect(p.y).toBeLessThanOrEqual(h + 1e-9)
        }
      }),
    )
  })

  it('a cubic quarter arc stays within 0.03% of the circle', () => {
    expect(KAPPA).toBeCloseTo((4 / 3) * (Math.SQRT2 - 1), 15)
    const cmds = goldenSpiral('topRight', { w: 1, h: PHI })
    const first = cmds[1]
    if (first?.op !== 'C') throw new Error('expected an arc')
    let worst = 0
    for (let i = 0; i <= 1000; i++) {
      const p = bezier({ x: 1, y: 0 }, first, i / 1000)
      worst = Math.max(worst, Math.abs(Math.hypot(p.x - 1, p.y - 1) - 1))
    }
    expect(worst).toBeLessThan(3e-4)
    expect(worst).toBeGreaterThan(2e-4)
  })

  it('is deterministic and stays within the per-tile command budget', () => {
    const a = goldenSpiral('bottomRight', { w: 123.4, h: 56.7 })
    expect(goldenSpiral('bottomRight', { w: 123.4, h: 56.7 })).toEqual(a)
    expect(a.length).toBeLessThanOrEqual(13)
  })
})
