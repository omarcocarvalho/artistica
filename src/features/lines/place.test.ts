import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Rotation } from '../../shared/model/image'
import type { RectMm } from '../layout/types'
import { drawTilesFor } from '../render/page-model/build-page-models'
import { applyMatrix, orientMatrix } from '../render/pixels/tile-plan'
import { descriptor, placement } from '../render/test-support/fixtures'
import type { DrawTile } from '../render/types'
import { frameOf, frameToPage } from './place'
import type { PathCmd } from './types'

const trim = { x: 10, y: 20, w: 40, h: 30 }

const anyTrim = fc.record({
  x: fc.double({ min: -500, max: 500, noNaN: true }),
  y: fc.double({ min: -500, max: 500, noNaN: true }),
  w: fc.double({ min: 1, max: 1000, noNaN: true }),
  h: fc.double({ min: 1, max: 1000, noNaN: true }),
})
const unit = fc.double({ min: 0, max: 1, noNaN: true })

/** The inverse of frameToPage for one point, derived independently of the implementation. */
function pageToFrame(x: number, y: number, t: RectMm, turned: boolean): [number, number] {
  return turned ? [y - t.y, t.x + t.w - x] : [x - t.x, y - t.y]
}

describe('frameOf', () => {
  it('frameOf swaps the sides when turned', () => {
    expect(frameOf(trim, false)).toEqual({ w: 40, h: 30 })
    expect(frameOf(trim, true)).toEqual({ w: 30, h: 40 })
  })
})

describe('frameToPage', () => {
  it('not turned is a translation', () => {
    expect(frameToPage({ op: 'L', x: 5, y: 7 }, trim, false)).toEqual({ op: 'L', x: 15, y: 27 })
    expect(frameToPage({ op: 'M', x: 0, y: 0 }, trim, false)).toEqual({ op: 'M', x: 10, y: 20 })
    expect(frameToPage({ op: 'M', x: 40, y: 30 }, trim, false)).toEqual({ op: 'M', x: 50, y: 50 })
  })
  it("turned maps the frame's corners clockwise onto the trim", () => {
    const at = (x: number, y: number) => frameToPage({ op: 'M', x, y }, trim, true)
    expect(at(0, 0)).toEqual({ op: 'M', x: 50, y: 20 })
    expect(at(30, 0)).toEqual({ op: 'M', x: 50, y: 50 })
    expect(at(30, 40)).toEqual({ op: 'M', x: 10, y: 50 })
    expect(at(0, 40)).toEqual({ op: 'M', x: 10, y: 20 })
  })
  it('keeps the op of M and L', () => {
    expect(frameToPage({ op: 'M', x: 1, y: 2 }, trim, true).op).toBe('M')
    expect(frameToPage({ op: 'L', x: 1, y: 2 }, trim, true).op).toBe('L')
  })
  it('maps Bézier control points with the same map', () => {
    const c: PathCmd = { op: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }
    for (const turned of [false, true]) {
      const asPoint = (x: number, y: number) => frameToPage({ op: 'M', x, y }, trim, turned)
      const p1 = asPoint(1, 2)
      const p2 = asPoint(3, 4)
      const p = asPoint(5, 6)
      expect(frameToPage(c, trim, turned)).toEqual({
        op: 'C',
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        x: p.x,
        y: p.y,
      })
    }
    expect(frameToPage(c, trim, true)).toEqual({
      op: 'C',
      x1: 48,
      y1: 21,
      x2: 46,
      y2: 23,
      x: 44,
      y: 25,
    })
  })
  it('keeps points inside the frame inside the trim, and is invertible (property)', () => {
    fc.assert(
      fc.property(anyTrim, fc.boolean(), unit, unit, (t, turned, fu, fv) => {
        const f = frameOf(t, turned)
        const u = fu * f.w
        const v = fv * f.h
        const p = frameToPage({ op: 'L', x: u, y: v }, t, turned)
        const eps = 1e-9 * (1 + Math.abs(t.x) + Math.abs(t.y) + t.w + t.h)
        expect(p.x).toBeGreaterThanOrEqual(t.x - eps)
        expect(p.x).toBeLessThanOrEqual(t.x + t.w + eps)
        expect(p.y).toBeGreaterThanOrEqual(t.y - eps)
        expect(p.y).toBeLessThanOrEqual(t.y + t.h + eps)
        const [bu, bv] = pageToFrame(p.x, p.y, t, turned)
        expect(Math.abs(bu - u)).toBeLessThan(eps)
        expect(Math.abs(bv - v)).toBeLessThan(eps)
      }),
    )
  })
  it('turned lands on the same picture point as the tile pixels, for every user rotation and flip (property)', () => {
    const rotations = fc.constantFrom<Rotation>(0, 90, 180, 270)
    fc.assert(
      fc.property(
        anyTrim,
        rotations,
        fc.boolean(),
        fc.boolean(),
        unit,
        unit,
        (t, rotation, flipH, flipV, s, r) => {
          const img = descriptor('a', 3000, 2000, { rotation, flipH, flipV })
          const f = frameOf(t, true)
          const asEdited = drawTilesFor(img, placement('a', [{ x: 0, y: 0, ...f }]), 0)[0]
          const onPage = drawTilesFor(img, placement('a', [t], { turned: true }), 0)[0]
          if (asEdited === undefined || onPage === undefined) throw new Error('no tile')
          const pixelAt = (tile: DrawTile, w: number, h: number) =>
            applyMatrix(orientMatrix(tile.rotation, tile.flipH, tile.flipV, 1, 1, w, h, 0), s, r)
          const q = pixelAt(asEdited, f.w, f.h)
          const want = pixelAt(onPage, t.w, t.h)
          const got = frameToPage({ op: 'M', x: q.x, y: q.y }, t, true)
          const eps = 1e-9 * (1 + Math.abs(t.x) + Math.abs(t.y) + t.w + t.h)
          expect(Math.abs(got.x - (t.x + want.x))).toBeLessThan(eps)
          expect(Math.abs(got.y - (t.y + want.y))).toBeLessThan(eps)
        },
      ),
    )
  })
  it("turned is a rotation: it keeps lengths and turns the frame's x axis onto the page's y axis", () => {
    fc.assert(
      fc.property(anyTrim, unit, unit, unit, unit, (t, a, b, c, d) => {
        const f = frameOf(t, true)
        const p = frameToPage({ op: 'M', x: a * f.w, y: b * f.h }, t, true)
        const q = frameToPage({ op: 'M', x: c * f.w, y: d * f.h }, t, true)
        const frameLen = Math.hypot((c - a) * f.w, (d - b) * f.h)
        expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(frameLen, 6)
        const origin = frameToPage({ op: 'M', x: 0, y: 0 }, t, true)
        const ex = frameToPage({ op: 'M', x: 1, y: 0 }, t, true)
        const ey = frameToPage({ op: 'M', x: 0, y: 1 }, t, true)
        expect(ex.x - origin.x).toBeCloseTo(0, 9)
        expect(ex.y - origin.y).toBeCloseTo(1, 9)
        expect(ey.x - origin.x).toBeCloseTo(-1, 9)
        expect(ey.y - origin.y).toBeCloseTo(0, 9)
      }),
    )
  })
})
