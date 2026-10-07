import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MIN_SAFE_AREA_MM, normalizePageSetup } from '../../shared/model/page-setup'
import { DEFAULT_STUDY } from '../../shared/model/study'
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
      studyDefaults: { blurPct: 20, values: { count: 6, hue: 135, neutral: false } },
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

describe('studyDefaults', () => {
  const D = { blurPct: DEFAULT_STUDY.blurPct, values: DEFAULT_STUDY.values }

  it('defaults to DEFAULT_STUDY without versions (owner Q5, default)', () => {
    expect(DEFAULT_SETTINGS.studyDefaults).toEqual(D)
    expect('versions' in DEFAULT_SETTINGS.studyDefaults).toBe(false)
  })

  it('fills in the defaults when the field is missing (a v1 object)', () => {
    const v1 = { pageSetup: DEFAULT_SETTINGS.pageSetup, unit: 'in', language: 'en', theme: 'dark' }
    expect(parseSettings(v1)).toEqual({ ...v1, studyDefaults: D })
  })

  it('accepts valid study defaults unchanged', () => {
    const studyDefaults = { blurPct: 12, values: { count: 9, hue: 265, neutral: true } }
    expect(parseSettings({ ...DEFAULT_SETTINGS, studyDefaults }).studyDefaults).toEqual(
      studyDefaults,
    )
  })

  it('keeps the other fields when one study default is invalid', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      unit: 'in',
      studyDefaults: { blurPct: 'lots', values: { count: 9, hue: 265, neutral: false } },
    })
    expect(parsed.unit).toBe('in')
    expect(parsed.studyDefaults).toEqual({
      blurPct: DEFAULT_STUDY.blurPct,
      values: { count: 9, hue: 265, neutral: false },
    })
  })

  it('falls back field by field inside values', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      studyDefaults: { blurPct: 30, values: { count: 99, hue: 'teal', neutral: 'yes' } },
    })
    expect(parsed.studyDefaults).toEqual({ blurPct: 30, values: DEFAULT_STUDY.values })
  })

  it.each([
    ['values is null', { blurPct: 30, values: null }],
    ['values is a string', { blurPct: 30, values: 'x' }],
    ['values is an array', { blurPct: 30, values: [5, 55] }],
    ['values is missing', { blurPct: 30 }],
  ])('defaults only the values when %s, keeping blur and every other field', (_name, sd) => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      unit: 'in',
      theme: 'dark',
      studyDefaults: sd,
    })
    expect(parsed).toEqual({
      ...DEFAULT_SETTINGS,
      unit: 'in',
      theme: 'dark',
      studyDefaults: { blurPct: 30, values: DEFAULT_STUDY.values },
    })
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a number', 7],
    ['an array', [1, 2]],
  ])('defaults the study defaults when they are %s, keeping every other field', (_name, sd) => {
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, unit: 'in', studyDefaults: sd })
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, unit: 'in', studyDefaults: D })
  })

  it('normalises like the image store (hue mod 360, rounding)', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      studyDefaults: { blurPct: 33.6, values: { count: 4.4, hue: 360, neutral: false } },
    })
    expect(parsed.studyDefaults).toEqual({
      blurPct: 34,
      values: { count: 4, hue: 0, neutral: false },
    })
  })

  it('drops a stored versions field (not persisted, owner Q5)', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      studyDefaults: { ...D, versions: ['original', 'values'] },
    })
    expect(parsed.studyDefaults).toEqual(D)
  })

  it('never throws on any study defaults value (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (studyDefaults) => {
        const parsed = parseSettings({ ...DEFAULT_SETTINGS, studyDefaults })
        expect(parsed.studyDefaults.values.count).toBeGreaterThanOrEqual(2)
        expect(parsed.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
      }),
    )
  })
})
