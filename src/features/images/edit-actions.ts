import {
  printedPixelSize,
  type CropAspect,
  type CropRect,
  type ImageEdits,
} from '../../shared/model/image'
import { defaultFixedSize, withAxis } from './dpi'
import { sanitizeEdits } from './edits'
import { rotateBy } from './view'

export interface Dims {
  readonly pxW: number
  readonly pxH: number
}

const fix = (e: ImageEdits, d: Dims): ImageEdits => sanitizeEdits(e, d.pxW, d.pxH)
const printed = (e: ImageEdits, d: Dims) => printedPixelSize({ pxW: d.pxW, pxH: d.pxH, edits: e })

export const setAspect = (e: ImageEdits, d: Dims, cropAspect: CropAspect): ImageEdits =>
  fix({ ...e, cropAspect }, d)
export const setCrop = (e: ImageEdits, d: Dims, crop: CropRect): ImageEdits =>
  fix({ ...e, crop }, d)
export const resetCrop = (e: ImageEdits, d: Dims): ImageEdits =>
  fix({ ...e, crop: null, cropAspect: 'free' }, d)
export const rotate = (e: ImageEdits, d: Dims, dir: 'cw' | 'ccw'): ImageEdits =>
  fix({ ...e, rotation: rotateBy(e.rotation, dir === 'cw' ? 90 : -90) }, d)
export const toggleFlip = (e: ImageEdits, d: Dims, axis: 'h' | 'v'): ImageEdits =>
  fix(axis === 'h' ? { ...e, flipH: !e.flipH } : { ...e, flipV: !e.flipV }, d)
export const setCopies = (e: ImageEdits, d: Dims, copies: number): ImageEdits =>
  fix({ ...e, copies }, d)

export function setSizeKind(e: ImageEdits, d: Dims, kind: 'auto' | 'fixed'): ImageEdits {
  if (kind === 'auto') return fix({ ...e, size: { kind: 'auto' } }, d)
  return fix({ ...e, size: e.size.kind === 'fixed' ? e.size : defaultFixedSize(printed(e, d)) }, d)
}
export function setFixedAxis(e: ImageEdits, d: Dims, axis: 'width' | 'height'): ImageEdits {
  return e.size.kind === 'fixed' ? fix({ ...e, size: withAxis(printed(e, d), e.size, axis) }, d) : e
}
export function setFixedMm(e: ImageEdits, d: Dims, mm: number): ImageEdits {
  return e.size.kind === 'fixed' ? fix({ ...e, size: { ...e.size, mm } }, d) : e
}
