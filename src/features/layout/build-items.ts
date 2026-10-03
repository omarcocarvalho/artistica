import { MAX_COPIES, printedPixelSize, type ImageDescriptor } from '../../shared/model/image'
import { maxPrintMm } from '../../shared/model/units'
import type { LayoutItemInput } from './types'

function clampCopies(copies: number): number {
  if (!Number.isFinite(copies)) return 1
  return Math.min(MAX_COPIES, Math.max(1, Math.floor(copies)))
}

/** Expand descriptors into layout items (copies → separate items; computes aspect & 300-DPI cap). */
export function buildLayoutItems(images: readonly ImageDescriptor[]): LayoutItemInput[] {
  const items: LayoutItemInput[] = []
  for (const image of images) {
    const { pxW, pxH } = printedPixelSize(image)
    // A decoded image always has pixels; a zero/NaN size would be a bug upstream (C), not a layout case.
    if (!(pxW > 0 && pxH > 0 && Number.isFinite(pxW) && Number.isFinite(pxH))) continue
    const copies = clampCopies(image.edits.copies)
    for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
      items.push({
        key: `${image.id}#${String(copyIndex)}`,
        imageId: image.id,
        aspect: pxW / pxH,
        maxPrintWidthMm: maxPrintMm(pxW),
        size: image.edits.size,
        tiles: 1,
      })
    }
  }
  return items
}
