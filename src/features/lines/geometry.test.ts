import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  armaturePaths,
  centreDashMm,
  centreDashPhaseMm,
  centrePaths,
  goldenPaths,
  GOLDEN_FRACTIONS,
  gridPaths,
  PHI,
  thirdsPaths,
} from './geometry'
import { points, segments, subpaths, type Seg } from './test-support/paths'
import { clearGaps, wholeGaps } from './test-support/dash'
import type { FrameSize, PathCmd } from './types'

const frame = { w: 300, h: 400 }
const dim = fc.double({ min: 1, max: 1000, noNaN: true })
const count = fc.integer({ min: 1, max: 20 })

const verticalXs = (cmds: readonly PathCmd[]) =>
  segments(cmds)
    .filter((s) => s.x1 === s.x2)
    .map((s) => s.x1)
const horizontalYs = (cmds: readonly PathCmd[]) =>
  segments(cmds)
    .filter((s) => s.y1 === s.y2)
    .map((s) => s.y1)

const generators: readonly [string, (f: FrameSize) => PathCmd[]][] = [
  ['grid 4 × 5', (f) => gridPaths(4, 5, f)],
  ['thirds', thirdsPaths],
  ['armature', armaturePaths],
  ['golden', goldenPaths],
  ['centre', centrePaths],
]

describe('constants', () => {
  it('PHI is the golden ratio and the golden fractions are 1/φ² and 1/φ', () => {
    expect(PHI).toBeCloseTo(1.6180339887, 9)
    expect(PHI * PHI).toBeCloseTo(PHI + 1, 12)
    expect(GOLDEN_FRACTIONS[0]).toBeCloseTo(0.381966, 6)
    expect(GOLDEN_FRACTIONS[1]).toBeCloseTo(0.618034, 6)
    expect(GOLDEN_FRACTIONS[0] + GOLDEN_FRACTIONS[1]).toBeCloseTo(1, 12)
  })
})

describe('thirds', () => {
  it('puts the thirds at exactly 1/3 and 2/3 (spec §7)', () => {
    expect(verticalXs(thirdsPaths(frame))).toEqual([100, 200])
    expect(horizontalYs(thirdsPaths(frame))).toEqual([400 / 3, 800 / 3])
  })
  it('draws the verticals left to right, then the horizontals top to bottom, edge to edge', () => {
    expect(thirdsPaths(frame)).toEqual([
      { op: 'M', x: 100, y: 0 },
      { op: 'L', x: 100, y: 400 },
      { op: 'M', x: 200, y: 0 },
      { op: 'L', x: 200, y: 400 },
      { op: 'M', x: 0, y: 400 / 3 },
      { op: 'L', x: 300, y: 400 / 3 },
      { op: 'M', x: 0, y: 800 / 3 },
      { op: 'L', x: 300, y: 800 / 3 },
    ])
  })
})

describe('golden ratio', () => {
  it('puts the golden lines at 1/φ² and 1/φ, as the mockup (114.6 / 185.4 of 300)', () => {
    const xs = verticalXs(goldenPaths(frame))
    const ys = horizontalYs(goldenPaths(frame))
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeCloseTo(114.59, 2)
    expect(xs[1]).toBeCloseTo(185.41, 2)
    expect(ys).toHaveLength(2)
    expect(ys[0]).toBeCloseTo(152.79, 2)
    expect(ys[1]).toBeCloseTo(247.21, 2)
  })
  it('draws the verticals left to right, then the horizontals top to bottom, edge to edge', () => {
    const [a, b] = GOLDEN_FRACTIONS
    expect(goldenPaths(frame)).toEqual([
      { op: 'M', x: a * 300, y: 0 },
      { op: 'L', x: a * 300, y: 400 },
      { op: 'M', x: b * 300, y: 0 },
      { op: 'L', x: b * 300, y: 400 },
      { op: 'M', x: 0, y: a * 400 },
      { op: 'L', x: 300, y: a * 400 },
      { op: 'M', x: 0, y: b * 400 },
      { op: 'L', x: 300, y: b * 400 },
    ])
  })
  it('is mirror-symmetric: the two lines on each axis sum to the side', () => {
    fc.assert(
      fc.property(dim, dim, (w, h) => {
        const g = goldenPaths({ w, h })
        const [x0 = NaN, x1 = NaN] = verticalXs(g)
        const [y0 = NaN, y1 = NaN] = horizontalYs(g)
        expect(x0 + x1).toBeCloseTo(w, 9)
        expect(y0 + y1).toBeCloseTo(h, 9)
        expect(x0).toBeLessThan(x1)
        expect(y0).toBeLessThan(y1)
      }),
    )
  })
})

describe('grid', () => {
  it('draws cols − 1 and rows − 1 interior grid lines, none on the edges', () => {
    expect(verticalXs(gridPaths(4, 5, frame))).toEqual([75, 150, 225])
    expect(horizontalYs(gridPaths(4, 5, frame))).toEqual([80, 160, 240, 320])
    expect(gridPaths(1, 1, frame)).toEqual([])
  })
  it('a 1 × N grid draws only horizontals, an N × 1 grid only verticals', () => {
    expect(verticalXs(gridPaths(1, 2, frame))).toEqual([])
    expect(horizontalYs(gridPaths(1, 2, frame))).toEqual([200])
    expect(verticalXs(gridPaths(2, 1, frame))).toEqual([150])
    expect(horizontalYs(gridPaths(2, 1, frame))).toEqual([])
  })
  it('a 3 × 3 grid equals the thirds (no deduplication)', () => {
    expect(gridPaths(3, 3, frame)).toEqual(thirdsPaths(frame))
    fc.assert(
      fc.property(dim, dim, (w, h) => {
        expect(gridPaths(3, 3, { w, h })).toEqual(thirdsPaths({ w, h }))
      }),
    )
  })
  it('a 20 × 20 grid has 76 commands', () => {
    expect(gridPaths(20, 20, frame)).toHaveLength(76)
  })
  it('divides the frame into equal cells, in order, strictly inside the frame (property)', () => {
    fc.assert(
      fc.property(dim, dim, count, count, (w, h, cols, rows) => {
        const g = gridPaths(cols, rows, { w, h })
        const xs = verticalXs(g)
        const ys = horizontalYs(g)
        expect(g).toHaveLength(2 * (cols - 1 + rows - 1))
        expect(xs).toHaveLength(cols - 1)
        expect(ys).toHaveLength(rows - 1)
        xs.forEach((x, i) => {
          expect(x).toBeCloseTo(((i + 1) * w) / cols, 9)
          expect(x).toBeGreaterThan(0)
          expect(x).toBeLessThan(w)
        })
        ys.forEach((y, i) => {
          expect(y).toBeCloseTo(((i + 1) * h) / rows, 9)
          expect(y).toBeGreaterThan(0)
          expect(y).toBeLessThan(h)
        })
      }),
    )
  })
})

describe('centre lines', () => {
  it('draws the vertical (top to bottom), then the horizontal (left to right)', () => {
    expect(centrePaths(frame)).toEqual([
      { op: 'M', x: 150, y: 0 },
      { op: 'L', x: 150, y: 400 },
      { op: 'M', x: 0, y: 200 },
      { op: 'L', x: 300, y: 200 },
    ])
  })
  it('dashes the centre lines 6 : 4 times the width, floored, on a large tile', () => {
    expect(centreDashMm(0.35, 100)[0]).toBeCloseTo(2.1, 9)
    expect(centreDashMm(0.35, 100)[1]).toBeCloseTo(1.4, 9)
    expect(centreDashMm(0.1, 100)).toEqual([1.5, 1])
    expect(centreDashMm(2, 100)).toEqual([12, 8])
  })
  it('floors the dash and the gap separately', () => {
    expect(centreDashMm(0.2, 100)).toEqual([1.5, 1])
    expect(centreDashMm(0.3, 100)[0]).toBeCloseTo(1.8, 9)
    expect(centreDashMm(0.3, 100)[1]).toBeCloseTo(1.2, 9)
  })

  const table: readonly [w: number, short: number, dash: readonly [number, number]][] = [
    [0.35, 100, [2.1, 1.4]],
    [2, 100, [12, 8]],
    [2, 60, [12, 8]],
    [2, 30, [6, 4]],
    [2, 12, [3, 2]],
    [2, 6, [3, 2]],
    [1.5, 30, [6, 4]],
    [1, 15, [3, 2]],
    [0.5, 9, [1.8, 1.2]],
    [0.35, 6, [1.5, 1]],
    [0.2, 3, [1.5, 1]],
    [0.1, 3, [1.5, 1]],
  ]
  it.each(table)(
    'scales the dash down to a third of the tile, never below the floor period: (%f, %f)',
    (w, short, [dash, gap]) => {
      const got = centreDashMm(w, short)
      expect(got[0]).toBeCloseTo(dash, 9)
      expect(got[1]).toBeCloseTo(gap, 9)
    },
  )

  const m3 = (w: number) => [Math.max(1.5, 6 * w), Math.max(1, 4 * w)] as const
  const widths = fc.double({ min: 0.1, max: 2, noNaN: true })
  const shorts = fc.double({ min: 1, max: 500, noNaN: true })

  it('whenever a third of the short side is at least the floor, the period is min(M3 period, short / 3) (property)', () => {
    fc.assert(
      fc.property(widths, shorts, (w, short) => {
        fc.pre(short / 3 >= Math.max(2.5, 2.5 * w))
        const [dash, gap] = centreDashMm(w, short)
        const [m3Dash, m3Gap] = m3(w)
        expect(dash + gap).toBeCloseTo(Math.min(m3Dash + m3Gap, short / 3), 9)
        expect(short / 2 / (dash + gap)).toBeGreaterThanOrEqual(1.5 - 1e-9)
      }),
    )
  })

  it('keeps 6 : 4, never exceeds M3’s period, never goes below max(2.5, 2.5 × width) (property)', () => {
    fc.assert(
      fc.property(widths, shorts, (w, short) => {
        const [dash, gap] = centreDashMm(w, short)
        const [m3Dash, m3Gap] = m3(w)
        expect(dash / gap).toBeCloseTo(1.5, 9)
        expect(dash + gap).toBeLessThanOrEqual(m3Dash + m3Gap + 1e-9)
        expect(dash + gap).toBeGreaterThanOrEqual(Math.max(2.5, 2.5 * w) - 1e-9)
      }),
    )
  })

  it('is M3’s dash, byte for byte, when the short side is exactly 30 × the width', () => {
    for (const w of [0.267, 0.273, 0.284, 0.33854076898706387, 0.4217086561216765])
      expect(centreDashMm(w, 30 * w)).toEqual(m3(w))
    fc.assert(
      fc.property(widths, (w) => {
        expect(centreDashMm(w, 30 * w)).toEqual(m3(w))
      }),
    )
  })

  it('scales the dash on a tile a hair under 30 × the width', () => {
    const [dash, gap] = centreDashMm(2, 60 * (1 - 1e-9))
    expect(dash + gap).toBeLessThan(20)
    expect(dash + gap).toBeCloseTo(20, 6)
  })

  it('is M3’s dash, exactly, on every tile whose short side is at least 30 × the width (property)', () => {
    fc.assert(
      fc.property(widths, shorts, (w, short) => {
        fc.pre(short >= 30 * w)
        expect(centreDashMm(w, short)).toEqual(m3(w))
      }),
    )
  })
})

describe('centre dash phase', () => {
  const widths = fc.double({ min: 0.1, max: 2, noNaN: true })
  const sides = fc.double({ min: 1, max: 1000, noNaN: true })
  const mod = (a: number, m: number) => ((a % m) + m) % m

  it('the 12 × 8 mm tile at 2 mm: the 8 mm line gets the phase that centres a dash on the crossing, the 12 mm line keeps 0', () => {
    const [dash, gap] = centreDashMm(2, 8)
    expect(dash).toBeCloseTo(3, 9)
    expect(gap).toBeCloseTo(2, 9)
    expect(clearGaps(8, dash, gap, 0, 4, 2)).toEqual({ before: 0, after: 0 })
    const phase = centreDashPhaseMm(8, dash, gap, 4, 2)
    expect(phase).toBeCloseTo(2.5, 9)
    expect(clearGaps(8, dash, gap, phase, 4, 2)).toEqual({ before: 1, after: 1 })
    expect(
      wholeGaps(8, dash, gap, phase).map(([a, b]) => [a, b].map((v) => +v.toFixed(9))),
    ).toEqual([
      [0.5, 2.5],
      [5.5, 7.5],
    ])
    expect(centreDashPhaseMm(12, dash, gap, 6, 2)).toBe(0)
  })

  it('a 20 mm tile at 2 mm keeps phase 0 on both lines', () => {
    const [dash, gap] = centreDashMm(2, 20)
    for (const length of [20, 26.67])
      expect(centreDashPhaseMm(length, dash, gap, length / 2, 2)).toBe(0)
  })

  it('is 0 exactly when phase 0 leaves a whole gap off the crossing, on each side whose half-line holds a period (property)', () => {
    fc.assert(
      fc.property(widths, sides, sides, (w, short, length) => {
        fc.pre(short <= length)
        const [dash, gap] = centreDashMm(w, short)
        const period = dash + gap
        const half = length / 2
        const { before, after } = clearGaps(length, dash, gap, 0, half, w)
        const meets =
          before + after > 0 && (half < period || before > 0) && (half < period || after > 0)
        const phase = centreDashPhaseMm(length, dash, gap, half, w)
        expect(phase === 0).toBe(meets)
      }),
    )
  })

  it('otherwise centres a dash on the crossing, with a phase in [0, period) (property)', () => {
    fc.assert(
      fc.property(
        widths,
        sides,
        sides,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (w, short, length, at) => {
          const [dash, gap] = centreDashMm(w, short)
          const period = dash + gap
          const crossAt = at * length
          const phase = centreDashPhaseMm(length, dash, gap, crossAt, w)
          expect(phase).toBeGreaterThanOrEqual(0)
          expect(phase).toBeLessThan(period)
          if (phase !== 0) {
            const pos = mod(crossAt + phase, period)
            expect(
              Math.min(Math.abs(pos - dash / 2), period - Math.abs(pos - dash / 2)),
            ).toBeLessThan(1e-9 * (1 + length))
          }
        },
      ),
    )
  })

  it('a centred dash covers the crossing, so the gaps either side of it clear the crossing line (property)', () => {
    fc.assert(
      fc.property(widths, sides, (w, short) => {
        const [dash] = centreDashMm(w, short)
        expect(dash).toBeGreaterThanOrEqual(w)
      }),
    )
  })
})

describe('armature', () => {
  it('draws the armature: 2 diagonals, 8 corner lines to the far midpoints, the rhombus', () => {
    const a = armaturePaths(frame)
    expect(a).toHaveLength(25)
    expect(a.slice(20)).toEqual([
      { op: 'M', x: 150, y: 0 },
      { op: 'L', x: 300, y: 200 },
      { op: 'L', x: 150, y: 400 },
      { op: 'L', x: 0, y: 200 },
      { op: 'L', x: 150, y: 0 },
    ])
  })
  it('draws the diagonals and corner lines in the contract order', () => {
    const segs = segments(armaturePaths(frame)).slice(0, 10)
    expect(segs).toEqual([
      { x1: 0, y1: 0, x2: 300, y2: 400 },
      { x1: 300, y1: 0, x2: 0, y2: 400 },
      { x1: 0, y1: 0, x2: 300, y2: 200 },
      { x1: 0, y1: 0, x2: 150, y2: 400 },
      { x1: 300, y1: 0, x2: 0, y2: 200 },
      { x1: 300, y1: 0, x2: 150, y2: 400 },
      { x1: 0, y1: 400, x2: 300, y2: 200 },
      { x1: 0, y1: 400, x2: 150, y2: 0 },
      { x1: 300, y1: 400, x2: 0, y2: 200 },
      { x1: 300, y1: 400, x2: 150, y2: 0 },
    ])
  })
  it('each corner line ends at the midpoint of a side that does not touch its corner', () => {
    const w = frame.w
    const h = frame.h
    for (const s of segments(armaturePaths(frame)).slice(2, 10)) {
      const onSideThroughStart =
        (s.x2 === s.x1 && (s.x1 === 0 || s.x1 === w)) ||
        (s.y2 === s.y1 && (s.y1 === 0 || s.y1 === h))
      expect(onSideThroughStart).toBe(false)
      const atMidpoint =
        (s.x2 === w / 2 && (s.y2 === 0 || s.y2 === h)) ||
        (s.y2 === h / 2 && (s.x2 === 0 || s.x2 === w))
      expect(atMidpoint).toBe(true)
    }
  })
  it('the armature is symmetric under both mirrors (property)', () => {
    fc.assert(
      fc.property(dim, dim, (w, h) => {
        const key = (s: Seg) => [s.x1, s.y1, s.x2, s.y2].map((n) => n.toFixed(6)).join()
        const segs = segments(armaturePaths({ w, h }))
        const set = new Set(
          segs.flatMap((s) => [key(s), key({ x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 })]),
        )
        for (const s of segs) {
          expect(set.has(key({ x1: w - s.x1, y1: s.y1, x2: w - s.x2, y2: s.y2 }))).toBe(true)
          expect(set.has(key({ x1: s.x1, y1: h - s.y1, x2: s.x2, y2: h - s.y2 }))).toBe(true)
        }
      }),
    )
  })
})

describe('every generator', () => {
  it('every point is inside the frame (property)', () => {
    fc.assert(
      fc.property(dim, dim, count, count, (w, h, c, r) => {
        const f = { w, h }
        for (const cmds of [
          gridPaths(c, r, f),
          thirdsPaths(f),
          armaturePaths(f),
          goldenPaths(f),
          centrePaths(f),
        ])
          for (const p of points(cmds)) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
            expect(p.x).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(w)
            expect(p.y).toBeGreaterThanOrEqual(0)
            expect(p.y).toBeLessThanOrEqual(h)
          }
      }),
    )
  })
  it.each(generators)(
    '%s: every subpath starts with M and is otherwise straight lines',
    (_, gen) => {
      const cmds = gen(frame)
      expect(cmds[0]?.op).toBe('M')
      for (const sp of subpaths(cmds)) {
        expect(sp[0]?.op).toBe('M')
        expect(sp.length).toBeGreaterThanOrEqual(2)
        expect(sp.slice(1).every((c) => c.op === 'L')).toBe(true)
      }
    },
  )
  it.each(generators)('%s: two-point segments, except the rhombus', (name, gen) => {
    const lengths = subpaths(gen(frame)).map((sp) => sp.length)
    if (name === 'armature') expect(lengths).toEqual([...Array<number>(10).fill(2), 5])
    else expect(lengths.every((n) => n === 2)).toBe(true)
  })
  it.each(generators)('%s: is deterministic', (_, gen) => {
    expect(gen(frame)).toEqual(gen({ ...frame }))
  })
})
