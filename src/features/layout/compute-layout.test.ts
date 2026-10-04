import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import { expectLayoutInvariants, TOL } from './test-support/invariants'
import { nth } from './nth'
import { item, realisticItems } from './test-support/fixtures'
import type { LayoutResult, RectMm } from './types'

const A4: PageSetup = DEFAULT_PAGE_SETUP // content box {x:10, y:10, w:190, h:277}, gutter 6
const A4_PORTRAIT: PageSetup = { ...A4, orientation: 'portrait' }

const allTiles = (r: LayoutResult): RectMm[] =>
  r.pages.flatMap((p) => p.placements.flatMap((pl) => [...pl.tiles]))
const minShort = (r: LayoutResult): number =>
  Math.min(...allTiles(r).map((t) => Math.min(t.w, t.h)))

function run(setup: PageSetup, items: Parameters<typeof computeLayout>[1]): LayoutResult {
  const r = computeLayout(setup, items)
  expectLayoutInvariants(setup, items, r)
  return r
}

describe('computeLayout: empty and degenerate input', () => {
  it('returns no pages for no items, but still a suggestion', () => {
    expect(run(A4, [])).toEqual({
      orientation: 'portrait',
      pageSize: { w: 210, h: 297 },
      pages: [],
      suggestedPerPage: 8,
    })
  })

  it('respects a forced orientation with no items', () => {
    const r = run({ ...A4, orientation: 'landscape' }, [])
    expect(r.orientation).toBe('landscape')
    expect(r.pageSize).toEqual({ w: 297, h: 210 })
  })

  it('returns no pages when the setup leaves no room (content box < 1 mm)', () => {
    const tiny: PageSetup = { ...A4, paper: 'Custom', customSize: { w: 50, h: 50 }, safeAreaMm: 25 }
    expect(run(tiny, [item('a', 1)])).toMatchObject({ pages: [], suggestedPerPage: 0 })
  })

  it('suggests 0 per page when the content box is under 1 mm on a side (CR-B2)', () => {
    // Content box 0.5 × 50.5 mm: too thin to hold anything, though not zero-area.
    const thin: PageSetup = {
      ...A4,
      paper: 'Custom',
      customSize: { w: 50, h: 100 },
      safeAreaMm: 24.75,
      cropMarks: false,
    }
    expect(run(thin, [])).toMatchObject({ pages: [], suggestedPerPage: 0 })
    expect(run(thin, [item('a', 1)])).toMatchObject({ pages: [], suggestedPerPage: 0 })
  })

  it('rejects invalid items with a RangeError', () => {
    expect(() => computeLayout(A4, [item('a', 1), item('a', 2)])).toThrow(RangeError)
    expect(() => computeLayout(A4, [item('a', 0)])).toThrow(RangeError)
    expect(() => computeLayout(A4, [item('a', 1, Number.NaN)])).toThrow(RangeError)
    expect(() => computeLayout(A4, [item('a', 1, 100, { kind: 'auto' }, 0)])).toThrow(RangeError)
  })
})

describe('computeLayout: known optimal packings', () => {
  it('packs four 3:2 photos on one A4 portrait page as a 2×2 grid of turned tiles', () => {
    // Optimum: tiles 90.33×135.5 (2 × 135.5 + 6 = 277 tall, 2 × 90.33 + 6 ≤ 190 wide).
    const items = ['a', 'b', 'c', 'd'].map((id) => item(id, 1.5))
    const r = run(A4_PORTRAIT, items)
    expect(r.pages).toHaveLength(1)
    const page = r.pages[0]?.placements ?? []
    expect(page).toHaveLength(4)
    expect(page.every((p) => p.turned)).toBe(true)
    const s = minShort(r)
    expect(s).toBeGreaterThanOrEqual(271 / 3 - 0.05)
    expect(s).toBeLessThanOrEqual(271 / 3 + TOL)
    const xs = [...new Set(page.map((p) => p.block.x))]
    const ys = [...new Set(page.map((p) => p.block.y))]
    expect(xs).toHaveLength(2)
    expect(ys).toHaveLength(2)
    expect(page[0]?.block.x).toBe(10)
    expect(page[0]?.block.y).toBe(10)
  })

  it('finds the same optimum in auto orientation (either orientation is optimal)', () => {
    const r = run(
      A4,
      ['a', 'b', 'c', 'd'].map((id) => item(id, 1.5)),
    )
    expect(r.pages).toHaveLength(1)
    expect(minShort(r)).toBeGreaterThanOrEqual(271 / 3 - 0.05)
  })

  it('packs four 3:2 photos on one Letter page at the optimum', () => {
    // Letter content 195.9×259.4: turned 2×2 → long side (259.4 − 6)/2 = 126.7, short 84.47.
    const r = run(
      { ...A4_PORTRAIT, paper: 'Letter' },
      ['a', 'b', 'c', 'd'].map((id) => item(id, 1.5)),
    )
    expect(r.pages).toHaveLength(1)
    expect(minShort(r)).toBeGreaterThanOrEqual(253.4 / 3 - 0.05)
  })

  it('grows a single large photo to fill the page, turning it to do so', () => {
    const r = run(A4_PORTRAIT, [item('a', 1.5)])
    expect(r.pages[0]?.placements[0]).toMatchObject({ turned: true, warnings: [] })
    const t = r.pages[0]?.placements[0]?.tiles[0]
    expect(t?.x).toBe(10)
    expect(t?.y).toBe(10)
    expect(t?.h).toBeCloseTo(277, 9)
    expect(t?.w).toBeCloseTo(277 / 1.5, 9)
  })

  it('never grows a photo past its 300-DPI cap', () => {
    const r = run(A4_PORTRAIT, [item('a', 1, 120)])
    expect(r.pages[0]?.placements[0]?.tiles[0]).toEqual({ x: 10, y: 10, w: 120, h: 120 })
  })

  it('packs eight comfort-size references on one A4 page (matches suggestedPerPage)', () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`p${String(i)}`, 1.5, 90))
    const r = run(A4_PORTRAIT, items)
    expect(r.pages).toHaveLength(1)
    expect(r.suggestedPerPage).toBe(8)
  })

  it('uses fewer pages before larger images: nine 3:2 photos on two A4 pages, all above comfort', () => {
    const r = run(
      A4_PORTRAIT,
      Array.from({ length: 9 }, (_, i) => item(`p${String(i)}`, 1.5)),
    )
    expect(r.pages).toHaveLength(2)
    expect(minShort(r)).toBeGreaterThan(70)
  })
})

describe('computeLayout: orientation and input order', () => {
  it('picks the orientation that needs fewer pages (A5: landscape 5 pages, portrait 6)', () => {
    const A5: PageSetup = { ...A4, paper: 'A5' }
    const items = realisticItems(15, 9)
    expect(run({ ...A5, orientation: 'portrait' }, items).pages).toHaveLength(6)
    expect(run({ ...A5, orientation: 'landscape' }, items).pages).toHaveLength(5)
    const auto = run(A5, items)
    expect(auto.orientation).toBe('landscape')
    expect(auto.pageSize).toEqual({ w: 210, h: 148 })
    expect(auto.pages).toHaveLength(5)
  })

  it('gives a deep-equal result for identical items in any input order', () => {
    // Seven identical 3:2 boxes: every packing tie must be broken by key, not by input position.
    const items = Array.from({ length: 7 }, (_, i) => item(`p${String(i)}`, 1.5))
    const r = run(A4, items)
    expect(computeLayout(A4, [...items].reverse())).toEqual(r)
    const shuffled = [3, 6, 0, 5, 1, 4, 2].map((i) => nth(items, i))
    expect(computeLayout(A4, shuffled)).toEqual(r)
  })
})

describe('computeLayout: warnings', () => {
  it('raises a low-resolution photo to the comfort minimum and flags it', () => {
    const r = run(A4_PORTRAIT, [item('a', 1.5, 30)])
    const p = r.pages[0]?.placements[0]
    expect(p?.warnings).toEqual(['low-dpi'])
    expect(p?.tiles[0]).toEqual({ x: 10, y: 10, w: 90, h: 60 })
  })

  it('places a fixed size exactly', () => {
    const r = run(A4_PORTRAIT, [item('a', 1, 1000, { kind: 'fixed', axis: 'width', mm: 100 })])
    expect(r.pages[0]?.placements[0]).toMatchObject({
      tiles: [{ x: 10, y: 10, w: 100, h: 100 }],
      warnings: [],
    })
  })

  it('places a fixed height exactly, keeping the aspect', () => {
    const r = run(A4_PORTRAIT, [item('a', 0.5, 1000, { kind: 'fixed', axis: 'height', mm: 150 })])
    const t = r.pages[0]?.placements[0]?.tiles[0]
    expect(r.pages[0]?.placements[0]?.turned ? t?.w : t?.h).toBeCloseTo(150, 9)
  })

  it('scales a fixed size that does not fit and flags it (and low DPI beyond the cap)', () => {
    const r = run(A4_PORTRAIT, [item('a', 1, 120, { kind: 'fixed', axis: 'width', mm: 500 })])
    expect(r.pages[0]?.placements[0]).toMatchObject({
      tiles: [{ x: 10, y: 10, w: 190, h: 190 }],
      warnings: ['low-dpi', 'scaled-to-fit'],
    })
  })

  it('flags a fixed size above the 300-DPI cap as low DPI', () => {
    const r = run(A4_PORTRAIT, [item('a', 1, 50, { kind: 'fixed', axis: 'width', mm: 80 })])
    expect(r.pages[0]?.placements[0]?.warnings).toEqual(['low-dpi'])
  })
})

describe('computeLayout: groups (M2-ready)', () => {
  it('keeps a 3-tile group together as a row with the gutter between tiles', () => {
    const r = run({ ...A4, orientation: 'landscape' }, [
      item('g', 2 / 3, 1000, { kind: 'auto' }, 3),
    ])
    const p = r.pages[0]?.placements[0]
    expect(p?.tiles).toHaveLength(3)
    expect(p?.turned).toBe(false)
    const [t0, t1, t2] = p?.tiles ?? []
    expect((t1?.x ?? 0) - ((t0?.x ?? 0) + (t0?.w ?? 0))).toBeCloseTo(6, 9)
    expect((t2?.x ?? 0) - ((t1?.x ?? 0) + (t1?.w ?? 0))).toBeCloseTo(6, 9)
    expect(p?.block).toEqual({ x: 10, y: 10, w: 3 * (t0?.w ?? 0) + 12, h: t0?.h })
  })
})

describe('computeLayout: setup handling', () => {
  it('ignores the gutter when it is off (tiles may touch)', () => {
    const r = run(
      { ...A4_PORTRAIT, gutter: { enabled: false, mm: 6 } },
      ['a', 'b'].map((id) => item(id, 1, 95)),
    )
    const [a, b] = r.pages[0]?.placements ?? []
    expect(a?.block.x).toBe(10)
    expect(b?.block.x).toBe(105) // 10 + 95, no gap
  })

  it('normalises the setup itself (bleed raises the gutter to 2 × bleed)', () => {
    const setup: PageSetup = {
      ...A4_PORTRAIT,
      bleed: { enabled: true, mm: 5 },
      gutter: { enabled: false, mm: 0 },
    }
    const r = run(
      setup,
      ['a', 'b', 'c'].map((id) => item(id, 1, 60)),
    )
    const blocks = r.pages[0]?.placements.map((p) => p.block) ?? []
    // content inset = 5 safe + 5 bleed + 5 marks = 15; gutter = 10
    expect(blocks[0]).toEqual({ x: 15, y: 15, w: 60, h: 60 })
    expect(blocks[1]?.x).toBe(85)
  })
})
