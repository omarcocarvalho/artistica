import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  HEURISTICS,
  TURN_POLICIES,
  findSpot,
  occupy,
  packOrders,
  packPages,
  type PackBox,
} from './maxrects'
import { nth } from './nth'
import type { RectMm } from './types'

const BIN: RectMm = { x: 0, y: 0, w: 100, h: 50 }

describe('findSpot', () => {
  it('returns null when nothing fits either way', () => {
    expect(findSpot([BIN], 120, 60, 'bssf')).toBeNull()
  })
  it('turns a box that only fits turned', () => {
    expect(findSpot([BIN], 40, 90, 'bssf')).toMatchObject({
      x: 0,
      y: 0,
      w: 90,
      h: 40,
      turned: true,
    })
  })
  it('prefers unturned on a full tie', () => {
    expect(findSpot([{ x: 0, y: 0, w: 100, h: 100 }], 30, 30, 'bssf')?.turned).toBe(false)
  })
  it('respects the turn policy', () => {
    expect(findSpot([BIN], 20, 40, 'bssf', 'wide')).toMatchObject({ w: 40, h: 20, turned: true })
    expect(findSpot([BIN], 40, 20, 'bssf', 'tall')).toMatchObject({ w: 20, h: 40, turned: true })
    expect(findSpot([BIN], 40, 20, 'bssf', 'wide')?.turned).toBe(false)
  })
  it('scores by heuristic: bssf picks the snug short side, blsf the snug long side', () => {
    const free: RectMm[] = [
      { x: 0, y: 0, w: 32, h: 100 }, // leftover 2 × 80: short 2, long 80
      { x: 50, y: 0, w: 40, h: 25 }, // leftover 10 × 5: short 5, long 10
    ]
    expect(findSpot(free, 30, 20, 'bssf')?.x).toBe(0)
    expect(findSpot(free, 30, 20, 'blsf')?.x).toBe(50)
    expect(findSpot(free, 30, 20, 'baf')?.x).toBe(50)
    expect(findSpot(free, 30, 20, 'tl')?.x).toBe(0)
  })
  it('accepts a box that overshoots by less than EPS', () => {
    expect(findSpot([BIN], 100 + 1e-10, 50, 'bssf')).not.toBeNull()
  })
})

describe('occupy', () => {
  it('splits the free rect into maximal rects around the used one', () => {
    expect(occupy([BIN], { x: 0, y: 0, w: 30, h: 20 })).toEqual([
      { x: 30, y: 0, w: 70, h: 50 },
      { x: 0, y: 20, w: 100, h: 30 },
    ])
  })
  it('keeps free rects that do not intersect', () => {
    const other: RectMm = { x: 200, y: 0, w: 10, h: 10 }
    expect(occupy([BIN, other], { x: 0, y: 0, w: 100, h: 50 })).toEqual([other])
  })
  it('drops pieces contained in others', () => {
    const out = occupy([BIN], { x: 40, y: 10, w: 20, h: 20 })
    for (const a of out) {
      for (const b of out) {
        if (a === b) continue
        const inside = b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h
        expect(inside).toBe(false)
      }
    }
    expect(out).toHaveLength(4)
  })
})

const touches = (a: RectMm, b: RectMm): boolean =>
  a.x < b.x + b.w - 1e-9 &&
  b.x < a.x + a.w - 1e-9 &&
  a.y < b.y + b.h - 1e-9 &&
  b.y < a.y + a.h - 1e-9
const holds = (a: RectMm, b: RectMm): boolean =>
  b.x >= a.x - 1e-9 &&
  b.y >= a.y - 1e-9 &&
  b.x + b.w <= a.x + a.w + 1e-9 &&
  b.y + b.h <= a.y + a.h + 1e-9

describe('free-rect invariants (property)', () => {
  it('stay disjoint from used, never nested, cover every empty cell, and stay small', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ w: fc.integer({ min: 1, max: 40 }), h: fc.integer({ min: 1, max: 40 }) }),
          {
            minLength: 1,
            maxLength: 25,
          },
        ),
        fc.constantFrom(...HEURISTICS),
        (boxes, heuristic) => {
          let free: RectMm[] = [{ x: 0, y: 0, w: 60, h: 60 }]
          const used: RectMm[] = []
          for (const b of boxes) {
            const s = findSpot(free, b.w, b.h, heuristic)
            if (s === null) continue
            const u = { x: s.x, y: s.y, w: s.w, h: s.h }
            free = occupy(free, u)
            used.push(u)
            expect(free.length).toBeLessThanOrEqual(4 * used.length + 4)
            for (const f of free) for (const q of used) expect(touches(f, q)).toBe(false)
            for (const [i, a] of free.entries())
              for (const [j, c] of free.entries()) if (i !== j) expect(holds(a, c)).toBe(false)
            for (let x = 0; x < 60; x += 2)
              for (let y = 0; y < 60; y += 2) {
                const cell = { x, y, w: 1, h: 1 }
                if (used.some((q) => touches(q, cell))) continue
                expect(free.some((f) => holds(f, cell))).toBe(true)
              }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('packOrders', () => {
  it('orders by area then long side, and by long side then area, ties by index', () => {
    const boxes: PackBox[] = [
      { w: 10, h: 10 },
      { w: 30, h: 2 },
      { w: 10, h: 10 },
    ]
    expect(packOrders(boxes)).toEqual([
      [0, 2, 1],
      [1, 0, 2],
    ])
  })
})

describe('packPages', () => {
  it('opens a new page only when a box fits no open page', () => {
    const boxes: PackBox[] = [
      { w: 60, h: 40 },
      { w: 60, h: 40 },
      { w: 30, h: 40 },
    ]
    const out = packPages(boxes, [0, 1, 2], { w: 100, h: 50 }, 0, 'bssf', 'free')
    expect(out?.map((b) => b.page)).toEqual([0, 1, 0])
  })
  it('inflates boxes by the gutter: two 47 mm boxes do not share a 100 mm row with a 6 mm gutter', () => {
    const boxes: PackBox[] = [
      { w: 47, h: 50 },
      { w: 47, h: 50 },
    ]
    expect(packPages(boxes, [0, 1], { w: 100, h: 50 }, 6, 'bssf', 'free')?.[1]).toMatchObject({
      page: 0,
      x: 53,
    })
    const wide: PackBox[] = [
      { w: 48, h: 50 },
      { w: 48, h: 50 },
    ]
    expect(packPages(wide, [0, 1], { w: 100, h: 50 }, 6, 'bssf', 'free')?.[1]?.page).toBe(1)
  })
  it('turns a box on a fresh page against a uniform policy when it only fits that way', () => {
    const out = packPages([{ w: 40, h: 90 }], [0], { w: 100, h: 50 }, 0, 'bssf', 'tall')
    expect(out?.[0]?.turned).toBe(true)
  })
  it('returns null when a box fits no empty page', () => {
    expect(packPages([{ w: 200, h: 200 }], [0], { w: 100, h: 50 }, 0, 'bssf', 'free')).toBeNull()
  })
  it('never overlaps and keeps the gutter (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            w: fc.double({ min: 1, max: 100, noNaN: true }),
            h: fc.double({ min: 1, max: 100, noNaN: true }),
          }),
          {
            minLength: 1,
            maxLength: 30,
          },
        ),
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.constantFrom(...HEURISTICS),
        fc.constantFrom(...TURN_POLICIES),
        (boxes, gutter, heuristic, policy) => {
          const content = { w: 100, h: 100 }
          const out = packPages(boxes, [...boxes.keys()], content, gutter, heuristic, policy)
          if (out === null) throw new Error('every box fits an empty 100×100 page')
          const rects = out.map((p, i) => {
            const b = nth(boxes, i)
            return {
              page: p.page,
              x: p.x,
              y: p.y,
              w: p.turned ? b.h : b.w,
              h: p.turned ? b.w : b.h,
            }
          })
          for (const r of rects) {
            expect(r.x).toBeGreaterThanOrEqual(-1e-9)
            expect(r.y).toBeGreaterThanOrEqual(-1e-9)
            expect(r.x + r.w).toBeLessThanOrEqual(content.w + 1e-6)
            expect(r.y + r.h).toBeLessThanOrEqual(content.h + 1e-6)
          }
          for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
              const a = nth(rects, i)
              const b = nth(rects, j)
              if (a.page !== b.page) continue
              const gap = Math.max(
                b.x - (a.x + a.w),
                a.x - (b.x + b.w),
                b.y - (a.y + a.h),
                a.y - (b.y + b.h),
              )
              expect(gap).toBeGreaterThanOrEqual(gutter - 1e-6)
            }
          }
        },
      ),
    )
  })

  it('first-fit: a box opens page p only when it fit no earlier page (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ w: fc.integer({ min: 1, max: 100 }), h: fc.integer({ min: 1, max: 100 }) }),
          { minLength: 1, maxLength: 30 },
        ),
        fc.integer({ min: 0, max: 10 }),
        fc.constantFrom(...HEURISTICS),
        fc.constantFrom(...TURN_POLICIES),
        (boxes, gutter, heuristic, policy) => {
          const out = packPages(
            boxes,
            [...boxes.keys()],
            { w: 100, h: 100 },
            gutter,
            heuristic,
            policy,
          )
          if (out === null) throw new Error('every box fits an empty page')
          const pages = new Set(out.map((o) => o.page))
          expect(pages.size).toBeLessThanOrEqual(boxes.length)
          const free: RectMm[][] = []
          for (const [i, o] of out.entries()) {
            const b = nth(boxes, i)
            const w = b.w + gutter
            const h = b.h + gutter
            for (let q = 0; q < o.page; q++)
              expect(findSpot(free[q] ?? [], w, h, heuristic, policy)).toBeNull()
            const bin = { x: 0, y: 0, w: 100 + gutter, h: 100 + gutter }
            const rw = o.turned ? h : w
            const rh = o.turned ? w : h
            free[o.page] = occupy(free[o.page] ?? [bin], { x: o.x, y: o.y, w: rw, h: rh })
          }
        },
      ),
    )
  })
})
