import type { CropRect } from '../../shared/model/image'
import { keyboardStep, moveCrop, resizeCrop } from './crop'
import { mapDeltaToSource, mapHandleToSource, type ViewTransform } from './view'

export const CROP_STEPS = [
  'left',
  'up',
  'down',
  'right',
  'narrower',
  'wider',
  'shorter',
  'taller',
] as const
export type CropStep = (typeof CROP_STEPS)[number]

interface StepSpec {
  readonly key: string
  readonly resize: boolean
  readonly dx: number
  readonly dy: number
}
const SPEC: Record<CropStep, StepSpec> = {
  left: { key: 'ArrowLeft', resize: false, dx: -1, dy: 0 },
  up: { key: 'ArrowUp', resize: false, dx: 0, dy: -1 },
  down: { key: 'ArrowDown', resize: false, dx: 0, dy: 1 },
  right: { key: 'ArrowRight', resize: false, dx: 1, dy: 0 },
  narrower: { key: 'ArrowLeft', resize: true, dx: -1, dy: 0 },
  wider: { key: 'ArrowRight', resize: true, dx: 1, dy: 0 },
  shorter: { key: 'ArrowUp', resize: true, dx: 0, dy: -1 },
  taller: { key: 'ArrowDown', resize: true, dx: 0, dy: 1 },
}

/** Arrow keys move the crop; Shift + arrows resize it. */
export function cropStepForKey(key: string, shift: boolean): CropStep | null {
  return CROP_STEPS.find((s) => SPEC[s].key === key && SPEC[s].resize === shift) ?? null
}

export interface CropStepContext {
  readonly pxW: number
  readonly pxH: number
  readonly ratio: number | null
  readonly view: ViewTransform
}

/**
 * One step of `keyboardStep` image pixels in the displayed frame. A resize keeps the displayed
 * top-left corner fixed. The result is always inside the image, at least the minimum size, and
 * of the locked shape.
 */
export function stepCrop(crop: CropRect, step: CropStep, ctx: CropStepContext): CropRect {
  const { pxW, pxH, ratio, view } = ctx
  const { dx, dy, resize } = SPEC[step]
  const px = keyboardStep(pxW, pxH)
  const delta = mapDeltaToSource({ x: dx * px, y: dy * px }, view)
  return resize
    ? resizeCrop(crop, mapHandleToSource('se', view), delta.x, delta.y, pxW, pxH, ratio)
    : moveCrop(crop, delta.x, delta.y, pxW, pxH)
}
