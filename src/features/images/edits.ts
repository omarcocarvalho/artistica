import {
  MAX_COPIES,
  type CropAspect,
  type ImageEdits,
  type Rotation,
} from '../../shared/model/image'
import { clampCrop, isFullCrop, largestCrop } from './crop'

export const MIN_FIXED_MM = 10
export const MAX_FIXED_MM = 1200

const BASE: Record<Exclude<CropAspect, 'free' | 'original'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
}

/**
 * Crop ratio (w/h) in the SOURCE frame. Chips are expressed in the displayed frame and follow its
 * orientation (a portrait picture gets 3:4 for the "4:3" chip), then are inverted for quarter turns.
 */
export function cropAspectRatio(
  aspect: CropAspect,
  pxW: number,
  pxH: number,
  rotation: Rotation,
): number | null {
  if (aspect === 'free') return null
  if (aspect === 'original') return pxW / pxH
  const odd = rotation === 90 || rotation === 270
  const dw = odd ? pxH : pxW
  const dh = odd ? pxW : pxH
  const base = BASE[aspect]
  const display = dh > dw ? 1 / base : base
  return odd ? 1 / display : display
}

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

export function sanitizeEdits(edits: ImageEdits, pxW: number, pxH: number): ImageEdits {
  const rotation = ROTATIONS.includes(edits.rotation) ? edits.rotation : 0
  const copies = Number.isFinite(edits.copies)
    ? Math.min(MAX_COPIES, Math.max(1, Math.round(edits.copies)))
    : 1
  const size =
    edits.size.kind === 'fixed' && Number.isFinite(edits.size.mm)
      ? {
          kind: 'fixed' as const,
          axis: edits.size.axis === 'height' ? ('height' as const) : ('width' as const),
          mm: Math.min(MAX_FIXED_MM, Math.max(MIN_FIXED_MM, edits.size.mm)),
        }
      : { kind: 'auto' as const }
  const ratio = cropAspectRatio(edits.cropAspect, pxW, pxH, rotation)
  let crop = edits.crop
  if (crop === null) {
    if (ratio !== null) crop = largestCrop(pxW, pxH, ratio)
  } else {
    crop = clampCrop(crop, pxW, pxH, ratio)
    if (ratio === null && isFullCrop(crop, pxW, pxH)) crop = null
  }
  return {
    crop,
    cropAspect: edits.cropAspect,
    rotation,
    flipH: edits.flipH,
    flipV: edits.flipV,
    copies,
    size,
  }
}

export function editsEqual(a: ImageEdits, b: ImageEdits): boolean {
  const cropEq =
    a.crop === b.crop ||
    (a.crop !== null &&
      b.crop !== null &&
      a.crop.x === b.crop.x &&
      a.crop.y === b.crop.y &&
      a.crop.w === b.crop.w &&
      a.crop.h === b.crop.h)
  const sizeEq =
    a.size.kind === b.size.kind &&
    (a.size.kind === 'auto' ||
      (b.size.kind === 'fixed' && a.size.axis === b.size.axis && a.size.mm === b.size.mm))
  return (
    cropEq &&
    sizeEq &&
    a.cropAspect === b.cropAspect &&
    a.rotation === b.rotation &&
    a.flipH === b.flipH &&
    a.flipV === b.flipV &&
    a.copies === b.copies
  )
}
