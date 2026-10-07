import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MIN_SAFE_AREA_MM, normalizePageSetup } from '../../shared/model/page-setup'
import {
  DEFAULT_STUDY,
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
} from '../../shared/model/study'
import {
  DEFAULT_SETTINGS,
  normalizeStudyDefaults,
  parseSettings,
  type SettingsData,
} from './schema'

function expectNormalised(out: SettingsData): void {
  expect(Object.keys(out).sort()).toEqual([
    'language',
    'pageSetup',
    'studyDefaults',
    'theme',
    'unit',
  ])
  expect(normalizePageSetup(out.pageSetup).notes).toEqual([])
  const { blurPct, values } = out.studyDefaults
  expect(Object.keys(out.studyDefaults).sort()).toEqual(['blurPct', 'values'])
  expect(Object.keys(values).sort()).toEqual(['count', 'hue', 'neutral'])
  expect(Number.isInteger(blurPct)).toBe(true)
  expect(blurPct).toBeGreaterThanOrEqual(MIN_BLUR_PCT)
  expect(blurPct).toBeLessThanOrEqual(MAX_BLUR_PCT)
  expect(Number.isInteger(values.count)).toBe(true)
  expect(values.count).toBeGreaterThanOrEqual(MIN_VALUES)
  expect(values.count).toBeLessThanOrEqual(MAX_VALUES)
  expect(Number.isInteger(values.hue)).toBe(true)
  expect(values.hue).toBeGreaterThanOrEqual(0)
  expect(values.hue).toBeLessThan(360)
  expect(typeof values.neutral).toBe('boolean')
  expect(parseSettings(out)).toEqual(out)
}

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
        expectNormalised(parseSettings(json))
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
          studyDefaults: fc.anything(),
        }),
        (obj) => {
          expectNormalised(parseSettings(obj))
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
      studyDefaults: { blurPct: 30, values: { count: 'many', hue: 'teal', neutral: 'yes' } },
    })
    expect(parsed.studyDefaults).toEqual({ blurPct: 30, values: DEFAULT_STUDY.values })
  })

  it.each([
    ['count', { count: 'many', hue: 265, neutral: true }, { count: 5, hue: 265, neutral: true }],
    ['hue', { count: 9, hue: 'teal', neutral: true }, { count: 9, hue: 55, neutral: true }],
    ['neutral', { count: 9, hue: 265, neutral: 'yes' }, { count: 9, hue: 265, neutral: false }],
  ])('defaults only the %s when it alone has the wrong type', (_name, values, want) => {
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, studyDefaults: { blurPct: 30, values } })
    expect(parsed.studyDefaults).toEqual({ blurPct: 30, values: want })
  })

  const sd = (blurPct: number, count: number, hue: number) => ({
    blurPct,
    values: { count, hue, neutral: true },
  })

  it.each([
    ['blur above the range clamps', sd(250, 7, 135), sd(100, 7, 135)],
    ['blur below the range clamps', sd(-5, 7, 135), sd(1, 7, 135)],
    ['blur 0 clamps to 1', sd(0, 7, 135), sd(1, 7, 135)],
    ['count above the range clamps', sd(30, 99, 135), sd(30, 20, 135)],
    ['count below the range clamps', sd(30, 1, 135), sd(30, 2, 135)],
    ['hue above 360 wraps', sd(30, 7, 420), sd(30, 7, 60)],
    ['negative hue wraps', sd(30, 7, -30), sd(30, 7, 330)],
    ['hue 720.4 wraps and rounds', sd(30, 7, 720.4), sd(30, 7, 0)],
  ])('%s, the same on load as in setStudyDefaults', (_name, stored, want) => {
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, unit: 'in', studyDefaults: stored })
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, unit: 'in', studyDefaults: want })
    expect(normalizeStudyDefaults(stored)).toEqual(want)
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

  it('never throws on any study defaults value and keeps the other fields (property)', () => {
    const others = { ...DEFAULT_SETTINGS, unit: 'in', language: 'en', theme: 'dark' } as const
    fc.assert(
      fc.property(fc.anything(), (studyDefaults) => {
        const parsed = parseSettings({ ...others, studyDefaults })
        expectNormalised(parsed)
        expect({ ...parsed, studyDefaults: null }).toEqual({ ...others, studyDefaults: null })
      }),
    )
  })

  it('loads any well-typed study defaults exactly as setStudyDefaults normalises them (property)', () => {
    const num = fc.oneof(fc.double(), fc.integer({ min: -1000, max: 1000 }))
    fc.assert(
      fc.property(
        fc.record({
          blurPct: num,
          values: fc.record({ count: num, hue: num, neutral: fc.boolean() }),
        }),
        (studyDefaults) => {
          const parsed = parseSettings({ ...DEFAULT_SETTINGS, studyDefaults })
          expect(parsed.studyDefaults).toEqual(normalizeStudyDefaults(studyDefaults))
        },
      ),
    )
  })
})
