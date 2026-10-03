import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MIN_SAFE_AREA_MM, normalizePageSetup } from '../../shared/model/page-setup'
import { DEFAULT_SETTINGS, parseSettings, settingsSchema } from './schema'

describe('parseSettings', () => {
  it('returns defaults for non-objects', () => {
    for (const bad of [undefined, null, 'x', 42, true, [], [1, 2]]) {
      expect(parseSettings(bad)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('accepts valid settings unchanged', () => {
    const valid = {
      pageSetup: {
        paper: 'Letter',
        customSize: { w: 100, h: 200 },
        orientation: 'landscape',
        safeAreaMm: 8,
        gutter: { enabled: true, mm: 10 },
        cropMarks: false,
        bleed: { enabled: true, mm: 3 },
      },
      unit: 'in',
      language: 'en',
      theme: 'dark',
    }
    expect(parseSettings(valid)).toEqual(valid)
  })

  it('keeps good fields and defaults only the bad ones', () => {
    const out = parseSettings({ unit: 'in', theme: 'neon', language: 'xx', pageSetup: 'nope' })
    expect(out.unit).toBe('in')
    expect(out.theme).toBe('auto')
    expect(out.language).toBeNull()
    expect(out.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
  })

  it('defaults individual bad page-setup fields', () => {
    const out = parseSettings({
      pageSetup: {
        paper: 'B5',
        safeAreaMm: -2,
        bleed: { enabled: 'yes', mm: 1e9 },
        cropMarks: false,
      },
    })
    expect(out.pageSetup.paper).toBe('A4')
    expect(out.pageSetup.safeAreaMm).toBe(DEFAULT_SETTINGS.pageSetup.safeAreaMm)
    expect(out.pageSetup.bleed).toEqual(DEFAULT_SETTINGS.pageSetup.bleed)
    expect(out.pageSetup.cropMarks).toBe(false)
  })

  it('raises an out-of-contract safe area and applies the bleed rule', () => {
    const out = parseSettings({
      pageSetup: {
        safeAreaMm: 1,
        gutter: { enabled: false, mm: 0 },
        bleed: { enabled: true, mm: 3 },
      },
    })
    expect(out.pageSetup.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
    expect(out.pageSetup.gutter).toEqual({ enabled: true, mm: 6 })
  })

  it('portrait-normalises a landscape custom size', () => {
    const out = parseSettings({ pageSetup: { paper: 'Custom', customSize: { w: 400, h: 100 } } })
    expect(out.pageSetup.customSize).toEqual({ w: 100, h: 400 })
  })

  it('rejects custom sizes outside 50..1200 mm', () => {
    expect(
      parseSettings({ pageSetup: { customSize: { w: 10, h: 5000 } } }).pageSetup.customSize,
    ).toEqual(DEFAULT_SETTINGS.pageSetup.customSize)
  })

  it('treats NaN, Infinity and huge numbers as invalid', () => {
    const out = parseSettings({
      pageSetup: { safeAreaMm: Number.NaN, gutter: { mm: Number.POSITIVE_INFINITY } },
    })
    expect(out.pageSetup.safeAreaMm).toBe(5)
    expect(out.pageSetup.gutter.mm).toBe(6)
  })

  it('never throws and always returns a normalised result for any JSON (property)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (json) => {
        const out = parseSettings(json)
        expect(settingsSchema.safeParse(out).success).toBe(true)
        expect(normalizePageSetup(out.pageSetup).notes).toEqual([])
      }),
    )
  })

  it('survives objects with hostile shapes (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          pageSetup: fc.anything(),
          unit: fc.anything(),
          language: fc.anything(),
          theme: fc.anything(),
        }),
        (obj) => {
          expect(() => parseSettings(obj)).not.toThrow()
        },
      ),
    )
  })
})
