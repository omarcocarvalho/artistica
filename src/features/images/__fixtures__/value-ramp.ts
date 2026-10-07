import { pngRgb } from './png-rgb.ts'

export const VALUE_RAMP_W = 900
export const VALUE_RAMP_H = 600

/**
 * `value-ramp.png`: a horizontal ramp 0 → 255, grey on the top half and tinted towards ochre on
 * the bottom half, so every lightness band of a value study is populated.
 */
export function valueRampPng(): Buffer {
  return pngRgb(VALUE_RAMP_W, VALUE_RAMP_H, (x, y) => {
    const v = Math.round((x / (VALUE_RAMP_W - 1)) * 255)
    return y < VALUE_RAMP_H / 2 ? [v, v, v] : [v, Math.round(v * 0.85), Math.round(v * 0.55)]
  })
}
