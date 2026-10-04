import type { SizeMm } from '../../shared/model/paper'
import {
  contentBoxMm,
  gutterMm,
  normalizePageSetup,
  paperSizeMm,
  type PageSetup,
} from '../../shared/model/page-setup'
import type { Mm } from '../../shared/model/units'
import { blockSize, tileRects, tileShortSide } from './geometry'
import {
  HEURISTICS,
  TURN_POLICIES,
  packOrders,
  packPages,
  type PackBox,
  type PackedBox,
} from './maxrects'
import { nth } from './nth'
import { sizeRange, widthAtTarget, type SizeRange } from './sizing'
import { suggestedPerPage } from './suggest'
import {
  EPS_MM,
  LADDER_STEPS,
  MAX_SEARCH_STEPS,
  MIN_CONTENT_SIDE_MM,
  SCORE_FILL_EPS,
  SCORE_SHORT_SIDE_EPS_MM,
  SEARCH_TOLERANCE_MM,
} from './tolerances'
import type { LayoutItemInput, LayoutResult, Placement, PlacementWarning } from './types'

type ResolvedOrientation = 'portrait' | 'landscape'

export interface Prepared {
  readonly item: LayoutItemInput
  readonly range: SizeRange
}

/** One packing of all items at one target short side. */
export interface Candidate {
  readonly target: Mm
  readonly widths: readonly Mm[] // tile width per prepared item
  readonly packed: readonly PackedBox[] // per prepared item
  readonly pageCount: number
  readonly minShort: Mm // smallest printed tile short side
  readonly fill: number // printed tile area / (pageCount × content area)
}

function validate(items: readonly LayoutItemInput[]): void {
  const keys = new Set<string>()
  for (const it of items) {
    if (keys.has(it.key)) throw new RangeError(`duplicate layout key ${it.key}`)
    keys.add(it.key)
    if (!(Number.isFinite(it.aspect) && it.aspect > 0))
      throw new RangeError(`bad aspect for ${it.key}`)
    if (!(Number.isFinite(it.maxPrintWidthMm) && it.maxPrintWidthMm > 0))
      throw new RangeError(`bad maxPrintWidthMm for ${it.key}`)
    if (!(Number.isInteger(it.tiles) && it.tiles >= 1))
      throw new RangeError(`bad tiles for ${it.key}`)
  }
}

function orientedSize(paper: SizeMm, o: ResolvedOrientation): SizeMm {
  const short = Math.min(paper.w, paper.h)
  const long = Math.max(paper.w, paper.h)
  return o === 'portrait' ? { w: short, h: long } : { w: long, h: short }
}

/**
 * A proven lower bound on the pages any packing needs: at least 1, and at least the total
 * gutter-inflated box area over the inflated bin area (rounded down by a hair, so float error
 * can only make it smaller, never larger).
 */
function pageLowerBound(boxes: readonly PackBox[], content: SizeMm, gutter: Mm): number {
  const bin = (content.w + gutter) * (content.h + gutter)
  const area = boxes.reduce((sum, b) => sum + (b.w + gutter) * (b.h + gutter), 0)
  return Math.max(1, Math.ceil(area / bin - 1e-6))
}

/** Pack every item at target short side `target`; the best of 2 orders × 4 heuristics × 3 turn policies. */
export function evaluateTarget(
  prepared: readonly Prepared[],
  target: Mm,
  content: SizeMm,
  gutter: Mm,
): Candidate {
  const widths = prepared.map((p) => widthAtTarget(p.range, p.item.aspect, target))
  const boxes: PackBox[] = prepared.map((p, i) =>
    blockSize(nth(widths, i), p.item.aspect, p.item.tiles, gutter),
  )
  const bound = pageLowerBound(boxes, content, gutter)
  let best: { packed: PackedBox[]; pageCount: number } | null = null
  search: for (const order of packOrders(boxes)) {
    for (const heuristic of HEURISTICS) {
      for (const policy of TURN_POLICIES) {
        const packed = packPages(boxes, order, content, gutter, heuristic, policy)
        // Every width ≤ fitW, so every box fits an empty page; null would be an engine bug.
        if (packed === null) throw new Error('layout: a sized block did not fit an empty page')
        const pageCount = packed.reduce((m, b) => Math.max(m, b.page + 1), 0)
        if (best === null || pageCount < best.pageCount) best = { packed, pageCount }
        // No later packing can beat the bound, and ties keep the first: stopping changes nothing.
        if (best.pageCount <= bound) break search
      }
    }
  }
  // prepared is non-empty here, so the loops ran at least once.
  const chosen = best ?? { packed: [], pageCount: 0 }
  let minShort = Number.POSITIVE_INFINITY
  let area = 0
  prepared.forEach((p, i) => {
    const w = nth(widths, i)
    minShort = Math.min(minShort, tileShortSide(w, p.item.aspect))
    area += p.item.tiles * w * (w / p.item.aspect)
  })
  return {
    target,
    widths,
    packed: chosen.packed,
    pageCount: chosen.pageCount,
    minShort,
    fill: area / (chosen.pageCount * content.w * content.h),
  }
}

/**
 * Auto search for one orientation (see "The auto search" in the B plan).
 * 1. P0 = pages needed with every item at its minimum (target 0).
 * 2. If every item at its maximum still needs ≤ P0 pages, that is the answer.
 * 3. Ladder: scan LADDER_STEPS − 1 evenly spaced targets between sLo and sMax from the top down;
 *    the first one needing ≤ P0 pages brackets the answer with the rung above it.
 *    (Packing heuristics are not monotone in size; the ladder stops one bad mid-point from
 *    throwing the bisection into a much lower bracket.)
 * 4. Bisect that bracket until it is narrower than SEARCH_TOLERANCE_MM. Keep the last feasible candidate.
 */
export function searchOrientation(
  prepared: readonly Prepared[],
  content: SizeMm,
  gutter: Mm,
): Candidate {
  const floor = evaluateTarget(prepared, 0, content, gutter)
  const p0 = floor.pageCount
  const sLo = prepared.reduce(
    (m, p) => Math.min(m, tileShortSide(p.range.lo, p.item.aspect)),
    Number.POSITIVE_INFINITY,
  )
  const sMax = prepared.reduce((m, p) => Math.max(m, tileShortSide(p.range.hi, p.item.aspect)), 0)
  if (!(sMax > sLo)) return floor // nothing can grow (all fixed, all low-DPI, or all at the page size)
  const top = evaluateTarget(prepared, sMax, content, gutter)
  if (top.pageCount <= p0) return top

  const rung = (k: number): Mm => sLo + ((sMax - sLo) * k) / LADDER_STEPS
  let best = floor
  let lo = sLo
  let hi = rung(1)
  for (let k = LADDER_STEPS - 1; k >= 1; k--) {
    const c = evaluateTarget(prepared, rung(k), content, gutter)
    if (c.pageCount <= p0) {
      best = c
      lo = rung(k)
      hi = k + 1 === LADDER_STEPS ? sMax : rung(k + 1)
      break
    }
  }
  for (let step = 0; step < MAX_SEARCH_STEPS && hi - lo > SEARCH_TOLERANCE_MM; step++) {
    const mid = (lo + hi) / 2
    const c = evaluateTarget(prepared, mid, content, gutter)
    if (c.pageCount <= p0) {
      lo = mid
      best = c
    } else {
      hi = mid
    }
  }
  return best
}

/** Negative when a is better: fewer pages, then larger smallest tile, then higher fill. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.pageCount !== b.pageCount) return a.pageCount - b.pageCount
  if (Math.abs(a.minShort - b.minShort) > SCORE_SHORT_SIDE_EPS_MM) return b.minShort - a.minShort
  if (Math.abs(a.fill - b.fill) > SCORE_FILL_EPS) return b.fill - a.fill
  return 0
}

function assemble(
  prepared: readonly Prepared[],
  c: Candidate,
  origin: { x: Mm; y: Mm },
  gutter: Mm,
): { placements: Placement[] }[] {
  const pages: Placement[][] = Array.from({ length: c.pageCount }, () => [])
  prepared.forEach((p, i) => {
    const w = nth(c.widths, i)
    const at = nth(c.packed, i)
    const { item } = p
    const size = blockSize(w, item.aspect, item.tiles, gutter)
    const x = origin.x + at.x
    const y = origin.y + at.y
    const warnings: PlacementWarning[] = []
    if (w > item.maxPrintWidthMm + EPS_MM) warnings.push('low-dpi')
    if (p.range.scaledToFit) warnings.push('scaled-to-fit')
    pages[at.page]?.push({
      key: item.key,
      imageId: item.imageId,
      block: at.turned ? { x, y, w: size.h, h: size.w } : { x, y, w: size.w, h: size.h },
      tiles: tileRects(x, y, w, item.aspect, item.tiles, gutter, at.turned),
      turned: at.turned,
      warnings,
    })
  })
  return pages.map((placements) => ({
    placements: placements.sort(
      (a, b) => a.block.y - b.block.y || a.block.x - b.block.x || (a.key < b.key ? -1 : 1),
    ),
  }))
}

/** Pure, deterministic: the same input gives a deep-equal output. No DOM, no randomness, no Date. */
export function computeLayout(setup: PageSetup, items: readonly LayoutItemInput[]): LayoutResult {
  validate(items)
  const s = normalizePageSetup(setup).setup
  const paper = paperSizeMm(s)
  const gutter = gutterMm(s)
  const candidates: ResolvedOrientation[] =
    s.orientation === 'auto' ? ['portrait', 'landscape'] : [s.orientation]
  // Key order makes the result independent of input order.
  const sorted = [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  let winner: {
    orientation: ResolvedOrientation
    pageSize: SizeMm
    pages: { placements: Placement[] }[]
    suggested: number
    candidate: Candidate | null
  } | null = null

  for (const orientation of candidates) {
    const pageSize = orientedSize(paper, orientation)
    const box = contentBoxMm(s, pageSize)
    const content: SizeMm = { w: box.w, h: box.h }
    const degenerate = box.w < MIN_CONTENT_SIDE_MM || box.h < MIN_CONTENT_SIDE_MM
    const suggested = suggestedPerPage(content, gutter) // 0 for a degenerate box (CR-B2)
    const prepared = degenerate
      ? []
      : sorted.map((item) => ({ item, range: sizeRange(item, gutter, content) }))
    const placeable = !degenerate && prepared.every((p) => p.range.fitW > EPS_MM)
    if (sorted.length === 0 || !placeable) {
      // Nothing to place, or the setup leaves no room: pages: [] (E shows "no room" when items exist).
      winner ??= { orientation, pageSize, pages: [], suggested, candidate: null }
      continue
    }
    const candidate = searchOrientation(prepared, content, gutter)
    if (winner?.candidate == null || compareCandidates(candidate, winner.candidate) < 0) {
      winner = {
        orientation,
        pageSize,
        pages: assemble(prepared, candidate, box, gutter),
        suggested,
        candidate,
      }
    }
  }
  // candidates is never empty, so winner is set.
  if (winner === null) throw new Error('layout: no orientation evaluated')
  return {
    orientation: winner.orientation,
    pageSize: winner.pageSize,
    pages: winner.pages,
    suggestedPerPage: winner.suggested,
  }
}
