import { maxChroma, oklchToRgb8, type Rgb8 } from '../../shared/colour/oklch'
import type { StudyValues } from '../../shared/model/study'

/** Near-black of the hue → its lightest tint (owner D9; never paper white, R7). */
export const RAMP_L_DARK = 0.2
export const RAMP_L_LIGHT = 0.95
/** Chroma kept below the gamut edge, so 8-bit rounding never clips a channel. */
export const RAMP_GAMUT_MARGIN = 0.002

/** Chroma along the ramp (t = 0 darkest … 1 lightest): the curve of the approved mockup. */
export function rampChroma(t: number): number {
  return 0.045 + 0.05 * Math.sin(Math.PI * t) - 0.02 * t
}

/** N colours, darkest first, evenly spaced in OKLab lightness, one hue (M2-R8). */
export function valueRamp(values: StudyValues): readonly Rgb8[] {
  const n = values.count
  return Array.from({ length: n }, (_, k) => {
    const t = n === 1 ? 0 : k / (n - 1)
    const L = RAMP_L_DARK + (RAMP_L_LIGHT - RAMP_L_DARK) * t
    const C = values.neutral
      ? 0
      : Math.max(0, Math.min(rampChroma(t), maxChroma(L, values.hue) - RAMP_GAMUT_MARGIN))
    return oklchToRgb8(L, C, values.hue)
  })
}
