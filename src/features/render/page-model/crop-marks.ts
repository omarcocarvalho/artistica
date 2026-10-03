import { CROP_MARK_LENGTH_MM, CROP_MARK_OFFSET_MM } from '../../../shared/model/page-setup'
import type { Mm } from '../../../shared/model/units'
import type { RectMm } from '../../layout/types'
import type { Segment } from '../types'
import { expandRect } from './rect'

/** Marks stop this far before another tile's bleed box, so a 0.25 pt line never touches it. */
export const CROP_MARK_CLEARANCE_MM = 0.5
/** Printed crop-mark line width (vector in the PDF; at least 1 device px in the preview). */
export const CROP_MARK_WIDTH_PT = 0.25
/** A mark shortened below this length is dropped (too short to cut against). */
export const MIN_CROP_MARK_MM = 1

export interface MarkTile {
  readonly trim: RectMm
  readonly bleedMm: Mm
}

/** An ideal (unshortened) mark: starts outside the bleed and runs away from the tile. */
export interface IdealMark {
  readonly x: Mm
  readonly y: Mm
  readonly dx: -1 | 0 | 1
  readonly dy: -1 | 0 | 1
  readonly length: Mm
}

/**
 * The 8 printer-style marks of one tile, in a fixed order:
 * top-left (h, v), top-right (h, v), bottom-right (h, v), bottom-left (h, v).
 * Each lies on a trim edge's line, starting `bleed + CROP_MARK_OFFSET_MM` outside the trim.
 */
export function idealCropMarks(tile: MarkTile): IdealMark[] {
  const { x, y, w, h } = tile.trim
  const gap = tile.bleedMm + CROP_MARK_OFFSET_MM
  const L = CROP_MARK_LENGTH_MM
  const r = x + w
  const b = y + h
  return [
    { x: x - gap, y, dx: -1, dy: 0, length: L },
    { x, y: y - gap, dx: 0, dy: -1, length: L },
    { x: r + gap, y, dx: 1, dy: 0, length: L },
    { x: r, y: y - gap, dx: 0, dy: -1, length: L },
    { x: r + gap, y: b, dx: 1, dy: 0, length: L },
    { x: r, y: b + gap, dx: 0, dy: 1, length: L },
    { x: x - gap, y: b, dx: -1, dy: 0, length: L },
    { x, y: b + gap, dx: 0, dy: 1, length: L },
  ]
}

interface Axis {
  readonly cross: Mm // the mark's fixed coordinate (y for horizontal marks)
  readonly start: Mm // where the mark starts along its own axis
  readonly dir: -1 | 1
}
interface Span {
  readonly lo: Mm // box extent along the mark's axis
  readonly hi: Mm
  readonly crossLo: Mm // box extent across it
  readonly crossHi: Mm
}

function axisOf(m: IdealMark): Axis {
  return m.dy === 0
    ? { cross: m.y, start: m.x, dir: m.dx === 1 ? 1 : -1 }
    : { cross: m.x, start: m.y, dir: m.dy === 1 ? 1 : -1 }
}

function spanOf(r: RectMm, horizontal: boolean): Span {
  return horizontal
    ? { lo: r.x, hi: r.x + r.w, crossLo: r.y, crossHi: r.y + r.h }
    : { lo: r.y, hi: r.y + r.h, crossLo: r.x, crossHi: r.x + r.w }
}

/** How far the mark may run before it meets `box` (Infinity if never; 0 if it starts inside). */
function freeRun(m: IdealMark, box: RectMm): Mm {
  const a = axisOf(m)
  const s = spanOf(box, m.dy === 0)
  if (a.cross < s.crossLo || a.cross > s.crossHi) return Infinity
  if (a.dir > 0) return s.hi < a.start ? Infinity : Math.max(0, s.lo - a.start)
  return s.lo > a.start ? Infinity : Math.max(0, a.start - s.hi)
}

const EPS = 1e-9

/** How far the mark may run before leaving `area` (0 if it starts outside). */
function runInside(m: IdealMark, area: RectMm): Mm {
  const a = axisOf(m)
  const s = spanOf(area, m.dy === 0)
  if (a.cross < s.crossLo - EPS || a.cross > s.crossHi + EPS) return 0
  if (a.start < s.lo - EPS || a.start > s.hi + EPS) return 0
  return Math.max(0, a.dir > 0 ? s.hi - a.start : a.start - s.lo)
}

/**
 * Crop marks for all tiles on a page (owner decision D2: inside the safe area).
 * Each mark is shortened so it stops CROP_MARK_CLEARANCE_MM before any OTHER tile's trim+bleed box
 * and never leaves the safe area; marks shorter than MIN_CROP_MARK_MM are dropped.
 * Deterministic: output order is tile order, then idealCropMarks order.
 */
export function cropMarksForTiles(tiles: readonly MarkTile[], safeArea: RectMm): Segment[] {
  const obstacles = tiles.map((t) => expandRect(t.trim, t.bleedMm + CROP_MARK_CLEARANCE_MM))
  const out: Segment[] = []
  tiles.forEach((tile, i) => {
    for (const mark of idealCropMarks(tile)) {
      let run = Math.min(mark.length, runInside(mark, safeArea))
      obstacles.forEach((box, j) => {
        if (j !== i) run = Math.min(run, freeRun(mark, box))
      })
      if (run < MIN_CROP_MARK_MM) continue
      out.push({ x1: mark.x, y1: mark.y, x2: mark.x + mark.dx * run, y2: mark.y + mark.dy * run })
    }
  })
  return out
}
