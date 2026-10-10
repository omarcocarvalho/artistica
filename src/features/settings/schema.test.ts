import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  activeLineTypes,
  DEFAULT_LINES,
  LINE_WIDTH_STEP_MM,
  MAX_GRID,
  MAX_LINE_OPACITY_PCT,
  MAX_LINE_WIDTH_MM,
  MIN_GRID,
  MIN_LINE_OPACITY_PCT,
  MIN_LINE_WIDTH_MM,
  sanitizeLines,
  SPIRAL_CORNERS,
  type LineSettings,
} from '../../shared/model/lines'
import { MIN_SAFE_AREA_MM, normalizePageSetup } from '../../shared/model/page-setup'
import { MAX_PRESETS, sanitizePreset } from '../../shared/model/preset'
import {
  DEFAULT_STUDY,
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
  type StudySettings,
} from '../../shared/model/study'
import {
  DEFAULT_SETTINGS,
  normalizeLineDefaults,
  normalizeStudyDefaults,
  parseSettings,
  type SettingsData,
} from './schema'

function expectNormalisedLines(lines: LineSettings): void {
  expect(Object.keys(lines).sort()).toEqual([
    'armature',
    'centre',
    'edges',
    'face',
    'golden',
    'grid',
    'pose',
    'spiral',
    'style',
    'thirds',
  ])
  expect(Object.keys(lines.grid).sort()).toEqual(['cols', 'on', 'rows'])
  expect(Object.keys(lines.edges).sort()).toEqual(['detailPct', 'on'])
  expect(Object.keys(lines.spiral).sort()).toEqual(['corner', 'on'])
  expect(Object.keys(lines.style).sort()).toEqual(['colour', 'opacityPct', 'widthMm'])
  expect(activeLineTypes(lines)).toEqual([])
  for (const n of [lines.grid.cols, lines.grid.rows]) {
    expect(Number.isInteger(n)).toBe(true)
    expect(n).toBeGreaterThanOrEqual(MIN_GRID)
    expect(n).toBeLessThanOrEqual(MAX_GRID)
  }
  expect(SPIRAL_CORNERS).toContain(lines.spiral.corner)
  expect(lines.style.colour).toMatch(/^#[0-9a-f]{6}$/)
  const { widthMm, opacityPct } = lines.style
  expect(widthMm).toBeGreaterThanOrEqual(MIN_LINE_WIDTH_MM)
  expect(widthMm).toBeLessThanOrEqual(MAX_LINE_WIDTH_MM)
  const steps = widthMm / LINE_WIDTH_STEP_MM
  expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9)
  expect(Math.round(widthMm * 100) / 100).toBe(widthMm)
  expect(Number.isInteger(opacityPct)).toBe(true)
  expect(opacityPct).toBeGreaterThanOrEqual(MIN_LINE_OPACITY_PCT)
  expect(opacityPct).toBeLessThanOrEqual(MAX_LINE_OPACITY_PCT)
  expect(sanitizeLines(lines)).toEqual(lines)
  expect(normalizeLineDefaults(lines)).toEqual(lines)
}

function expectNormalised(out: SettingsData): void {
  expect(Object.keys(out).sort()).toEqual([
    'language',
    'lineDefaults',
    'pageSetup',
    'presets',
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
  expectNormalisedLines(out.lineDefaults)
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
      lineDefaults: {
        grid: { on: false, cols: 3, rows: 2 },
        thirds: false,
        armature: false,
        golden: false,
        spiral: { on: false, corner: 'bottomRight' },
        centre: false,
        style: { colour: '#112233', widthMm: 1.25, opacityPct: 40 },
        edges: { on: false, detailPct: 50 },
        face: false,
        pose: false,
      },
      presets: [],
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
          lineDefaults: fc.anything(),
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
    expect(parseSettings(v1)).toEqual({
      ...v1,
      studyDefaults: D,
      lineDefaults: DEFAULT_LINES,
      presets: [],
    })
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

const anyValue = fc.oneof(
  fc.double(),
  fc.integer({ min: -1000, max: 1000 }),
  fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, -0),
  fc.string(),
  fc.constantFrom('3', '0.5', '#ABCDEF', ' #abcdef ', 'topRight'),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.integer()),
)
const anyLines = fc.record({
  grid: fc.oneof(fc.record({ on: anyValue, cols: anyValue, rows: anyValue }), anyValue),
  thirds: anyValue,
  armature: anyValue,
  golden: anyValue,
  spiral: fc.oneof(
    fc.record({ on: anyValue, corner: fc.oneof(fc.constantFrom(...SPIRAL_CORNERS), anyValue) }),
    anyValue,
  ),
  centre: anyValue,
  style: fc.oneof(
    fc.record({
      colour: fc.oneof(fc.constantFrom('#a1b2c3', '#A1B2C3', '#abc', 'red'), anyValue),
      widthMm: anyValue,
      opacityPct: anyValue,
    }),
    anyValue,
  ),
  edges: fc.oneof(fc.record({ on: anyValue, detailPct: anyValue }), anyValue),
  face: anyValue,
  pose: anyValue,
}) as fc.Arbitrary<unknown> as fc.Arbitrary<LineSettings>

describe('lineDefaults (v3)', () => {
  it('defaults to DEFAULT_LINES', () => {
    expect(DEFAULT_SETTINGS.lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('a v2 envelope keeps every field and gains the default lines', () => {
    const v2 = {
      pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'Letter' },
      unit: 'in',
      language: 'en',
      theme: 'dark',
      studyDefaults: { blurPct: 70, values: { count: 7, hue: 200, neutral: false } },
    }
    expect(parseSettings(v2)).toEqual({ ...v2, lineDefaults: DEFAULT_LINES, presets: [] })
  })

  it('a v1 envelope still loads, with default studies and lines', () => {
    const v1 = { pageSetup: DEFAULT_SETTINGS.pageSetup, unit: 'in', language: 'ja', theme: 'light' }
    expect(parseSettings(v1)).toEqual({
      ...v1,
      studyDefaults: DEFAULT_SETTINGS.studyDefaults,
      lineDefaults: DEFAULT_LINES,
      presets: [],
    })
  })

  it('one bad field keeps the others', () => {
    const s = parseSettings({
      lineDefaults: {
        ...DEFAULT_LINES,
        grid: 'nope',
        spiral: { on: false, corner: 'bottomLeft' },
        style: { colour: '#112233', widthMm: 'x', opacityPct: 50 },
      },
    })
    expect(s.lineDefaults).toEqual({
      ...DEFAULT_LINES,
      spiral: { on: false, corner: 'bottomLeft' },
      style: { colour: '#112233', widthMm: DEFAULT_LINES.style.widthMm, opacityPct: 50 },
    })
  })

  it.each([
    ['cols as a numeric string', { cols: '3', rows: 2 }, { cols: 4, rows: 2 }],
    ['rows as Infinity', { cols: 3, rows: Number.POSITIVE_INFINITY }, { cols: 3, rows: 5 }],
    ['cols as -Infinity', { cols: Number.NEGATIVE_INFINITY, rows: 2 }, { cols: 4, rows: 2 }],
    ['cols as NaN', { cols: Number.NaN, rows: 2 }, { cols: 4, rows: 2 }],
    ['cols as a boolean', { cols: true, rows: 2 }, { cols: 4, rows: 2 }],
    ['cols as an array', { cols: [3], rows: 2 }, { cols: 4, rows: 2 }],
  ])('a malformed grid size never coerces: %s', (_name, size, want) => {
    const s = parseSettings({
      unit: 'in',
      lineDefaults: { ...DEFAULT_LINES, grid: { on: false, ...size } },
    })
    expect(s.unit).toBe('in')
    expect(s.lineDefaults.grid).toEqual({ on: false, ...want })
  })

  it('defaults the whole grid when it is an array', () => {
    const s = parseSettings({ lineDefaults: { ...DEFAULT_LINES, grid: [3, 3] } })
    expect(s.lineDefaults.grid).toEqual(DEFAULT_LINES.grid)
  })

  it.each([
    ['widthMm as a numeric string', 'widthMm', '1'],
    ['widthMm as Infinity', 'widthMm', Number.POSITIVE_INFINITY],
    ['widthMm as a boolean', 'widthMm', true],
    ['opacityPct as a numeric string', 'opacityPct', '50'],
    ['opacityPct as -Infinity', 'opacityPct', Number.NEGATIVE_INFINITY],
    ['opacityPct as an array', 'opacityPct', [50]],
    ['colour as a number', 'colour', 0x112233],
    ['colour as short hex', 'colour', '#123'],
  ] as const)('a malformed style field takes its default alone: %s', (_name, key, bad) => {
    const style = { colour: '#112233', widthMm: 1.5, opacityPct: 40 }
    const s = parseSettings({ lineDefaults: { ...DEFAULT_LINES, style: { ...style, [key]: bad } } })
    expect(s.lineDefaults.style).toEqual({ ...style, [key]: DEFAULT_LINES.style[key] })
  })

  it.each([
    [
      'grid outside the range',
      { grid: { on: false, cols: 99, rows: 0 } },
      { grid: { on: false, cols: 20, rows: 1 } },
    ],
    [
      'a fractional grid',
      { grid: { on: false, cols: 2.6, rows: 3.4 } },
      { grid: { on: false, cols: 3, rows: 3 } },
    ],
    [
      'a width below the range',
      { style: { colour: '#000000', widthMm: 0, opacityPct: 90 } },
      { style: { colour: '#000000', widthMm: 0.1, opacityPct: 90 } },
    ],
    [
      'a width off the step and an opacity below the range',
      { style: { colour: '#000000', widthMm: 1.37, opacityPct: 5 } },
      { style: { colour: '#000000', widthMm: 1.35, opacityPct: 10 } },
    ],
    [
      'an uppercase colour, a width and an opacity above the range',
      { style: { colour: '#ABCDEF', widthMm: 9, opacityPct: 150.4 } },
      { style: { colour: '#abcdef', widthMm: 2, opacityPct: 100 } },
    ],
    [
      'an unknown corner',
      { spiral: { on: false, corner: 'middle' } },
      { spiral: { on: false, corner: 'topLeft' } },
    ],
  ])('%s is normalised on load as normalizeLineDefaults does', (_name, stored, want) => {
    const raw = { ...DEFAULT_LINES, ...stored } as LineSettings
    const s = parseSettings({ lineDefaults: raw })
    expect(s.lineDefaults).toEqual({ ...DEFAULT_LINES, ...want })
    expect(normalizeLineDefaults(raw)).toEqual(s.lineDefaults)
  })

  it('line types are not remembered; style, grid size and corner are (owner Q7, default)', () => {
    const s = parseSettings({
      lineDefaults: {
        grid: { on: true, cols: 3, rows: 3 },
        thirds: true,
        armature: true,
        golden: true,
        spiral: { on: true, corner: 'bottomLeft' },
        centre: true,
        style: { colour: '#000000', widthMm: 1, opacityPct: 100 },
      },
    })
    expect(activeLineTypes(s.lineDefaults)).toEqual([])
    expect(s.lineDefaults).toEqual({
      ...DEFAULT_LINES,
      grid: { on: false, cols: 3, rows: 3 },
      spiral: { on: false, corner: 'bottomLeft' },
      style: { colour: '#000000', widthMm: 1, opacityPct: 100 },
    })
  })

  it('strips unknown keys', () => {
    const s = parseSettings({
      lineDefaults: {
        ...DEFAULT_LINES,
        edge: true,
        grid: { ...DEFAULT_LINES.grid, extra: 1 },
        style: { ...DEFAULT_LINES.style, dash: [1, 2] },
      },
    })
    expect(s.lineDefaults).toEqual(DEFAULT_LINES)
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a number', 7],
    ['an array', [1, 2]],
  ])('defaults the line defaults when they are %s, keeping every other field', (_name, ld) => {
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, unit: 'in', lineDefaults: ld })
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, unit: 'in', lineDefaults: DEFAULT_LINES })
  })

  it('normalizeLineDefaults is sanitizeLines with every type off, and idempotent (property)', () => {
    fc.assert(
      fc.property(anyLines, (raw) => {
        const once = normalizeLineDefaults(raw)
        expectNormalisedLines(once)
        const sanitized = sanitizeLines(raw)
        expect(once).toEqual({
          ...sanitized,
          grid: { ...sanitized.grid, on: false },
          thirds: false,
          armature: false,
          golden: false,
          spiral: { ...sanitized.spiral, on: false },
          centre: false,
          edges: { ...sanitized.edges, on: false },
          face: false,
          pose: false,
        })
      }),
    )
  })

  it('loads any stored line defaults exactly as normalizeLineDefaults gives them, keeping the other fields (property)', () => {
    const others = { ...DEFAULT_SETTINGS, unit: 'in', language: 'en', theme: 'dark' } as const
    fc.assert(
      fc.property(fc.oneof(anyLines, fc.anything()), (lineDefaults) => {
        const parsed = parseSettings({ ...others, lineDefaults })
        expectNormalised(parsed)
        expect(parsed.lineDefaults).toEqual(normalizeLineDefaults(lineDefaults as LineSettings))
        expect({ ...parsed, lineDefaults: null }).toEqual({ ...others, lineDefaults: null })
      }),
    )
  })
})

describe('lineDefaults (v4): the edge detail', () => {
  const v3 = {
    pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'Letter', safeAreaMm: 7 },
    unit: 'in',
    language: 'ja',
    theme: 'dark',
    studyDefaults: { blurPct: 70, values: { count: 7, hue: 200, neutral: true } },
    lineDefaults: {
      grid: { on: false, cols: 3, rows: 2 },
      thirds: false,
      armature: false,
      golden: false,
      spiral: { on: false, corner: 'bottomRight' },
      centre: false,
      style: { colour: '#1f3fbf', widthMm: 1.35, opacityPct: 56 },
    },
  } as const

  it('a v3 envelope loads with every field and the default edge detail 50', () => {
    expect(parseSettings(v3)).toEqual({
      ...v3,
      lineDefaults: {
        ...v3.lineDefaults,
        edges: { on: false, detailPct: 50 },
        face: false,
        pose: false,
      },
      presets: [],
    })
  })

  it('v2 and v1 envelopes still load', () => {
    const { pageSetup, unit, language, theme, studyDefaults } = v3
    const v2 = { pageSetup, unit, language, theme, studyDefaults }
    expect(parseSettings(v2)).toEqual({ ...v2, lineDefaults: DEFAULT_LINES, presets: [] })
    const v1 = { pageSetup, unit, language, theme }
    expect(parseSettings(v1)).toEqual({
      ...v1,
      studyDefaults: DEFAULT_SETTINGS.studyDefaults,
      lineDefaults: DEFAULT_LINES,
      presets: [],
    })
  })

  it('a stored detail is kept', () => {
    const lineDefaults = { ...v3.lineDefaults, edges: { on: false, detailPct: 73 } }
    expect(parseSettings({ ...v3, lineDefaults }).lineDefaults).toEqual({
      ...DEFAULT_LINES,
      ...lineDefaults,
    })
  })

  it.each([
    ['below the range', 0, 1],
    ['negative', -40, 1],
    ['above the range', 250, 100],
    ['fractional', 37.6, 38],
    ['fractional, rounding down', 12.4, 12],
  ])('a stored detail %s is clamped to 1–100 and rounded', (_name, stored, want) => {
    const s = parseSettings({
      ...v3,
      lineDefaults: { ...v3.lineDefaults, edges: { on: false, detailPct: stored } },
    })
    expect(s.lineDefaults.edges).toEqual({ on: false, detailPct: want })
    expect(s.lineDefaults.style).toEqual(v3.lineDefaults.style)
  })

  it.each([
    ['a numeric string', '70'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
    ['a boolean', true],
    ['an array', [70]],
  ])('a bad detail alone falls back to 50: %s', (_name, bad) => {
    const lineDefaults = { ...v3.lineDefaults, edges: { on: false, detailPct: bad }, face: false }
    const s = parseSettings({ ...v3, lineDefaults })
    expect(s.lineDefaults).toEqual({ ...DEFAULT_LINES, ...v3.lineDefaults })
    expect(s.studyDefaults).toEqual(v3.studyDefaults)
  })

  it.each([
    ['a string', 'x'],
    ['a number', 70],
    ['an array', [false, 70]],
  ])('a bad edges object alone falls back to the default: %s', (_name, edges) => {
    const s = parseSettings({ ...v3, lineDefaults: { ...v3.lineDefaults, edges } })
    expect(s.lineDefaults).toEqual({ ...DEFAULT_LINES, ...v3.lineDefaults })
  })

  it('stored guide switches are turned off on load; the detail is kept (owner Q8, default)', () => {
    const lineDefaults = {
      ...v3.lineDefaults,
      edges: { on: true, detailPct: 80 },
      face: true,
      pose: true,
    }
    const s = parseSettings({ ...v3, lineDefaults })
    expect(activeLineTypes(s.lineDefaults)).toEqual([])
    expect(s.lineDefaults).toEqual({
      ...lineDefaults,
      edges: { on: false, detailPct: 80 },
      face: false,
      pose: false,
    })
  })

  it.each([
    ['face', { face: 'yes' }],
    ['pose', { pose: 1 }],
    ['edges.on', { edges: { on: 'true', detailPct: 64 } }],
  ])('a bad guide switch alone keeps the detail and the other fields: %s', (_name, bad) => {
    const lineDefaults = { ...v3.lineDefaults, edges: { on: false, detailPct: 64 }, ...bad }
    const s = parseSettings({ ...v3, lineDefaults })
    expect(s.lineDefaults).toEqual({
      ...v3.lineDefaults,
      edges: { on: false, detailPct: 64 },
      face: false,
      pose: false,
    })
  })

  it.each(Object.keys(DEFAULT_LINES) as (keyof LineSettings)[])(
    'a missing %s alone takes its default and keeps the other stored fields',
    (key) => {
      const stored: LineSettings = {
        ...v3.lineDefaults,
        edges: { on: false, detailPct: 64 },
        face: false,
        pose: false,
      }
      const lineDefaults = Object.fromEntries(Object.entries(stored).filter(([k]) => k !== key))
      expect(parseSettings({ ...v3, lineDefaults }).lineDefaults).toEqual({
        ...stored,
        [key]: DEFAULT_LINES[key],
      })
    },
  )
})

describe('presets (v5)', () => {
  const study: StudySettings = {
    versions: ['original', 'values'],
    blurPct: 25,
    values: { count: 7, hue: 200, neutral: true },
  }
  const stored = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'A3' },
    study,
    lines: { ...DEFAULT_LINES, thirds: true },
    ...over,
  })

  it('defaults to no presets, and a v4 object gains presets []', () => {
    expect(DEFAULT_SETTINGS.presets).toEqual([])
    expect(parseSettings({ theme: 'dark' }).presets).toEqual([])
  })

  it.each([
    ['a string', 'x'],
    ['an object', { a: stored('A') }],
    ['null', null],
  ])('a presets field that is %s loads as [] and keeps the other fields', (_name, presets) => {
    const out = parseSettings({ theme: 'dark', presets })
    expect(out.presets).toEqual([])
    expect(out.theme).toBe('dark')
  })

  it('sanitises stored presets with the preset sanitizer', () => {
    const raw = stored(' A4   values ', {
      pageSetup: { ...DEFAULT_SETTINGS.pageSetup, safeAreaMm: 1 },
      lines: { ...DEFAULT_LINES, thirds: true, face: true, extra: 1 },
    })
    const [p] = parseSettings({ presets: [raw] }).presets
    expect(p).toEqual(sanitizePreset(raw))
    expect(p?.name).toBe('A4 values')
    expect(p?.pageSetup.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
    expect(p?.lines.face).toBe(false)
    expect(p?.study.versions).toEqual(['original', 'values'])
  })

  it('drops one bad preset alone', () => {
    const out = parseSettings({
      presets: [stored('A'), stored(''), { name: 'B', pageSetup: 'x' }, 7, stored('C')],
    })
    expect(out.presets.map((p) => p.name)).toEqual(['A', 'C'])
  })

  it('keeps the first of presets whose names differ only in case or spacing', () => {
    const out = parseSettings({
      presets: [stored('A4 values'), stored(' a4  VALUES ', { study: DEFAULT_STUDY }), stored('B')],
    })
    expect(out.presets.map((p) => p.name)).toEqual(['A4 values', 'B'])
    expect(out.presets[0]?.study).toEqual(study)
  })

  it('keeps at most MAX_PRESETS, counting only the presets that load', () => {
    const many = [stored(''), ...Array.from({ length: 25 }, (_, i) => stored(`P${String(i)}`))]
    const out = parseSettings({ presets: many })
    expect(out.presets).toHaveLength(MAX_PRESETS)
    expect(out.presets[0]?.name).toBe('P0')
    expect(out.presets.at(-1)?.name).toBe('P19')
  })

  it('a duplicate does not take a slot from a later preset', () => {
    const many = [
      stored('A'),
      stored('a'),
      ...Array.from({ length: 19 }, (_, i) => stored(`P${String(i)}`)),
    ]
    expect(
      parseSettings({ presets: many })
        .presets.map((p) => p.name)
        .at(-1),
    ).toBe('P18')
  })

  it('loads any stored presets without throwing (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (presets) => {
        const out = parseSettings({ presets })
        expect(out.presets.length).toBeLessThanOrEqual(MAX_PRESETS)
        for (const p of out.presets) expect(sanitizePreset(p)).toEqual(p)
      }),
    )
  })
})
