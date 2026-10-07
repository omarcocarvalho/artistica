import type { CropRect, ImageDescriptor, ImageId, Rotation } from '../../../shared/model/image'
import type { PageSetup } from '../../../shared/model/page-setup'
import type { SizeMm } from '../../../shared/model/paper'
import { tileStudyFor } from '../../../shared/model/study'
import type { Mm } from '../../../shared/model/units'
import type { LayoutResult, Placement, RectMm } from '../../layout/types'
import type { DrawTile, PageModel, StudyGroupOutline, TileLines } from '../types'
import { cropMarksForTiles } from './crop-marks'
import { tileLinesFor } from './tile-lines'

/** `null` → the full image; otherwise clamped to the image and at least 1 px each way. Fractional values are kept as is. */
export function resolveCrop(img: Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>): CropRect {
  const c = img.edits.crop
  if (!c) return { x: 0, y: 0, w: img.pxW, h: img.pxH }
  const x = Math.min(Math.max(0, c.x), img.pxW - 1)
  const y = Math.min(Math.max(0, c.y), img.pxH - 1)
  const w = Math.min(Math.max(1, c.w), img.pxW - x)
  const h = Math.min(Math.max(1, c.h), img.pxH - y)
  return { x, y, w, h }
}

/** edits.rotation, plus 90° clockwise when the layout engine turned the item. */
export function combineRotation(rotation: Rotation, turned: boolean): Rotation {
  return ((rotation + (turned ? 90 : 0)) % 360) as Rotation
}

/** The page-edge margin as a rect (crop marks and bleed stay inside it, owner decision D2). */
export function safeAreaRect(size: SizeMm, safeAreaMm: Mm): RectMm {
  return {
    x: safeAreaMm,
    y: safeAreaMm,
    w: Math.max(0, size.w - 2 * safeAreaMm),
    h: Math.max(0, size.h - 2 * safeAreaMm),
  }
}

const ROW_EPS_MM = 1e-6

/** Rects in reading order: top to bottom, then left to right (M2-R4). Rows within 1e-6 mm in y count as one. */
export function readingOrder(rects: readonly RectMm[]): RectMm[] {
  return [...rects].sort((a, b) => (Math.abs(a.y - b.y) > ROW_EPS_MM ? a.y - b.y : a.x - b.x))
}

/**
 * One DrawTile per trim rect of a placement, in reading order, carrying the image's study versions
 * in canonical order (M2-R4).
 * Flips are defined in the user's view (after edits.rotation). When the engine turns the item a further
 * 90° clockwise, a horizontal flip in the user's view becomes a vertical flip on the page
 * (R90·FH = FV·R90), so the two flags swap.
 * Returns [] when the placement's tile count differs from the image's version count (a stale layout
 * racing a version toggle), so it is skipped like a removed image.
 */
export function drawTilesFor(img: ImageDescriptor, placement: Placement, bleedMm: Mm): DrawTile[] {
  const versions = img.study.versions
  const trims = readingOrder(placement.tiles)
  const paired = trims.flatMap((trim, i) => {
    const version = versions[i]
    return version === undefined ? [] : [{ trim, version }]
  })
  if (paired.length !== trims.length || paired.length !== versions.length) return []
  const crop = resolveCrop(img)
  const rotation = combineRotation(img.edits.rotation, placement.turned)
  const flipH = placement.turned ? img.edits.flipV : img.edits.flipH
  const flipV = placement.turned ? img.edits.flipH : img.edits.flipV
  const lowDpi = placement.warnings.includes('low-dpi')
  const scaledToFit = placement.warnings.includes('scaled-to-fit')
  return paired.map(({ trim, version }) => ({
    imageId: img.id,
    trim,
    bleedMm,
    crop,
    rotation,
    flipH,
    flipV,
    lowDpi,
    scaledToFit,
    version,
    study: tileStudyFor(version, img.study),
  }))
}

/**
 * Pure: layout + setup + image descriptors → one PageModel per non-empty page.
 * Placements whose image is no longer present, or whose tile count no longer matches the image's
 * versions (a stale layout), are skipped; pages left empty are dropped and the remaining pages are
 * re-indexed from 0. A placement's tiles stay consecutive, in reading order (CR-M2-5).
 */
export function buildPageModels(
  layout: LayoutResult,
  setup: PageSetup,
  images: readonly ImageDescriptor[],
): PageModel[] {
  const byId = new Map<ImageId, ImageDescriptor>(images.map((img) => [img.id, img]))
  const bleedMm = setup.bleed.enabled ? setup.bleed.mm : 0
  const safeArea = safeAreaRect(layout.pageSize, setup.safeAreaMm)
  const pages: PageModel[] = []
  for (const page of layout.pages) {
    const tiles: DrawTile[] = []
    const groups: StudyGroupOutline[] = []
    const lines: TileLines[] = []
    for (const placement of page.placements) {
      const img = byId.get(placement.imageId)
      if (!img) continue
      const drawn = drawTilesFor(img, placement, bleedMm)
      for (const tile of drawn) {
        const tl = tileLinesFor(img.lines, tile.trim, placement.turned, tiles.length)
        if (tl) lines.push(tl)
        tiles.push(tile)
      }
      if (drawn.length >= 2) groups.push({ imageId: placement.imageId, block: placement.block })
    }
    if (tiles.length === 0) continue
    pages.push({
      index: pages.length,
      size: layout.pageSize,
      safeArea,
      tiles,
      cropMarks: setup.cropMarks ? cropMarksForTiles(tiles, safeArea) : [],
      groups,
      lines,
    })
  }
  return pages
}
