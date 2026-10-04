import type { SizeMm } from '../../shared/model/paper'
import type { Mm } from '../../shared/model/units'
import { nth } from './nth'
import { EPS_MM } from './tolerances'
import type { RectMm } from './types'

/** MaxRects placement rules (Jylänki 2010), adapted to top-left origin. */
export type Heuristic = 'bssf' | 'blsf' | 'baf' | 'tl'
export const HEURISTICS: readonly Heuristic[] = ['bssf', 'blsf', 'baf', 'tl']

/**
 * Which way boxes may face. 'free': either way, the heuristic decides per box.
 * 'wide': every box long side horizontal. 'tall': every box long side vertical.
 * The uniform policies find the regular grids that per-box choices miss (e.g. 2×2 portrait photos).
 */
export type TurnPolicy = 'free' | 'wide' | 'tall'
export const TURN_POLICIES: readonly TurnPolicy[] = ['free', 'wide', 'tall']

function allowedTurns(policy: TurnPolicy, w: Mm, h: Mm): readonly boolean[] {
  if (policy === 'free') return [false, true]
  if (policy === 'wide') return [h > w]
  return [w > h]
}

export interface FreeSpot {
  readonly x: Mm
  readonly y: Mm
  readonly w: Mm
  readonly h: Mm
  readonly turned: boolean
  readonly primary: number
  readonly secondary: number
}

function score(h: Heuristic, free: RectMm, w: Mm, hh: Mm): [number, number] {
  const leftW = free.w - w
  const leftH = free.h - hh
  switch (h) {
    case 'bssf':
      return [Math.min(leftW, leftH), Math.max(leftW, leftH)]
    case 'blsf':
      return [Math.max(leftW, leftH), Math.min(leftW, leftH)]
    case 'baf':
      return [free.w * free.h - w * hh, Math.min(leftW, leftH)]
    case 'tl':
      return [free.y + hh, free.x]
  }
}

/** Strict lexicographic order: primary, secondary, y, x, unturned before turned. Exact comparisons. */
function better(a: FreeSpot, b: FreeSpot | null): boolean {
  if (b === null) return true
  if (a.primary !== b.primary) return a.primary < b.primary
  if (a.secondary !== b.secondary) return a.secondary < b.secondary
  if (a.y !== b.y) return a.y < b.y
  if (a.x !== b.x) return a.x < b.x
  return !a.turned && b.turned
}

/** Best spot for a w×h rect (or its 90° turn) among the free rects, or null when none fits. */
export function findSpot(
  free: readonly RectMm[],
  w: Mm,
  h: Mm,
  heuristic: Heuristic,
  policy: TurnPolicy = 'free',
): FreeSpot | null {
  let best: FreeSpot | null = null
  const turns = allowedTurns(policy, w, h)
  for (const f of free) {
    for (const turned of turns) {
      const rw = turned ? h : w
      const rh = turned ? w : h
      if (rw > f.w + EPS_MM || rh > f.h + EPS_MM) continue
      const [primary, secondary] = score(heuristic, f, rw, rh)
      const spot: FreeSpot = { x: f.x, y: f.y, w: rw, h: rh, turned, primary, secondary }
      if (better(spot, best)) best = spot
    }
  }
  return best
}

function contains(a: RectMm, b: RectMm): boolean {
  return (
    b.x >= a.x - EPS_MM &&
    b.y >= a.y - EPS_MM &&
    b.x + b.w <= a.x + a.w + EPS_MM &&
    b.y + b.h <= a.y + a.h + EPS_MM
  )
}

function pushPiece(out: RectMm[], r: RectMm): void {
  if (r.w > EPS_MM && r.h > EPS_MM) out.push(r)
}

/**
 * Occupy `used` and return the new maximal free rects.
 * Invariant (in and out): no free rect contains another, so only freshly cut pieces need pruning.
 */
export function occupy(free: readonly RectMm[], used: RectMm): RectMm[] {
  const kept: RectMm[] = []
  // Kept rects within EPS_MM of `used`. Every cut piece shares an edge with `used`, so only these
  // can contain one: pruning against them alone is equivalent and avoids an O(free²) scan.
  const near: RectMm[] = []
  const cut: RectMm[] = []
  const ux2 = used.x + used.w
  const uy2 = used.y + used.h
  for (const f of free) {
    const fx2 = f.x + f.w
    const fy2 = f.y + f.h
    if (used.x >= fx2 || ux2 <= f.x || used.y >= fy2 || uy2 <= f.y) {
      kept.push(f)
      if (
        f.x <= ux2 + EPS_MM &&
        fx2 >= used.x - EPS_MM &&
        f.y <= uy2 + EPS_MM &&
        fy2 >= used.y - EPS_MM
      )
        near.push(f)
      continue
    }
    if (used.x > f.x) pushPiece(cut, { x: f.x, y: f.y, w: used.x - f.x, h: f.h })
    if (ux2 < fx2) pushPiece(cut, { x: ux2, y: f.y, w: fx2 - ux2, h: f.h })
    if (used.y > f.y) pushPiece(cut, { x: f.x, y: f.y, w: f.w, h: used.y - f.y })
    if (uy2 < fy2) pushPiece(cut, { x: f.x, y: uy2, w: f.w, h: fy2 - uy2 })
  }
  const survivors: RectMm[] = []
  for (let i = 0; i < cut.length; i++) {
    const piece = nth(cut, i)
    let redundant = near.some((k) => contains(k, piece))
    for (let j = 0; j < cut.length && !redundant; j++) {
      if (j === i) continue
      const other = nth(cut, j)
      // Identical pieces: keep the first one only.
      if (contains(other, piece) && (!contains(piece, other) || j < i)) redundant = true
    }
    if (!redundant) survivors.push(piece)
  }
  return [...kept, ...survivors]
}

/** A box to pack: the trim size of a block, unturned. */
export interface PackBox {
  readonly w: Mm
  readonly h: Mm
}
/** Where a box went: page index and trim top-left relative to the content box origin. */
export interface PackedBox {
  readonly page: number
  readonly x: Mm
  readonly y: Mm
  readonly turned: boolean
}

/**
 * Pack boxes onto as many content boxes ("pages") as needed, visiting them in `order`.
 * Gutter: every box is inflated by `gutter` on its right and bottom and the bin grows by `gutter`
 * on both axes. Non-overlapping inflated boxes ⇔ trim boxes at least `gutter` apart and inside the content box.
 * Each box goes on the first page with room (best spot by `heuristic` on that page); else a new page.
 * `gutter` must be normalised and non-negative (computeLayout does this, CR-B4).
 * Returns null if a box does not fit even an empty page.
 */
export function packPages(
  boxes: readonly PackBox[],
  order: readonly number[],
  content: SizeMm,
  gutter: Mm,
  heuristic: Heuristic,
  policy: TurnPolicy,
): PackedBox[] | null {
  const bin: RectMm = { x: 0, y: 0, w: content.w + gutter, h: content.h + gutter }
  const pages: RectMm[][] = []
  const out: (PackedBox | undefined)[] = boxes.map(() => undefined)
  for (const index of order) {
    const box = boxes[index]
    if (box === undefined) throw new RangeError(`order refers to missing box ${String(index)}`)
    const w = box.w + gutter
    const h = box.h + gutter
    let placed = false
    for (let p = 0; p <= pages.length && !placed; p++) {
      const free = pages[p] ?? [bin]
      const fresh = p === pages.length
      // On a fresh page a box that only fits the other way round may turn, whatever the policy.
      const spot =
        findSpot(free, w, h, heuristic, policy) ??
        (fresh && policy !== 'free' ? findSpot(free, w, h, heuristic, 'free') : null)
      if (spot === null) {
        if (fresh) return null // an empty page cannot hold it
        continue
      }
      pages[p] = occupy(free, spot)
      out[index] = { page: p, x: spot.x, y: spot.y, turned: spot.turned }
      placed = true
    }
  }
  return out.map((b, i) => {
    if (b === undefined) throw new RangeError(`box ${String(i)} missing from order`)
    return b
  })
}

/** The two visiting orders tried at every scale. Ties fall back to the index (callers pass key-sorted boxes). */
export function packOrders(boxes: readonly PackBox[]): number[][] {
  const idx = boxes.map((_, i) => i)
  const area = (i: number): number => {
    const b = nth(boxes, i)
    return b.w * b.h
  }
  const long = (i: number): number => {
    const b = nth(boxes, i)
    return Math.max(b.w, b.h)
  }
  const byArea = [...idx].sort((a, b) => area(b) - area(a) || long(b) - long(a) || a - b)
  const byLong = [...idx].sort((a, b) => long(b) - long(a) || area(b) - area(a) || a - b)
  return [byArea, byLong]
}
