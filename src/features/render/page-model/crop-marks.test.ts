import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CROP_MARK_LENGTH_MM, CROP_MARK_OFFSET_MM } from '../../../shared/model/page-setup'
import { arbGridPage } from '../test-support/fixtures'
import {
  CROP_MARK_CLEARANCE_MM,
  MIN_CROP_MARK_MM,
  cropMarksForTiles,
  idealCropMarks,
} from './crop-marks'
import { expandRect, pointInRect, segmentIntersectsRect } from './rect'

const SAFE = { x: 5, y: 5, w: 200, h: 287 }
const L = CROP_MARK_LENGTH_MM
const OFF = CROP_MARK_OFFSET_MM

describe('idealCropMarks', () => {
  it('gives 8 marks on the trim lines, starting outside the bleed', () => {
    const marks = idealCropMarks({ trim: { x: 20, y: 30, w: 100, h: 50 }, bleedMm: 3 })
    expect(marks).toHaveLength(8)
    expect(marks[0]).toEqual({ x: 20 - 3 - OFF, y: 30, dx: -1, dy: 0, length: L })
    expect(marks[1]).toEqual({ x: 20, y: 30 - 3 - OFF, dx: 0, dy: -1, length: L })
    expect(marks[4]).toEqual({ x: 120 + 3 + OFF, y: 80, dx: 1, dy: 0, length: L })
    expect(marks[5]).toEqual({ x: 120, y: 80 + 3 + OFF, dx: 0, dy: 1, length: L })
  })
})

describe('cropMarksForTiles', () => {
  it('keeps all 8 full-length marks for a lone tile', () => {
    const segs = cropMarksForTiles([{ trim: { x: 20, y: 20, w: 100, h: 50 }, bleedMm: 0 }], SAFE)
    expect(segs).toHaveLength(8)
    expect(segs[0]).toEqual({ x1: 19, y1: 20, x2: 15, y2: 20 })
    for (const s of segs) expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeCloseTo(L, 9)
  })

  it('returns nothing for no tiles', () => {
    expect(cropMarksForTiles([], SAFE)).toEqual([])
  })

  it('shortens a mark that runs towards a close neighbour', () => {
    // Left tile's top-right horizontal mark runs right from x=121 towards the neighbour at x=124.
    const segs = cropMarksForTiles(
      [
        { trim: { x: 20, y: 20, w: 100, h: 50 }, bleedMm: 0 },
        { trim: { x: 124, y: 0, w: 50, h: 100 }, bleedMm: 0 },
      ],
      { x: 0, y: 0, w: 210, h: 297 },
    )
    const topRight = segs.find((s) => s.x1 === 121 && s.y1 === 20)
    expect(topRight).toEqual({ x1: 121, y1: 20, x2: 124 - CROP_MARK_CLEARANCE_MM, y2: 20 })
  })

  it('drops a mark whose start is inside a neighbour bleed box', () => {
    // gutter 6 = 2 × bleed 3: the mark starts at 120+3+1 = 124, the neighbour bleed box starts at 123.
    const segs = cropMarksForTiles(
      [
        { trim: { x: 20, y: 20, w: 100, h: 50 }, bleedMm: 3 },
        { trim: { x: 126, y: 20, w: 50, h: 50 }, bleedMm: 3 },
      ],
      { x: 0, y: 0, w: 210, h: 297 },
    )
    expect(segs.some((s) => s.x1 === 124 && s.y1 === 20)).toBe(false)
    expect(segs.some((s) => s.x1 === 122 && s.y1 === 20)).toBe(false) // neighbour's mirror mark too
  })

  it('drops marks shortened below the minimum length', () => {
    const segs = cropMarksForTiles(
      [
        { trim: { x: 20, y: 20, w: 100, h: 50 }, bleedMm: 0 },
        { trim: { x: 121 + MIN_CROP_MARK_MM, y: 0, w: 50, h: 100 }, bleedMm: 0 },
      ],
      { x: 0, y: 0, w: 210, h: 297 },
    )
    expect(segs.some((s) => s.x1 === 121 && s.y1 === 20)).toBe(false)
  })

  it('clips marks at the safe area edge', () => {
    const segs = cropMarksForTiles([{ trim: { x: 8, y: 50, w: 50, h: 50 }, bleedMm: 0 }], SAFE)
    // top-left horizontal: from 7 leftwards, safe area starts at 5 → 2 mm long
    expect(segs[0]).toEqual({ x1: 7, y1: 50, x2: 5, y2: 50 })
  })
})

describe('cropMarksForTiles (properties)', () => {
  it('never intersects another tile’s trim+bleed box', () => {
    fc.assert(
      fc.property(arbGridPage, (page) => {
        const segs = cropMarksForTiles(page.tiles, page.safeArea)
        const boxes = page.tiles.map((t) => expandRect(t.trim, t.bleedMm))
        for (const s of segs) {
          for (const box of boxes) expect(segmentIntersectsRect(s, box)).toBe(false)
        }
      }),
    )
  })

  it('stays inside the safe area (D2)', () => {
    fc.assert(
      fc.property(arbGridPage, (page) => {
        for (const s of cropMarksForTiles(page.tiles, page.safeArea)) {
          expect(pointInRect(s.x1, s.y1, page.safeArea)).toBe(true)
          expect(pointInRect(s.x2, s.y2, page.safeArea)).toBe(true)
        }
      }),
    )
  })

  it('keeps every mark whose first MIN_CROP_MARK_MM is unobstructed', () => {
    fc.assert(
      fc.property(arbGridPage, (page) => {
        const segs = cropMarksForTiles(page.tiles, page.safeArea)
        page.tiles.forEach((tile, i) => {
          const others = page.tiles
            .filter((_, j) => j !== i)
            .map((t) => expandRect(t.trim, t.bleedMm + CROP_MARK_CLEARANCE_MM))
          for (const m of idealCropMarks(tile)) {
            // Sample the first MIN_CROP_MARK_MM (+ a hair) of the ideal mark independently.
            const reach = MIN_CROP_MARK_MM + 1e-6
            const samples = Array.from({ length: 21 }, (_, k) => (k / 20) * reach)
            const free = samples.every(
              (d) =>
                pointInRect(m.x + m.dx * d, m.y + m.dy * d, page.safeArea, -1e-6) &&
                others.every((o) => !pointInRect(m.x + m.dx * d, m.y + m.dy * d, o, 1e-6)),
            )
            if (!free) continue
            const kept = segs.find(
              (s) =>
                s.x1 === m.x &&
                s.y1 === m.y &&
                Math.sign(s.x2 - s.x1) === m.dx &&
                Math.sign(s.y2 - s.y1) === m.dy,
            )
            expect(kept, `tile ${String(i)} mark at ${String(m.x)},${String(m.y)}`).toBeDefined()
            if (kept)
              expect(Math.hypot(kept.x2 - kept.x1, kept.y2 - kept.y1)).toBeGreaterThanOrEqual(
                MIN_CROP_MARK_MM,
              )
          }
        })
      }),
    )
  })

  it('never exceeds CROP_MARK_LENGTH_MM and is deterministic', () => {
    fc.assert(
      fc.property(arbGridPage, (page) => {
        const a = cropMarksForTiles(page.tiles, page.safeArea)
        expect(cropMarksForTiles(page.tiles, page.safeArea)).toEqual(a)
        for (const s of a)
          expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeLessThanOrEqual(L + 1e-9)
      }),
    )
  })

  it('keeps all 8 marks per tile at the default 6 mm gutter without bleed', () => {
    fc.assert(
      fc.property(arbGridPage, (page) => {
        fc.pre(page.bleedMm === 0 && page.gutterMm >= 2 * (OFF + L) + 2 * CROP_MARK_CLEARANCE_MM)
        expect(cropMarksForTiles(page.tiles, page.safeArea)).toHaveLength(8 * page.tiles.length)
      }),
    )
  })
})
