import type { CropRect, ImageDescriptor, ImageId, Rotation } from '../../../shared/model/image'
import type { PageSetup } from '../../../shared/model/page-setup'
import type { SizeMm } from '../../../shared/model/paper'
import type { Mm } from '../../../shared/model/units'
import type { LayoutResult, Placement, RectMm } from '../../layout/types'
import type { DrawTile, PageModel } from '../types'
import { cropMarksForTiles } from './crop-marks'

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

/**
 * One DrawTile per trim rect of a placement.
 * Flips are defined in the user's view (after edits.rotation). When the engine turns the item a further
 * 90° clockwise, a horizontal flip in the user's view becomes a vertical flip on the page
 * (R90·FH = FV·R90), so the two flags swap.
 */
export function drawTilesFor(img: ImageDescriptor, placement: Placement, bleedMm: Mm): DrawTile[] {
  const crop = resolveCrop(img)
  const rotation = combineRotation(img.edits.rotation, placement.turned)
  const flipH = placement.turned ? img.edits.flipV : img.edits.flipH
  const flipV = placement.turned ? img.edits.flipH : img.edits.flipV
  const lowDpi = placement.warnings.includes('low-dpi')
  const scaledToFit = placement.warnings.includes('scaled-to-fit')
  return placement.tiles.map((trim) => ({
    imageId: img.id,
    trim,
    bleedMm,
    crop,
    rotation,
    flipH,
    flipV,
    lowDpi,
    scaledToFit,
  }))
}

/**
 * Pure: layout + setup + image descriptors → one PageModel per non-empty page.
 * Placements whose image is no longer present (a stale layout racing a removal) are skipped;
 * pages left empty are dropped and the remaining pages are re-indexed from 0.
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
    const tiles = page.placements.flatMap((placement) => {
      const img = byId.get(placement.imageId)
      return img ? drawTilesFor(img, placement, bleedMm) : []
    })
    if (tiles.length === 0) continue
    pages.push({
      index: pages.length,
      size: layout.pageSize,
      safeArea,
      tiles,
      cropMarks: setup.cropMarks ? cropMarksForTiles(tiles, safeArea) : [],
    })
  }
  return pages
}
