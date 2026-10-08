import type { CropRect, ImageDescriptor, Rotation } from '../../../shared/model/image'
import { resolveCrop } from '../../render/crop'
import { orientMatrix, type PxRect } from '../../render/pixels/tile-plan'
import type { FrameSize, PathCmd } from '../types'
import type { SourcePoint } from './types'

/** x' = a·x + c·y + e, y' = b·x + d·y + f (canvas `setTransform` order). */
export type Affine = readonly [number, number, number, number, number, number]

type Img = Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>

/** Source px → frame mm: crop, user rotation, flips, scale to the frame (M4-R10). */
export function sourceToFrame(img: Img, frame: FrameSize): Affine {
  const crop = resolveCrop(img)
  const { rotation, flipH, flipV } = img.edits
  const [a, b, c, d, e, f] = orientMatrix(
    rotation,
    flipH,
    flipV,
    crop.w,
    crop.h,
    frame.w,
    frame.h,
    0,
  )
  return [a, b, c, d, e - a * crop.x - c * crop.y, f - b * crop.x - d * crop.y]
}

function apply(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

export function applyAffine(m: Affine, cmd: PathCmd): PathCmd {
  if (cmd.op === 'C') {
    const [x1, y1] = apply(m, cmd.x1, cmd.y1)
    const [x2, y2] = apply(m, cmd.x2, cmd.y2)
    const [x, y] = apply(m, cmd.x, cmd.y)
    return { op: 'C', x1, y1, x2, y2, x, y }
  }
  const [x, y] = apply(m, cmd.x, cmd.y)
  return { op: cmd.op, x, y }
}

/** A point found in a bitmap of the source rotated by `rotation` (both normalised) → SourcePoint (M4-R7). */
export function fromRotated(p: { x: number; y: number }, rotation: Rotation): SourcePoint {
  const [a, b, c, d, e, f] = orientMatrix(rotation, false, false, 1, 1, 1, 1, 0)
  const det = a * d - b * c
  const u = p.x - e
  const v = p.y - f
  return { x: (d * u - c * v) / det, y: (a * v - b * u) / det }
}

/** A point found in the cropped picture (normalised to the crop) → SourcePoint. */
export function fromCrop(
  p: { x: number; y: number },
  crop: CropRect | null,
  pxW: number,
  pxH: number,
): SourcePoint {
  if (crop === null) return { x: p.x, y: p.y }
  return { x: (crop.x + p.x * crop.w) / pxW, y: (crop.y + p.y * crop.h) / pxH }
}

/** Whether a box in source px meets the crop, edges included (culling, M4-R13/R16). */
export function meetsCrop(box: PxRect, img: Img): boolean {
  const c = resolveCrop(img)
  return box.x <= c.x + c.w && box.x + box.w >= c.x && box.y <= c.y + c.h && box.y + box.h >= c.y
}

/** 'full', or the crop rounded to whole px as 'x,y,w,h' (M4-R8). */
export function cropKey(crop: CropRect | null): string {
  if (crop === null) return 'full'
  return [crop.x, crop.y, crop.w, crop.h].map(Math.round).join(',')
}
