import type { SizeMm } from '../../shared/model/paper'
import {
  contentBoxMm,
  gutterMm,
  normalizePageSetup,
  type PageSetup,
} from '../../shared/model/page-setup'
import type { Mm } from '../../shared/model/units'
import { blockSize, maxFitTileWidth, tileRects, tileShortSide } from './geometry'
import { suggestedPerPage } from './suggest'
import { EPS_MM } from './tolerances'
import type { LayoutItemInput, LayoutResult, Placement, PlacementWarning, RectMm } from './types'

export type BlockId = string

export interface ManualBlock {
  readonly blockId: BlockId
  readonly page: number
  readonly x: Mm
  readonly y: Mm
  readonly tileW: Mm // one tile, unturned
  readonly turned: boolean
}

export interface ManualLayout {
  readonly orientation: 'portrait' | 'landscape'
  readonly pageSize: SizeMm
  readonly content: RectMm
  readonly gutter: Mm
  readonly pageCount: number
  readonly blocks: readonly ManualBlock[] // sorted by page, y, x, blockId
}

export const MIN_MANUAL_SHORT_MM: Mm = 20

/** `${imageId}#${copy}`: image ids are stable while study and line changes can re-rank item keys. */
export function blockIdOf(item: Pick<LayoutItemInput, 'key' | 'imageId'>): BlockId {
  const hash = item.key.lastIndexOf('#')
  return `${item.imageId}#${hash < 0 ? '0' : item.key.slice(hash + 1)}`
}

export function itemsByBlock(items: readonly LayoutItemInput[]): Map<BlockId, LayoutItemInput> {
  return new Map(items.map((it) => [blockIdOf(it), it]))
}

export function blockRect(
  b: Pick<ManualBlock, 'x' | 'y' | 'tileW' | 'turned'>,
  item: LayoutItemInput,
  gutter: Mm,
): RectMm {
  const s = blockSize(b.tileW, item.aspect, item.tiles, gutter)
  return b.turned ? { x: b.x, y: b.y, w: s.h, h: s.w } : { x: b.x, y: b.y, w: s.w, h: s.h }
}

export function isFixedSize(item: LayoutItemInput): boolean {
  return item.size.kind === 'fixed'
}

/**
 * Smallest tile width an auto-sized block may take: short side MIN_MANUAL_SHORT_MM, lowered to the
 * short side at the largest size the block fits the content box with. Fixed sizes have no minimum.
 */
export function minTileWidth(
  item: LayoutItemInput,
  m: Pick<ManualLayout, 'content' | 'gutter'>,
): Mm {
  if (isFixedSize(item)) return 0
  const fitW = maxFitTileWidth(item.aspect, item.tiles, m.gutter, m.content)
  const short = Math.min(MIN_MANUAL_SHORT_MM, tileShortSide(Math.max(0, fitW), item.aspect))
  return short * Math.max(1, item.aspect)
}

/** Gutter-inflated boxes (right and bottom, as packPages) overlap by more than EPS_MM. */
function inflatedOverlap(a: RectMm, b: RectMm, gutter: Mm): boolean {
  return (
    a.x < b.x + b.w + gutter - EPS_MM &&
    b.x < a.x + a.w + gutter - EPS_MM &&
    a.y < b.y + b.h + gutter - EPS_MM &&
    b.y < a.y + a.h + gutter - EPS_MM
  )
}

function insideContent(r: RectMm, content: RectMm): boolean {
  return (
    r.x >= content.x - EPS_MM &&
    r.y >= content.y - EPS_MM &&
    r.x + r.w <= content.x + content.w + EPS_MM &&
    r.y + r.h <= content.y + content.h + EPS_MM
  )
}

export type PlacementProblem = 'outside' | 'overlap' | 'min' | 'unknown'

/** The first rule of M5-R9 the block breaks, or null when it is valid. */
export function placementProblem(
  m: ManualLayout,
  block: ManualBlock,
  byBlock: ReadonlyMap<BlockId, LayoutItemInput>,
): PlacementProblem | null {
  const item = byBlock.get(block.blockId)
  if (item === undefined || !(Number.isFinite(block.tileW) && block.tileW > 0)) return 'unknown'
  if (!(Number.isInteger(block.page) && block.page >= 0 && block.page < m.pageCount))
    return 'outside'
  if (block.tileW < minTileWidth(item, m) - EPS_MM) return 'min'
  const r = blockRect(block, item, m.gutter)
  if (!insideContent(r, m.content)) return 'outside'
  for (const other of m.blocks) {
    if (other.page !== block.page || other.blockId === block.blockId) continue
    const otherItem = byBlock.get(other.blockId)
    if (otherItem === undefined) continue
    if (inflatedOverlap(r, blockRect(other, otherItem, m.gutter), m.gutter)) return 'overlap'
  }
  return null
}

/** M5-R9: inside the content box, gutter-inflated box disjoint from the others on its page, tile not too small. */
export function isValidPlacement(
  manual: ManualLayout,
  block: ManualBlock,
  items: readonly LayoutItemInput[],
): boolean {
  return placementProblem(manual, block, itemsByBlock(items)) === null
}

export function compareBlocks(a: ManualBlock, b: ManualBlock): number {
  return a.page - b.page || a.y - b.y || a.x - b.x || (a.blockId < b.blockId ? -1 : 1)
}

function contentFor(setup: PageSetup, pageSize: SizeMm): { content: RectMm; gutter: Mm } {
  const s = normalizePageSetup(setup).setup
  return { content: contentBoxMm(s, pageSize), gutter: gutterMm(s) }
}

/** The arrangement shown by `result`, as a manual layout. Placements with no matching item are left out. */
export function manualFromLayout(
  result: LayoutResult,
  items: readonly LayoutItemInput[],
  setup: PageSetup,
): ManualLayout {
  const keys = new Set(items.map((it) => it.key))
  const blocks: ManualBlock[] = []
  result.pages.forEach((page, index) => {
    for (const p of page.placements) {
      const tile = p.tiles[0]
      if (!keys.has(p.key) || tile === undefined) continue
      blocks.push({
        blockId: blockIdOf(p),
        page: index,
        x: p.block.x,
        y: p.block.y,
        tileW: p.turned ? tile.h : tile.w,
        turned: p.turned,
      })
    }
  })
  return {
    orientation: result.orientation,
    pageSize: result.pageSize,
    ...contentFor(setup, result.pageSize),
    pageCount: result.pages.length,
    blocks: blocks.sort(compareBlocks),
  }
}

/**
 * The pages of a manual layout. Geometry comes from the manual layout alone; `suggestedPerPage` from
 * `setup` on its page size. Blocks with no matching item are left out. `scaled-to-fit` is never set:
 * a manual size is the user's choice.
 */
export function layoutFromManual(
  manual: ManualLayout,
  items: readonly LayoutItemInput[],
  setup: PageSetup,
): LayoutResult {
  const byBlock = itemsByBlock(items)
  const pages: Placement[][] = Array.from({ length: manual.pageCount }, () => [])
  for (const b of manual.blocks) {
    const item = byBlock.get(b.blockId)
    if (item === undefined) continue
    const warnings: PlacementWarning[] = b.tileW > item.maxPrintWidthMm + EPS_MM ? ['low-dpi'] : []
    pages[b.page]?.push({
      key: item.key,
      imageId: item.imageId,
      block: blockRect(b, item, manual.gutter),
      tiles: tileRects(b.x, b.y, b.tileW, item.aspect, item.tiles, manual.gutter, b.turned),
      turned: b.turned,
      warnings,
    })
  }
  const { content, gutter } = contentFor(setup, manual.pageSize)
  return {
    orientation: manual.orientation,
    pageSize: manual.pageSize,
    pages: pages.map((placements) => ({
      placements: placements.sort(
        (a, b) => a.block.y - b.block.y || a.block.x - b.block.x || (a.key < b.key ? -1 : 1),
      ),
    })),
    suggestedPerPage: suggestedPerPage({ w: content.w, h: content.h }, gutter),
  }
}
