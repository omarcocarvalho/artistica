import type { Mm } from '../../shared/model/units'
import { fitUnturned } from './geometry'
import {
  blockRect,
  compareBlocks,
  isFixedSize,
  itemsByBlock,
  minTileWidth,
  placementProblem,
  type BlockId,
  type ManualBlock,
  type ManualLayout,
} from './manual'
import { findSpot, occupy } from './maxrects'
import { EPS_MM } from './tolerances'
import type { LayoutItemInput, RectMm } from './types'

export type OpRefusal = 'overlap' | 'outside' | 'blocked' | 'min' | 'fixed' | 'does-not-fit'
export type OpResult =
  | { readonly ok: true; readonly manual: ManualLayout }
  | { readonly ok: false; readonly reason: OpRefusal }
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

/** A move or growth shorter than this changes nothing the user can see: the operation is refused. */
const NO_CHANGE_MM: Mm = 1e-6
const RESIZE_BISECTION_STEPS = 100

const refuse = (reason: OpRefusal): OpResult => ({ ok: false, reason })

interface Located {
  readonly block: ManualBlock
  readonly item: LayoutItemInput
  readonly byBlock: ReadonlyMap<BlockId, LayoutItemInput>
}

function locate(m: ManualLayout, id: BlockId, items: readonly LayoutItemInput[]): Located {
  const block = m.blocks.find((b) => b.blockId === id)
  const byBlock = itemsByBlock(items)
  const item = byBlock.get(id)
  if (block === undefined || item === undefined) throw new RangeError(`unknown block ${id}`)
  return { block, item, byBlock }
}

function withBlocks(m: ManualLayout, changed: readonly ManualBlock[]): ManualLayout {
  const byId = new Map(changed.map((b) => [b.blockId, b]))
  return { ...m, blocks: m.blocks.map((b) => byId.get(b.blockId) ?? b) }
}

/** Apply the changed blocks, drop empty pages and renumber the rest (M5-R16), sort. */
function commit(m: ManualLayout, changed: readonly ManualBlock[]): OpResult {
  const blocks = withBlocks(m, changed).blocks
  const used = [...new Set(blocks.map((b) => b.page))].sort((a, b) => a - b)
  const renumber = new Map(used.map((p, i) => [p, i]))
  const renumbered = blocks.map((b) => {
    const page = renumber.get(b.page) ?? b.page
    return page === b.page ? b : { ...b, page }
  })
  return {
    ok: true,
    manual: { ...m, pageCount: used.length, blocks: renumbered.sort(compareBlocks) },
  }
}

const inflate = (r: RectMm, g: Mm): RectMm => ({ x: r.x, y: r.y, w: r.w + g, h: r.h + g })

export function moveBlock(
  m: ManualLayout,
  id: BlockId,
  page: number,
  x: Mm,
  y: Mm,
  items: readonly LayoutItemInput[],
): OpResult {
  const { block, byBlock } = locate(m, id, items)
  const next = { ...block, page, x, y }
  const problem = placementProblem(m, next, byBlock)
  if (problem !== null) return refuse(problem === 'overlap' ? 'overlap' : 'outside')
  return commit(m, [next])
}

/** Fraction of the way (along `d`) the span [pos, pos + size] can travel and stay in [lo, lo + len]. */
function containLimit(pos: Mm, size: Mm, lo: Mm, len: Mm, d: Mm): number {
  if (d > 0) return (lo + len - (pos + size)) / d
  if (d < 0) return (lo - pos) / d
  return Number.POSITIVE_INFINITY
}

/** Times (fractions of `d`) between which a moving span overlaps a fixed one; null when never. */
function overlapTimes(a: Mm, aw: Mm, b: Mm, bw: Mm, d: Mm): [number, number] | null {
  if (d === 0) {
    const overlapping = a < b + bw - EPS_MM && b < a + aw - EPS_MM
    return overlapping ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] : null
  }
  return d > 0 ? [(b - (a + aw)) / d, (b + bw - a) / d] : [(b + bw - a) / d, (b - (a + aw)) / d]
}

/**
 * Move by whole millimetres (dx, dy are rounded), stopping at the last valid position on the way:
 * flush with a margin or a gutter away from the first photo in the path, never past it.
 */
export function nudge(
  m: ManualLayout,
  id: BlockId,
  dx: Mm,
  dy: Mm,
  items: readonly LayoutItemInput[],
): OpResult {
  const { block, item, byBlock } = locate(m, id, items)
  const sx = Math.round(dx)
  const sy = Math.round(dy)
  const length = Math.hypot(sx, sy)
  if (length === 0) return refuse('blocked')
  const g = m.gutter
  const r = blockRect(block, item, g)
  const c = m.content
  let t = Math.min(1, containLimit(r.x, r.w, c.x, c.w, sx), containLimit(r.y, r.h, c.y, c.h, sy))
  const tol = EPS_MM / length
  const a = inflate(r, g)
  for (const other of m.blocks) {
    if (other.page !== block.page || other.blockId === id) continue
    const otherItem = byBlock.get(other.blockId)
    if (otherItem === undefined) continue
    const b = inflate(blockRect(other, otherItem, g), g)
    const tx = overlapTimes(a.x, a.w, b.x, b.w, sx)
    const ty = overlapTimes(a.y, a.h, b.y, b.h, sy)
    if (tx === null || ty === null) continue
    const enter = Math.max(tx[0], ty[0])
    const exit = Math.min(tx[1], ty[1])
    if (enter < exit - tol && exit > tol && enter < t) t = enter
  }
  t = Math.max(0, t)
  if (t * length < NO_CHANGE_MM) return refuse('blocked')
  const next =
    t === 1
      ? { ...block, x: block.x + sx, y: block.y + sy }
      : { ...block, x: block.x + sx * t, y: block.y + sy * t }
  if (placementProblem(m, next, byBlock) !== null) return refuse('blocked')
  return commit(m, [next])
}

/**
 * Resize to tile width `tileW`, keeping the aspect and the `anchor` corner. Clamped to the minimum
 * and to the largest valid size on the way. Fixed sizes are set in Edit, never here (M5-R12).
 */
export function resizeBlock(
  m: ManualLayout,
  id: BlockId,
  tileW: Mm,
  anchor: Corner,
  items: readonly LayoutItemInput[],
): OpResult {
  const { block, item, byBlock } = locate(m, id, items)
  if (isFixedSize(item)) return refuse('fixed')
  const old = blockRect(block, item, m.gutter)
  const at = (w: Mm): ManualBlock => {
    const s = blockRect({ ...block, tileW: w }, item, m.gutter)
    return {
      ...block,
      tileW: w,
      x: anchor === 'tl' || anchor === 'bl' ? old.x : old.x + old.w - s.w,
      y: anchor === 'tl' || anchor === 'tr' ? old.y : old.y + old.h - s.h,
    }
  }
  const valid = (w: Mm): boolean => placementProblem(m, at(w), byBlock) === null
  const want = tileW > 0 ? tileW : 0
  const current = block.tileW

  if (want <= current + NO_CHANGE_MM) {
    const w = Math.max(want, minTileWidth(item, m))
    if (w >= current - NO_CHANGE_MM)
      return refuse(want < current - NO_CHANGE_MM ? 'min' : 'blocked')
    return valid(w) ? commit(m, [at(w)]) : refuse('blocked')
  }
  if (valid(want)) return commit(m, [at(want)])
  if (!valid(current)) return refuse('blocked')
  let lo = current
  let hi = Number.isFinite(want) ? want : current + m.content.w + m.content.h
  for (let i = 0; i < RESIZE_BISECTION_STEPS && hi - lo > EPS_MM / 1000; i++) {
    const mid = (lo + hi) / 2
    if (valid(mid)) lo = mid
    else hi = mid
  }
  if (lo - current < NO_CHANGE_MM) return refuse('blocked')
  return commit(m, [at(lo)])
}

/** `block` fitted inside `box`, anchored at its top-left: its own size when fixed, else the largest. */
export function fitInto(
  block: ManualBlock,
  item: LayoutItemInput,
  box: RectMm,
  page: number,
  gutter: Mm,
): ManualBlock | null {
  const place = (tileW: Mm, turned: boolean): ManualBlock => ({
    ...block,
    page,
    x: box.x,
    y: box.y,
    tileW,
    turned,
  })
  if (isFixedSize(item)) {
    for (const turned of [block.turned, !block.turned]) {
      const r = blockRect({ ...block, turned }, item, gutter)
      if (r.w <= box.w + EPS_MM && r.h <= box.h + EPS_MM) return place(block.tileW, turned)
    }
    return null
  }
  const unturned = fitUnturned(item.aspect, item.tiles, gutter, box.w, box.h)
  const turnedW = fitUnturned(item.aspect, item.tiles, gutter, box.h, box.w)
  const turned = Math.abs(unturned - turnedW) <= EPS_MM ? block.turned : turnedW > unturned
  const w = turned ? turnedW : unturned
  return w > 0 ? place(w, turned) : null
}

/** M5-R11: each block takes the other's box, fitted inside it. */
export function swapBlocks(
  m: ManualLayout,
  a: BlockId,
  b: BlockId,
  items: readonly LayoutItemInput[],
): OpResult {
  if (a === b) throw new RangeError(`cannot swap block ${a} with itself`)
  const first = locate(m, a, items)
  const second = locate(m, b, items)
  const boxA = blockRect(first.block, first.item, m.gutter)
  const boxB = blockRect(second.block, second.item, m.gutter)
  const nextA = fitInto(first.block, first.item, boxB, second.block.page, m.gutter)
  const nextB = fitInto(second.block, second.item, boxA, first.block.page, m.gutter)
  if (nextA === null || nextB === null) return refuse('does-not-fit')
  const swapped = withBlocks(m, [nextA, nextB])
  if (
    placementProblem(swapped, nextA, first.byBlock) !== null ||
    placementProblem(swapped, nextB, first.byBlock) !== null
  )
    return refuse('does-not-fit')
  return commit(m, [nextA, nextB])
}

/** M5-R13: at its current size where findSpot('bssf', 'free') finds room; page === pageCount is a new page. */
export function moveToPage(
  m: ManualLayout,
  id: BlockId,
  page: number,
  items: readonly LayoutItemInput[],
): OpResult {
  const { block, item, byBlock } = locate(m, id, items)
  if (!(Number.isInteger(page) && page >= 0 && page <= m.pageCount)) return refuse('outside')
  const g = m.gutter
  const c = m.content
  let free: RectMm[] = [{ x: c.x, y: c.y, w: c.w + g, h: c.h + g }]
  for (const other of m.blocks) {
    if (other.page !== page || other.blockId === id) continue
    const otherItem = byBlock.get(other.blockId)
    if (otherItem === undefined) continue
    free = occupy(free, inflate(blockRect(other, otherItem, g), g))
  }
  const r = blockRect(block, item, g)
  const spot = findSpot(free, r.w + g, r.h + g, 'bssf', 'free')
  if (spot === null) return refuse('does-not-fit')
  const next = { ...block, page, x: spot.x, y: spot.y, turned: spot.turned !== block.turned }
  const target = page === m.pageCount ? { ...m, pageCount: m.pageCount + 1 } : m
  if (placementProblem(target, next, byBlock) !== null) return refuse('does-not-fit')
  return commit(target, [next])
}
