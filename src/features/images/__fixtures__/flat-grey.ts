import { pngRgb, type Rgb } from './png-rgb.ts'

export const FLAT_GREY_W = 1200
export const FLAT_GREY_H = 900
export const FLAT_GREY_RGB: Rgb = [170, 170, 170]

/** `flat-grey.png`: one colour everywhere, so a line drawn on it is told apart from the photo on every engine. */
export function flatGreyPng(): Buffer {
  return pngRgb(FLAT_GREY_W, FLAT_GREY_H, () => FLAT_GREY_RGB)
}
