import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  compareCandidates,
  evaluateTarget,
  searchOrientation,
  type Candidate,
  type Prepared,
} from './compute-layout'
import { sizeRange } from './sizing'
import { itemsArb } from './test-support/arbitraries'
import { item } from './test-support/fixtures'

const CONTENT = { w: 190, h: 277 }
const prepare = (items: Parameters<typeof sizeRange>[0][]): Prepared[] =>
  items.map((it) => ({ item: it, range: sizeRange(it, 6, CONTENT) }))

const cand = (pageCount: number, minShort: number, fill: number): Candidate => ({
  target: 0,
  widths: [],
  packed: [],
  pageCount,
  minShort,
  fill,
})

describe('compareCandidates', () => {
  it('prefers fewer pages, then a larger smallest tile, then a higher fill', () => {
    expect(compareCandidates(cand(1, 60, 0.1), cand(2, 90, 0.9))).toBeLessThan(0)
    expect(compareCandidates(cand(2, 90, 0.1), cand(2, 60, 0.9))).toBeLessThan(0)
    expect(compareCandidates(cand(2, 60, 0.9), cand(2, 60, 0.1))).toBeLessThan(0)
  })
  it('treats differences below the score epsilons as ties', () => {
    expect(compareCandidates(cand(1, 60, 0.5), cand(1, 60 + 1e-9, 0.5 + 1e-12))).toBe(0)
  })
})

describe('evaluateTarget', () => {
  it('puts every item at its minimum for target 0 and at its maximum for a huge target', () => {
    const prepared = prepare([item('a', 1.5, 150), item('b', 1, 70)])
    expect(evaluateTarget(prepared, 0, CONTENT, 6).widths).toEqual([90, 60])
    expect(evaluateTarget(prepared, 1e6, CONTENT, 6).widths).toEqual([150, 70])
  })
  it('reports the smallest printed short side and the fill ratio', () => {
    const c = evaluateTarget(prepare([item('a', 1.5, 90)]), 0, CONTENT, 6)
    expect(c.pageCount).toBe(1)
    expect(c.minShort).toBe(60)
    expect(c.fill).toBeCloseTo((90 * 60) / (190 * 277), 12)
  })
})

describe('searchOrientation', () => {
  it('never needs more pages than the all-minimum packing (property)', () => {
    fc.assert(
      fc.property(itemsArb(12, 1), (items) => {
        fc.pre(items.length > 0)
        const prepared = prepare(items)
        const p0 = evaluateTarget(prepared, 0, CONTENT, 6).pageCount
        const best = searchOrientation(prepared, CONTENT, 6)
        expect(best.pageCount).toBeLessThanOrEqual(p0)
        expect(best.minShort).toBeGreaterThanOrEqual(
          evaluateTarget(prepared, 0, CONTENT, 6).minShort - 1e-9,
        )
      }),
      { numRuns: 100 },
    )
  })
  it('returns the all-maximum packing when it fits the same pages', () => {
    const best = searchOrientation(prepare([item('a', 1, 100)]), CONTENT, 6)
    expect(best.widths).toEqual([100])
  })
  it('returns the floor when nothing can grow (all fixed)', () => {
    const best = searchOrientation(
      prepare([item('a', 1, 100, { kind: 'fixed', axis: 'width', mm: 50 })]),
      CONTENT,
      6,
    )
    expect(best.target).toBe(0)
  })
})
