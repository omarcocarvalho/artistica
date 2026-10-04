import { expect } from 'vitest'
import {
  contentBoxMm,
  gutterMm,
  MIN_COMFORT_SHORT_SIDE_MM,
  normalizePageSetup,
  paperSizeMm,
  type PageSetup,
} from '../../../shared/model/page-setup'
import { arrangementFor, maxFitTileWidth, tileShortSide } from '../geometry'
import { nth } from '../nth'
import { sizeRange } from '../sizing'
import { MIN_CONTENT_SIDE_MM } from '../tolerances'
import type { LayoutItemInput, LayoutResult, Placement, RectMm } from '../types'

/** Geometry tolerance for assertions: 1 nm. The engine's own slack is 1e-9 mm. */
export const TOL = 1e-6

/** Equal within TOL, relative for values above 1 mm. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b))
}

function inside(r: RectMm, box: RectMm): boolean {
  return (
    r.x >= box.x - TOL &&
    r.y >= box.y - TOL &&
    r.x + r.w <= box.x + box.w + TOL &&
    r.y + r.h <= box.y + box.h + TOL
  )
}

/** Separation between two rects: the larger of the x-gap and y-gap (negative when they overlap). */
export function separation(a: RectMm, b: RectMm): number {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
  const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
  return Math.max(gx, gy)
}

/** Unturned (as-designed) width of one tile of a placement. */
export function designWidth(p: Placement): number {
  const t = p.tiles[0]
  if (t === undefined) throw new Error('placement without tiles')
  return p.turned ? t.h : t.w
}

/** True when the setup leaves no room for at least one item (engine returns pages: []). */
export function unplaceable(setup: PageSetup, items: readonly LayoutItemInput[]): boolean {
  const s = normalizePageSetup(setup).setup
  const box = contentBoxMm(s, paperSizeMm(s))
  if (box.w < MIN_CONTENT_SIDE_MM || box.h < MIN_CONTENT_SIDE_MM) return true
  return items.some((it) => maxFitTileWidth(it.aspect, it.tiles, gutterMm(s), box) <= 1e-9)
}

/** Every Rule of the layout contract, checked on one result. */
export function expectLayoutInvariants(
  setup: PageSetup,
  items: readonly LayoutItemInput[],
  result: LayoutResult,
): void {
  const s = normalizePageSetup(setup).setup
  const paper = paperSizeMm(s)
  // Orientation resolved and respected.
  expect(['portrait', 'landscape']).toContain(result.orientation)
  if (s.orientation !== 'auto') expect(result.orientation).toBe(s.orientation)
  const short = Math.min(paper.w, paper.h)
  const long = Math.max(paper.w, paper.h)
  expect(result.pageSize).toEqual(
    result.orientation === 'portrait' ? { w: short, h: long } : { w: long, h: short },
  )
  expect(Number.isInteger(result.suggestedPerPage) && result.suggestedPerPage >= 0).toBe(true)

  if (items.length === 0 || unplaceable(s, items)) {
    expect(result.pages).toEqual([])
    return
  }
  const box = contentBoxMm(s, result.pageSize)
  const g = gutterMm(s)
  const byKey = new Map(items.map((it) => [it.key, it]))
  const seen = new Set<string>()
  const autos: { short: number; atLo: boolean; atHi: boolean }[] = []

  for (const page of result.pages) {
    expect(page.placements.length).toBeGreaterThan(0) // no empty pages
    for (const p of page.placements) {
      const item = byKey.get(p.key)
      if (item === undefined) throw new Error(`unknown key ${p.key}`)
      expect(seen.has(p.key)).toBe(false)
      seen.add(p.key)
      expect(p.imageId).toBe(item.imageId)
      // Group intact: right number of tiles, all inside the block, gutter between neighbours.
      expect(p.tiles).toHaveLength(item.tiles)
      expect(inside(p.block, box)).toBe(true)
      for (const t of p.tiles) expect(inside(t, p.block)).toBe(true)
      for (let i = 1; i < p.tiles.length; i++) {
        expect(separation(nth(p.tiles, i - 1), nth(p.tiles, i))).toBeGreaterThanOrEqual(g - TOL)
      }
      // turned geometry: printed tiles have the turned aspect.
      for (const t of p.tiles) {
        const printed = t.w / t.h
        const expected = p.turned ? 1 / item.aspect : item.aspect
        expect(Math.abs(printed - expected) / expected).toBeLessThan(1e-9)
      }
      // Group arrangement: row (same y) or column (same x) as designed, rotated with the block.
      if (p.tiles.length > 1) {
        const row = arrangementFor(item.aspect) === 'row'
        const sameY = p.tiles.every((t) => Math.abs(t.y - p.block.y) <= TOL)
        expect(sameY).toBe(row !== p.turned)
        // CR-B5 tile order: unturned row left→right, unturned column top→bottom;
        // turned row top→bottom, turned column right→left.
        for (let i = 1; i < p.tiles.length; i++) {
          const prev = nth(p.tiles, i - 1)
          const cur = nth(p.tiles, i)
          if (!p.turned) expect(row ? cur.x > prev.x : cur.y > prev.y).toBe(true)
          else expect(row ? cur.y > prev.y : cur.x < prev.x).toBe(true)
        }
      }
      const w = designWidth(p)
      const lowDpi = p.warnings.includes('low-dpi')
      const scaled = p.warnings.includes('scaled-to-fit')
      // DPI cap respected or flagged — and never flagged falsely.
      if (lowDpi) expect(w).toBeGreaterThan(item.maxPrintWidthMm)
      else expect(w).toBeLessThanOrEqual(item.maxPrintWidthMm + TOL)
      const fitW = maxFitTileWidth(item.aspect, item.tiles, g, box)
      if (item.size.kind === 'fixed') {
        const wanted = item.size.axis === 'width' ? item.size.mm : item.size.mm * item.aspect
        if (scaled) {
          expect(w).toBeLessThan(wanted)
          expect(Math.abs(w - fitW)).toBeLessThan(TOL) // scaled to the largest size that fits
        } else {
          expect(Math.abs(w - wanted)).toBeLessThanOrEqual(TOL * Math.max(1, wanted))
        }
      } else {
        expect(scaled).toBe(false)
        // Auto: at least the comfort minimum (clamped to the content box).
        const comfortW = Math.min(MIN_COMFORT_SHORT_SIDE_MM * Math.max(1, item.aspect), fitW)
        expect(w).toBeGreaterThanOrEqual(comfortW - TOL)
        const range = sizeRange(item, g, box)
        expect(w).toBeGreaterThanOrEqual(range.lo - TOL * Math.max(1, w))
        expect(w).toBeLessThanOrEqual(range.hi + TOL * Math.max(1, w))
        // Above the cap only when the comfort minimum forced it, and then no larger than that.
        if (lowDpi) expect(near(w, range.lo)).toBe(true)
        autos.push({
          short: tileShortSide(w, item.aspect),
          atLo: near(w, range.lo),
          atHi: near(w, range.hi),
        })
      }
    }
    // No overlap, gaps ≥ gutter.
    const ps = page.placements
    // CR-B5 placement order: block.y, then block.x, then key.
    for (let i = 1; i < ps.length; i++) {
      const a = nth(ps, i - 1)
      const b = nth(ps, i)
      const ordered =
        a.block.y < b.block.y ||
        (a.block.y === b.block.y &&
          (a.block.x < b.block.x || (a.block.x === b.block.x && a.key < b.key)))
      expect(ordered).toBe(true)
    }
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        expect(separation(nth(ps, i).block, nth(ps, j).block)).toBeGreaterThanOrEqual(g - TOL)
      }
    }
  }
  expect(seen.size).toBe(items.length) // every item placed exactly once
  // Owner Q2, one shared size: every auto item takes short side s clamped to its own range,
  // for one common s. Free items all share s; capped items are at most s; floored ones at least s.
  const free = autos.filter((a) => !a.atLo && !a.atHi)
  const first = free[0]
  if (first !== undefined) {
    for (const a of free) expect(near(a.short, first.short)).toBe(true)
    for (const a of autos) {
      if (a.atHi && !a.atLo) expect(a.short).toBeLessThanOrEqual(first.short * (1 + TOL))
      if (a.atLo && !a.atHi) expect(a.short).toBeGreaterThanOrEqual(first.short * (1 - TOL))
    }
  }
  const capped = autos.filter((a) => a.atHi && !a.atLo).map((a) => a.short)
  const floored = autos.filter((a) => a.atLo && !a.atHi).map((a) => a.short)
  if (capped.length > 0 && floored.length > 0) {
    expect(Math.max(...capped)).toBeLessThanOrEqual(Math.min(...floored) * (1 + TOL))
  }
}
