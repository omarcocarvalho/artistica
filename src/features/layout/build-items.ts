import { MAX_COPIES, printedPixelSize, type ImageDescriptor } from '../../shared/model/image'
import { maxPrintMm } from '../../shared/model/units'
import type { LayoutItemInput } from './types'

function clampCopies(copies: number): number {
  if (!Number.isFinite(copies)) return 1
  return Math.min(MAX_COPIES, Math.max(1, Math.floor(copies)))
}

/**
 * Expand descriptors into layout items: one item per copy, one tile per selected study version;
 * computes aspect & 300-DPI cap.
 */
export function buildLayoutItems(images: readonly ImageDescriptor[]): LayoutItemInput[] {
  const items: LayoutItemInput[] = []
  const occurrences = new Map<string, number>()
  for (const image of images) {
    const occurrence = occurrences.get(image.contentHash) ?? 0
    occurrences.set(image.contentHash, occurrence + 1)
    const { pxW, pxH } = printedPixelSize(image)
    // A decoded image always has pixels; a zero/NaN size would be a bug upstream (C), not a layout case.
    if (!(pxW > 0 && pxH > 0 && Number.isFinite(pxW) && Number.isFinite(pxH))) continue
    const copies = clampCopies(image.edits.copies)
    const tiles = Math.max(1, image.study.versions.length)
    for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
      items.push({
        key: `${image.contentHash}~${String(occurrence)}#${String(copyIndex)}`,
        imageId: image.id,
        aspect: pxW / pxH,
        maxPrintWidthMm: maxPrintMm(pxW),
        size: image.edits.size,
        tiles,
      })
    }
  }
  return items
}
