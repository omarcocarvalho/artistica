import type { SizeMm } from '../../shared/model/paper'
import {
  contentBoxMm,
  gutterMm,
  normalizePageSetup,
  paperSizeMm,
  type PageSetup,
} from '../../shared/model/page-setup'
import type { Mm } from '../../shared/model/units'
import { orientedSize, searchOrientation } from './auto-layout'
import { blockSize, maxFitTileWidth } from './geometry'
import {
  blockIdOf,
  blockRect,
  compareBlocks,
  isFixedSize,
  itemsByBlock,
  minTileWidth,
  placementProblem,
  type BlockId,
  type BlockShape,
  type ManualBlock,
  type ManualLayout,
} from './manual'
import { fitInto } from './manual-ops'
import { findSpot, occupy } from './maxrects'
import { nth } from './nth'
import { sizeRange } from './sizing'
import { EPS_MM, MIN_CONTENT_SIDE_MM } from './tolerances'
import type { LayoutItemInput, ManualOutcome, RectMm } from './types'

const ASPECT_EPS = 1e-9

const near = (a: Mm, b: Mm): boolean => Math.abs(a - b) <= EPS_MM
const sameRect = (a: RectMm, b: RectMm): boolean =>
  near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h)

function sameShape(shape: BlockShape, item: LayoutItemInput): boolean {
  return (
    shape.tiles === item.tiles &&
    Math.abs(shape.aspect - item.aspect) <= ASPECT_EPS * Math.max(shape.aspect, item.aspect)
  )
}

const withShape = (item: LayoutItemInput, shape: BlockShape): LayoutItemInput => ({
  ...item,
  aspect: shape.aspect,
  tiles: shape.tiles,
})

const shapeOf = (item: LayoutItemInput): BlockShape => ({ aspect: item.aspect, tiles: item.tiles })

const inflate = (r: RectMm, g: Mm): RectMm => ({ x: r.x, y: r.y, w: r.w + g, h: r.h + g })

const byKey = (a: LayoutItemInput, b: LayoutItemInput): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0

function itemOf(byBlock: ReadonlyMap<BlockId, LayoutItemInput>, id: BlockId): LayoutItemInput {
  const item = byBlock.get(id)
  if (item === undefined) throw new RangeError(`unknown block ${id}`)
  return item
}

/** Drop empty pages and renumber the rest (M5-R16). */
function compact(m: ManualLayout, blocks: readonly ManualBlock[]): ManualLayout {
  const used = [...new Set(blocks.map((b) => b.page))].sort((a, b) => a - b)
  const renumber = new Map(used.map((p, i) => [p, i]))
  return {
    ...m,
    pageCount: used.length,
    blocks: blocks.map((b) => ({ ...b, page: renumber.get(b.page) ?? b.page })).sort(compareBlocks),
  }
}

/**
 * Place `toPack` around the blocks of `m`, which never move. Each photo takes the size the auto
 * search gives the photos to pack on their own, scaled down to the largest size the free space of a
 * page holds but not under the manual minimum (a fixed size is never scaled); pages are tried in
 * order, and a photo that fits none goes on a new last page. `items` holds every photo of the result.
 */
export function packAround(
  m: ManualLayout,
  toPack: readonly LayoutItemInput[],
  items: readonly LayoutItemInput[],
): ManualLayout {
  if (toPack.length === 0) return m
  const g = m.gutter
  const c = m.content
  const content: SizeMm = { w: c.w, h: c.h }
  const prepared = [...toPack]
    .sort(byKey)
    .map((item) => ({ item, range: sizeRange(item, g, content) }))
  const widths = searchOrientation(prepared, content, g).widths
  const queue = prepared
    .map(({ item }, i) => {
      const w = nth(widths, i)
      const s = blockSize(w, item.aspect, item.tiles, g)
      return { item, w, area: s.w * s.h, long: Math.max(s.w, s.h) }
    })
    .sort((a, b) => b.area - a.area || b.long - a.long)

  const bin: RectMm = { x: c.x, y: c.y, w: c.w + g, h: c.h + g }
  const byBlock = itemsByBlock(items)
  const pages: RectMm[][] = Array.from({ length: m.pageCount }, () => [bin])
  for (const b of m.blocks) {
    const item = itemOf(byBlock, b.blockId)
    pages[b.page] = occupy(nth(pages, b.page), inflate(blockRect(b, item, g), g))
  }
  const blocks = [...m.blocks]
  for (const { item, w } of queue) {
    const fixed = isFixedSize(item)
    const min = minTileWidth(item, m)
    let placed = false
    for (let p = 0; p <= pages.length && !placed; p++) {
      const free = pages[p] ?? [bin]
      const cap = free.reduce(
        (best, f) =>
          Math.max(best, maxFitTileWidth(item.aspect, item.tiles, g, { w: f.w - g, h: f.h - g })),
        Number.NEGATIVE_INFINITY,
      )
      if (cap < min - EPS_MM) continue
      const tileW = fixed ? w : Math.min(w, cap)
      const s = blockSize(tileW, item.aspect, item.tiles, g)
      const spot = findSpot(free, s.w + g, s.h + g, 'bssf', 'free')
      if (spot === null) continue
      pages[p] = occupy(free, spot)
      blocks.push({
        blockId: blockIdOf(item),
        page: p,
        x: spot.x,
        y: spot.y,
        tileW,
        turned: spot.turned,
        shape: shapeOf(item),
      })
      placed = true
    }
    // Every packed width fits an empty page, so a fresh page always takes it.
    if (!placed) throw new Error('layout: a packed photo did not fit an empty page')
  }
  return { ...m, pageCount: pages.length, blocks: blocks.sort(compareBlocks) }
}

type Frame = Pick<ManualLayout, 'orientation' | 'pageSize' | 'content' | 'gutter'>

function frameFor(setup: PageSetup, manual: ManualLayout): Frame | null {
  const s = normalizePageSetup(setup).setup
  const orientation = s.orientation === 'auto' ? manual.orientation : s.orientation
  const pageSize = orientedSize(paperSizeMm(s), orientation)
  if (!near(pageSize.w, manual.pageSize.w) || !near(pageSize.h, manual.pageSize.h)) return null
  return { orientation, pageSize, content: contentBoxMm(s, pageSize), gutter: gutterMm(s) }
}

function fitsEmptyPage(frame: Frame, items: readonly LayoutItemInput[]): boolean {
  const c = frame.content
  if (c.w < MIN_CONTENT_SIDE_MM || c.h < MIN_CONTENT_SIDE_MM) return false
  return items.every((it) => maxFitTileWidth(it.aspect, it.tiles, frame.gutter, c) > EPS_MM)
}

/**
 * M5-R14: the manual layout for the current photos and settings. Arranged blocks stay where they
 * are; a gone photo leaves its gap; a changed shape is refitted inside its old box; a changed fixed
 * size is tried at its corner; new photos, and blocks that cannot stay, are packed around the rest.
 * A margin or gutter change keeps the arrangement only when every block, as it was, is still valid.
 */
export function reconcileManual(
  setup: PageSetup,
  items: readonly LayoutItemInput[],
  manual: ManualLayout,
): ManualOutcome {
  if (items.length === 0) return { kind: 'dropped', reason: 'empty' }
  const byBlock = itemsByBlock(items)
  if (byBlock.size !== items.length) throw new RangeError('two layout items share a block id')
  const frame = frameFor(setup, manual)
  if (frame === null) return { kind: 'dropped', reason: 'paper' }
  if (!fitsEmptyPage(frame, items)) return { kind: 'dropped', reason: 'no-longer-fits' }

  const survivors = manual.blocks.filter((b) => byBlock.has(b.blockId))
  let changed = survivors.length !== manual.blocks.length
  const frameChanged =
    !sameRect(frame.content, manual.content) || !near(frame.gutter, manual.gutter)
  if (frameChanged) {
    const asWas = new Map<BlockId, LayoutItemInput>()
    for (const b of survivors) {
      const item = itemOf(byBlock, b.blockId)
      asWas.set(
        b.blockId,
        b.shape !== undefined && !sameShape(b.shape, item) ? withShape(item, b.shape) : item,
      )
    }
    const judged: ManualLayout = { ...manual, ...frame, blocks: survivors }
    for (const b of survivors) {
      const problem = placementProblem(judged, b, asWas)
      if (problem === 'outside' || problem === 'overlap')
        return { kind: 'dropped', reason: 'no-longer-fits' }
    }
  }

  const base: ManualLayout = { ...manual, ...frame }
  const staying: ManualBlock[] = []
  const unknownShape: ManualBlock[] = []
  const resized: ManualBlock[] = []
  const repack: LayoutItemInput[] = []
  for (const b of survivors) {
    const item = itemOf(byBlock, b.blockId)
    const fixedW = isFixedSize(item) ? sizeRange(item, frame.gutter, frame.content).lo : null
    if (b.shape !== undefined && !sameShape(b.shape, item)) {
      changed = true
      const box = blockRect(b, withShape(item, b.shape), manual.gutter)
      const fitted = fitInto(
        fixedW === null ? b : { ...b, tileW: fixedW },
        item,
        box,
        b.page,
        frame.gutter,
      )
      if (fitted === null) repack.push(item)
      else staying.push({ ...fitted, shape: shapeOf(item) })
    } else if (fixedW !== null && !near(fixedW, b.tileW)) {
      changed = true
      resized.push({ ...b, tileW: fixedW })
    } else if (b.shape === undefined) {
      unknownShape.push(b)
    } else {
      staying.push(b)
    }
  }

  const accepted: ManualBlock[] = []
  for (const b of [staying, unknownShape, resized].flatMap((tier) => tier.sort(compareBlocks))) {
    if (placementProblem({ ...base, blocks: [...accepted, b] }, b, byBlock) === null) {
      accepted.push(b)
    } else {
      changed = true
      repack.push(itemOf(byBlock, b.blockId))
    }
  }

  const arranged = new Set(manual.blocks.map((b) => b.blockId))
  const added = items.filter((it) => !arranged.has(blockIdOf(it)))
  const toPack = [...added, ...repack]
  if (toPack.length > 0) changed = true
  const result = packAround(compact(base, accepted), toPack, items)
  return { kind: changed ? 'adjusted' : 'kept', manual: result }
}
