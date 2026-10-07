import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  BLUR_SIGMA_AT_MAX,
  DEFAULT_STUDY,
  HUE_PRESETS,
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
  STUDY_VERSIONS,
  patchStudy,
  sanitizeStudy,
  studyEqual,
  studyKey,
  tileFormat,
  tileStudyFor,
  withVersion,
  type StudySettings,
  type StudyVersion,
  type TileStudy,
} from './study'

const arbVersion = fc.constantFrom<StudyVersion>(...STUDY_VERSIONS)
/** Anything a corrupted store or a careless caller could hand us. */
const arbRawStudy: fc.Arbitrary<StudySettings> = fc.record({
  versions: fc.array(fc.oneof(arbVersion, fc.string() as fc.Arbitrary<StudyVersion>), {
    maxLength: 6,
  }),
  blurPct: fc.oneof(
    fc.double(),
    fc.double({ min: -50, max: 500 }),
    fc.integer({ min: -50, max: 500 }),
  ),
  values: fc.record({
    count: fc.oneof(fc.double(), fc.double({ min: -5, max: 50 }), fc.integer({ min: -5, max: 50 })),
    hue: fc.oneof(fc.double(), fc.integer({ min: -1000, max: 1000 })),
    neutral: fc.boolean(),
  }),
})

describe('DEFAULT_STUDY (owner Q1–Q4, default)', () => {
  it('is Original only, 40% blur, 5 values, sepia', () => {
    expect(DEFAULT_STUDY).toEqual({
      versions: ['original'],
      blurPct: 40,
      values: { count: 5, hue: 55, neutral: false },
    })
  })
  it('is already sanitized', () => {
    expect(sanitizeStudy(DEFAULT_STUDY)).toEqual(DEFAULT_STUDY)
  })
})

describe('ranges (spec §2.5, §2.6)', () => {
  it('blur is 1–100 %, values 2–20, σ at 100 % is 5 % of the short side', () => {
    expect([MIN_BLUR_PCT, MAX_BLUR_PCT, MIN_VALUES, MAX_VALUES]).toEqual([1, 100, 2, 20])
    expect(BLUR_SIGMA_AT_MAX).toBe(0.05)
  })
})

describe('HUE_PRESETS (D8)', () => {
  it('lists the mockup swatches in order', () => {
    expect(HUE_PRESETS.map((p) => [p.id, p.hue])).toEqual([
      ['sepia', 55],
      ['terracotta', 35],
      ['ochre', 85],
      ['sapGreen', 135],
      ['teal', 195],
      ['ultramarine', 265],
      ['violet', 305],
      ['neutral', null],
    ])
  })
})

describe('sanitizeStudy', () => {
  it('keeps versions in canonical order without duplicates', () => {
    const s = sanitizeStudy({ ...DEFAULT_STUDY, versions: ['values', 'original', 'values'] })
    expect(s.versions).toEqual(['original', 'values'])
  })
  it('falls back to Original when no version is valid', () => {
    expect(sanitizeStudy({ ...DEFAULT_STUDY, versions: [] }).versions).toEqual(['original'])
    expect(
      sanitizeStudy({ ...DEFAULT_STUDY, versions: ['bogus' as StudyVersion] }).versions,
    ).toEqual(['original'])
  })
  it('clamps and rounds blur and value count, wraps hue', () => {
    const s = sanitizeStudy({
      versions: ['blurred'],
      blurPct: 140.6,
      values: { count: 1.2, hue: -5, neutral: true },
    })
    expect(s).toEqual({
      versions: ['blurred'],
      blurPct: 100,
      values: { count: 2, hue: 355, neutral: true },
    })
    expect(
      sanitizeStudy({ ...DEFAULT_STUDY, values: { count: 99, hue: 360, neutral: false } }).values,
    ).toEqual({
      count: MAX_VALUES,
      hue: 0,
      neutral: false,
    })
  })
  it('rounds in-range blur and value count to the nearest integer', () => {
    const s = sanitizeStudy({
      ...DEFAULT_STUDY,
      blurPct: 40.6,
      values: { count: 7.4, hue: 54.5, neutral: false },
    })
    expect(s).toEqual({
      ...DEFAULT_STUDY,
      blurPct: 41,
      values: { count: 7, hue: 55, neutral: false },
    })
  })
  it('treats only `true` as neutral', () => {
    for (const neutral of [1, 'yes', 'true', {}, []]) {
      const raw = { ...DEFAULT_STUDY, values: { ...DEFAULT_STUDY.values, neutral } }
      expect(sanitizeStudy(raw as unknown as StudySettings).values.neutral).toBe(false)
    }
    expect(
      sanitizeStudy(patchStudy(DEFAULT_STUDY, { values: { neutral: true } })).values.neutral,
    ).toBe(true)
  })
  it('replaces non-finite numbers with the defaults', () => {
    const s = sanitizeStudy({
      versions: ['original'],
      blurPct: Number.NaN,
      values: { count: Number.POSITIVE_INFINITY, hue: Number.NaN, neutral: false },
    })
    expect(s.blurPct).toBe(DEFAULT_STUDY.blurPct)
    expect(s.values.count).toBe(DEFAULT_STUDY.values.count)
    expect(s.values.hue).toBe(DEFAULT_STUDY.values.hue)
  })
  it('is total and idempotent, and always in range (property)', () => {
    fc.assert(
      fc.property(arbRawStudy, (raw) => {
        const s = sanitizeStudy(raw)
        expect(sanitizeStudy(s)).toEqual(s)
        expect(s.versions.length).toBeGreaterThanOrEqual(1)
        expect([...s.versions]).toEqual(STUDY_VERSIONS.filter((v) => s.versions.includes(v)))
        expect(Number.isInteger(s.blurPct)).toBe(true)
        expect(s.blurPct).toBeGreaterThanOrEqual(MIN_BLUR_PCT)
        expect(s.blurPct).toBeLessThanOrEqual(MAX_BLUR_PCT)
        expect(Number.isInteger(s.values.count)).toBe(true)
        expect(s.values.count).toBeGreaterThanOrEqual(MIN_VALUES)
        expect(s.values.count).toBeLessThanOrEqual(MAX_VALUES)
        expect(s.values.hue).toBeGreaterThanOrEqual(0)
        expect(s.values.hue).toBeLessThan(360)
        expect(Object.is(s.values.hue, -0)).toBe(false)
      }),
    )
  })
})

describe('withVersion', () => {
  it('turns versions on in canonical order', () => {
    const s = withVersion(withVersion(DEFAULT_STUDY, 'values', true), 'blurred', true)
    expect(s.versions).toEqual(['original', 'blurred', 'values'])
  })
  it('turns versions off', () => {
    const s = withVersion({ ...DEFAULT_STUDY, versions: ['original', 'values'] }, 'original', false)
    expect(s.versions).toEqual(['values'])
  })
  it('never turns off the last version (owner Q13, default)', () => {
    const s = { ...DEFAULT_STUDY, versions: ['values'] as const }
    expect(withVersion(s, 'values', false)).toBe(s)
  })
  it('never empties the selection (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(arbVersion, fc.boolean())), (ops) => {
        let s: StudySettings = DEFAULT_STUDY
        for (const [v, on] of ops) s = withVersion(s, v, on)
        expect(s.versions.length).toBeGreaterThanOrEqual(1)
      }),
    )
  })
})

describe('patchStudy', () => {
  it('merges values one level deep and ignores undefined', () => {
    const s = patchStudy(DEFAULT_STUDY, { values: { hue: 200, count: undefined } })
    expect(s.values).toEqual({ count: 5, hue: 200, neutral: false })
  })
  it('keeps unpatched non-default values when another value is patched', () => {
    const base: StudySettings = {
      versions: ['original', 'values'],
      blurPct: 70,
      values: { count: 9, hue: 200, neutral: true },
    }
    expect(patchStudy(base, { values: { hue: 10, count: undefined } })).toEqual({
      versions: ['original', 'values'],
      blurPct: 70,
      values: { count: 9, hue: 10, neutral: true },
    })
    expect(patchStudy(base, { blurPct: undefined, values: { neutral: undefined } })).toEqual(base)
  })
  it('replaces the versions', () => {
    const s = patchStudy(DEFAULT_STUDY, { versions: ['blurValues', 'blurred'] })
    expect(s.versions).toEqual(['blurred', 'blurValues'])
  })
  it('sanitizes the result', () => {
    expect(patchStudy(DEFAULT_STUDY, { blurPct: 0 }).blurPct).toBe(MIN_BLUR_PCT)
  })
})

describe('studyEqual', () => {
  it('compares field by field', () => {
    expect(studyEqual(DEFAULT_STUDY, { ...DEFAULT_STUDY, versions: ['original'] })).toBe(true)
    expect(studyEqual(DEFAULT_STUDY, patchStudy(DEFAULT_STUDY, { blurPct: 41 }))).toBe(false)
    expect(
      studyEqual(DEFAULT_STUDY, patchStudy(DEFAULT_STUDY, { values: { neutral: true } })),
    ).toBe(false)
    expect(studyEqual(DEFAULT_STUDY, withVersion(DEFAULT_STUDY, 'values', true))).toBe(false)
    expect(studyEqual(DEFAULT_STUDY, patchStudy(DEFAULT_STUDY, { values: { count: 6 } }))).toBe(
      false,
    )
    expect(studyEqual(DEFAULT_STUDY, patchStudy(DEFAULT_STUDY, { values: { hue: 56 } }))).toBe(
      false,
    )
    expect(studyEqual(DEFAULT_STUDY, { ...DEFAULT_STUDY, versions: ['values'] })).toBe(false)
  })
})

describe('tileStudyFor', () => {
  const s: StudySettings = {
    versions: [...STUDY_VERSIONS],
    blurPct: 30,
    values: { count: 4, hue: 10, neutral: false },
  }
  it('maps each version to what its tile needs', () => {
    expect(tileStudyFor('original', s)).toBeNull()
    expect(tileStudyFor('blurred', s)).toEqual({ blurPct: 30, values: null })
    expect(tileStudyFor('values', s)).toEqual({ blurPct: null, values: s.values })
    expect(tileStudyFor('blurValues', s)).toEqual({ blurPct: 30, values: s.values })
  })
})

describe('studyKey', () => {
  it('has a readable, stable format', () => {
    expect(studyKey(null)).toBe('-')
    expect(studyKey({ blurPct: 40, values: null })).toBe('b40')
    expect(studyKey({ blurPct: null, values: { count: 5, hue: 55, neutral: false } })).toBe('v5h55')
    expect(studyKey({ blurPct: 40, values: { count: 5, hue: 55, neutral: false } })).toBe(
      'b40v5h55',
    )
    expect(studyKey({ blurPct: null, values: { count: 5, hue: 55, neutral: true } })).toBe('v5n')
    expect(studyKey({ blurPct: null, values: { count: 5, hue: 99, neutral: true } })).toBe('v5n')
  })
  it('differs whenever the tile pixels would differ (property)', () => {
    const arbTile: fc.Arbitrary<TileStudy | null> = fc.option(
      fc.record({
        blurPct: fc.option(fc.integer({ min: 1, max: 100 })),
        values: fc.option(
          fc.record({
            count: fc.integer({ min: 2, max: 20 }),
            hue: fc.integer({ min: 0, max: 359 }),
            neutral: fc.boolean(),
          }),
        ),
      }),
    )
    // Same pixels ⇔ same blur, same count, same neutral, and same hue unless neutral.
    const samePixels = (a: TileStudy | null, b: TileStudy | null): boolean => {
      if (a === null || b === null) return a === b
      if (a.blurPct !== b.blurPct) return false
      if (a.values === null || b.values === null) return a.values === b.values
      return (
        a.values.count === b.values.count &&
        a.values.neutral === b.values.neutral &&
        (a.values.neutral || a.values.hue === b.values.hue)
      )
    }
    fc.assert(
      fc.property(arbTile, arbTile, (a, b) => {
        expect(studyKey(a) === studyKey(b)).toBe(samePixels(a, b))
      }),
    )
  })
})

describe('tileFormat (M2-R9)', () => {
  it('uses PNG for flat value studies and JPEG for photos', () => {
    expect(STUDY_VERSIONS.map(tileFormat)).toEqual(['jpeg', 'jpeg', 'png', 'png'])
  })
})
