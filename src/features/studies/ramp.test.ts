import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  inSrgbGamut,
  linearRgbToOklab,
  maxChroma,
  oklchToRgb8,
  srgb8ToLinear,
} from '../../shared/colour/oklch'
import { HUE_PRESETS, MAX_VALUES, MIN_VALUES, type StudyValues } from '../../shared/model/study'
import { RAMP_GAMUT_MARGIN, RAMP_L_DARK, RAMP_L_LIGHT, rampChroma, valueRamp } from './ramp'
import { measuredLightness } from './test-support/lightness'

const arbValues: fc.Arbitrary<StudyValues> = fc.record({
  count: fc.integer({ min: MIN_VALUES, max: MAX_VALUES }),
  hue: fc.integer({ min: 0, max: 359 }),
  neutral: fc.boolean(),
})
const lab = (c: { r: number; g: number; b: number }) =>
  linearRgbToOklab(srgb8ToLinear(c.r), srgb8ToLinear(c.g), srgb8ToLinear(c.b))

const hueOf = (a: number, b: number): number => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360

/** Every hue the UI can produce (whole degrees, the presets among them), plain and neutral. */
function* everyUiValues(): Generator<StudyValues> {
  const hues = new Set<number>(Array.from({ length: 360 }, (_, h) => h))
  for (const p of HUE_PRESETS) if (p.hue !== null) hues.add(p.hue)
  for (const hue of hues) {
    for (let count = MIN_VALUES; count <= MAX_VALUES; count++) {
      yield { count, hue, neutral: false }
    }
  }
  for (let count = MIN_VALUES; count <= MAX_VALUES; count++) yield { count, hue: 0, neutral: true }
}

describe('rampChroma', () => {
  it('follows the approved mockup curve', () => {
    expect(rampChroma(0)).toBeCloseTo(0.045, 12)
    expect(rampChroma(0.5)).toBeCloseTo(0.045 + 0.05 - 0.01, 12)
    expect(rampChroma(1)).toBeCloseTo(0.025, 12)
  })
})

describe('valueRamp', () => {
  it('has exactly count colours', () => {
    for (let n = MIN_VALUES; n <= MAX_VALUES; n++) {
      expect(valueRamp({ count: n, hue: 55, neutral: false })).toHaveLength(n)
    }
  })

  it('runs from L 0.20 to L 0.95 (owner D9)', () => {
    fc.assert(
      fc.property(arbValues, (v) => {
        const ramp = valueRamp(v)
        expect(measuredLightness(ramp[0] ?? { r: 0, g: 0, b: 0 })).toBeCloseTo(RAMP_L_DARK, 1.7)
        expect(measuredLightness(ramp[ramp.length - 1] ?? { r: 0, g: 0, b: 0 })).toBeCloseTo(
          RAMP_L_LIGHT,
          1.7,
        )
      }),
    )
  })

  it('is strictly increasing in measured lightness (spec §7)', () => {
    fc.assert(
      fc.property(arbValues, (v) => {
        const Ls = valueRamp(v).map(measuredLightness)
        for (let k = 1; k < Ls.length; k++) expect(Ls[k]).toBeGreaterThan(Ls[k - 1] ?? 1)
      }),
    )
  })

  it('is never white, for every hue (R7: the lightest value is a tint, never paper)', () => {
    for (let hue = 0; hue < 360; hue++) {
      for (const neutral of [false, true]) {
        const last = valueRamp({ count: 20, hue, neutral }).at(-1)
        expect(last).toBeDefined()
        expect(last).not.toEqual({ r: 255, g: 255, b: 255 })
      }
    }
  })

  it('every colour is in gamut', () => {
    fc.assert(
      fc.property(arbValues, (v) => {
        for (const c of valueRamp(v)) {
          const { L, a, b } = lab(c)
          expect(inSrgbGamut(L, Math.hypot(a, b), hueOf(a, b))).toBe(true)
        }
      }),
    )
  })

  it('encodes an in-gamut OKLCH target, rising in lightness, for every UI hue and count', () => {
    // An 8-bit colour is in sRGB by construction, so gamut is asserted on the OKLCH target
    // (M2-R8), and the output must be exactly that target's 8-bit encoding, not a clipped one.
    for (const v of everyUiValues()) {
      const ramp = valueRamp(v)
      expect(ramp).toHaveLength(v.count)
      for (let k = 0; k < v.count; k++) {
        const t = k / (v.count - 1)
        const L = RAMP_L_DARK + (RAMP_L_LIGHT - RAMP_L_DARK) * t
        const C = v.neutral
          ? 0
          : Math.max(0, Math.min(rampChroma(t), maxChroma(L, v.hue) - RAMP_GAMUT_MARGIN))
        expect(inSrgbGamut(L, C, v.hue)).toBe(true)
        expect(ramp[k]).toEqual(oklchToRgb8(L, C, v.hue))
        if (k > 0) {
          expect(measuredLightness(ramp[k] ?? { r: 0, g: 0, b: 0 })).toBeGreaterThan(
            measuredLightness(ramp[k - 1] ?? { r: 255, g: 255, b: 255 }),
          )
        }
      }
    }
  })

  it('keeps the hue where the colour is clearly chromatic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 359 }),
        fc.integer({ min: 2, max: 20 }),
        (hue, count) => {
          for (const c of valueRamp({ count, hue, neutral: false })) {
            const { a, b } = lab(c)
            if (Math.hypot(a, b) < 0.04) continue
            const diff = Math.abs(((hueOf(a, b) - hue + 540) % 360) - 180)
            expect(diff).toBeLessThanOrEqual(5)
          }
        },
      ),
    )
  })

  it('neutral is grey and ignores the hue', () => {
    const a = valueRamp({ count: 7, hue: 10, neutral: true })
    const b = valueRamp({ count: 7, hue: 250, neutral: true })
    expect(a).toEqual(b)
    for (const c of a) {
      expect(c.r).toBe(c.g)
      expect(c.g).toBe(c.b)
    }
  })

  it('pins the default sepia 5-value ramp', () => {
    // Regenerate only for an intended ramp change (it is what the owner prints at sign-off).
    expect(valueRamp({ count: 5, hue: 55, neutral: false })).toMatchSnapshot()
  })
})
