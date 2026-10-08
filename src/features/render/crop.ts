import type { CropRect, ImageDescriptor } from '../../shared/model/image'

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
