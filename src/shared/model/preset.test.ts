import { describe, expect, it } from 'vitest'
import { DEFAULT_LINES, type LineSettings } from './lines'
import { DEFAULT_PAGE_SETUP, type PageSetup } from './page-setup'
import {
  buildPresetFile,
  MAX_PRESET_FILE_BYTES,
  MAX_PRESET_NAME,
  MAX_PRESETS_PER_FILE,
  parsePresetFile,
  PRESET_FILE_FORMAT,
  PRESET_FILE_MIGRATIONS,
  PRESET_FILE_VERSION,
  presetFromSettings,
  presetName,
  sameName,
  sanitizePreset,
  uniqueName,
  type Preset,
} from './preset'
import { DEFAULT_STUDY, type StudySettings } from './study'

const pageSetup: PageSetup = {
  paper: 'A3',
  customSize: { w: 200, h: 300 },
  orientation: 'landscape',
  safeAreaMm: 8,
  gutter: { enabled: true, mm: 10 },
  cropMarks: false,
  bleed: { enabled: true, mm: 4 },
}
const study: StudySettings = {
  versions: ['original', 'values'],
  blurPct: 25,
  values: { count: 7, hue: 200, neutral: true },
}
const lines: LineSettings = {
  ...DEFAULT_LINES,
  grid: { on: true, cols: 3, rows: 6 },
  thirds: true,
  spiral: { on: true, corner: 'bottomRight' },
  style: { colour: '#112233', widthMm: 0.5, opacityPct: 60 },
  edges: { on: true, detailPct: 70 },
  face: true,
  pose: true,
}

const preset = (name = 'A4 values'): Preset => presetFromSettings(name, { pageSetup, study, lines })

function fileText(presets: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: PRESET_FILE_FORMAT, version: 1, presets, ...extra })
}

describe('presetFromSettings', () => {
  it('keeps the page setup, the study settings with versions, and the line settings without guide switches', () => {
    const p = preset()
    expect(p.name).toBe('A4 values')
    expect(p.pageSetup).toEqual(pageSetup)
    expect(p.study).toEqual(study)
    expect(p.lines).toEqual({
      ...lines,
      edges: { on: false, detailPct: 70 },
      face: false,
      pose: false,
    })
  })

  it('normalises the name', () => {
    expect(preset('  A4   values ').name).toBe('A4 values')
  })

  it('a preset never carries unit, theme or language', () => {
    const settings = {
      pageSetup,
      study,
      lines,
      unit: 'in',
      theme: 'dark',
      language: 'en',
    }
    const p = presetFromSettings('A4', settings)
    expect(Object.keys(p)).toEqual(['name', 'pageSetup', 'study', 'lines'])
    const parsed: unknown = JSON.parse(buildPresetFile([p]))
    const [only] = (parsed as { presets: Record<string, unknown>[] }).presets
    expect(Object.keys(only ?? {})).toEqual(['name', 'pageSetup', 'study', 'lines'])
  })
})

describe('sanitizePreset', () => {
  const base = { name: 'P', pageSetup, study, lines }

  it.each([
    [
      'safe area 1 → 3',
      { pageSetup: { ...pageSetup, safeAreaMm: 1 } },
      ['pageSetup', 'safeAreaMm'],
      3,
    ],
    [
      'bleed on with gutter 2 → gutter 6',
      {
        pageSetup: {
          ...pageSetup,
          gutter: { enabled: true, mm: 2 },
          bleed: { enabled: true, mm: 3 },
        },
      },
      ['pageSetup', 'gutter', 'mm'],
      6,
    ],
    ['blur 900 → 100', { study: { ...study, blurPct: 900 } }, ['study', 'blurPct'], 100],
    [
      'values 1 → 2',
      { study: { ...study, values: { ...study.values, count: 1 } } },
      ['study', 'values', 'count'],
      2,
    ],
    [
      'line width 9 → 2',
      { lines: { ...lines, style: { ...lines.style, widthMm: 9 } } },
      ['lines', 'style', 'widthMm'],
      2,
    ],
    [
      "colour 'red' → default",
      { lines: { ...lines, style: { ...lines.style, colour: 'red' } } },
      ['lines', 'style', 'colour'],
      DEFAULT_LINES.style.colour,
    ],
  ])(
    'sanitizePreset clamps every value with the settings sanitizers: %s',
    (_, patch, path, want) => {
      const out = sanitizePreset({ ...base, ...patch })
      let v: unknown = out
      for (const k of path) v = (v as Record<string, unknown>)[k]
      expect(v).toBe(want)
    },
  )

  it('forces the guide switches off and keeps the edge detail', () => {
    const out = sanitizePreset(base)
    expect(out?.lines.edges).toEqual({ on: false, detailPct: 70 })
    expect(out?.lines.face).toBe(false)
    expect(out?.lines.pose).toBe(false)
    expect(out?.lines.thirds).toBe(true)
  })

  it('stores a custom size portrait-normalised, as saved settings do', () => {
    const out = sanitizePreset({
      ...base,
      pageSetup: { ...pageSetup, customSize: { w: 400, h: 100 } },
    })
    expect(out?.pageSetup.customSize).toEqual({ w: 100, h: 400 })
  })

  it('gives study fields of the wrong type their defaults', () => {
    const out = sanitizePreset({ ...base, study: { versions: 'x', blurPct: 'y', values: 3 } })
    expect(out?.study).toEqual(DEFAULT_STUDY)
  })

  it.each([
    ['not an object', 'preset'],
    ['null', null],
    ['an array', [base]],
    ['a missing name', { ...base, name: undefined }],
    ['a name that is not a string', { ...base, name: 4 }],
    ['an empty name', { ...base, name: '   ' }],
    ['a name too long', { ...base, name: 'x'.repeat(MAX_PRESET_NAME + 1) }],
    ['a non-object pageSetup', { ...base, pageSetup: 'A4' }],
    ['an array pageSetup', { ...base, pageSetup: [] }],
    ['a missing study', { ...base, study: undefined }],
    ['a null lines', { ...base, lines: null }],
  ])('returns null for %s', (_, raw) => {
    expect(sanitizePreset(raw)).toBeNull()
  })
})

describe('presetName', () => {
  it('trims, collapses inner whitespace, and refuses empty or longer than MAX_PRESET_NAME (40) characters', () => {
    expect(MAX_PRESET_NAME).toBe(40)
    expect(presetName('  A4 \t value\n studies  ')).toBe('A4 value studies')
    expect(presetName('')).toBeNull()
    expect(presetName(' \n\t ')).toBeNull()
    expect(presetName('x'.repeat(40))).toBe('x'.repeat(40))
    expect(presetName('x'.repeat(41))).toBeNull()
    expect(presetName(`  ${'x'.repeat(40)}  `)).toBe('x'.repeat(40))
  })

  it('counts Unicode code points, so 40 emoji fit', () => {
    const emoji = '🎨'.repeat(40)
    expect(emoji.length).toBe(80)
    expect(presetName(emoji)).toBe(emoji)
    expect(presetName(`${emoji}🎨`)).toBeNull()
  })
})

describe('sameName', () => {
  it('compares case-insensitively after trimming', () => {
    expect(sameName('A4 values', ' a4 VALUES ')).toBe(true)
    expect(sameName('A4 values', 'A4  values')).toBe(true)
    expect(sameName('A4 values', 'A4 value')).toBe(false)
  })
})

describe('uniqueName', () => {
  it('appends " (2)", " (3)" … against existing names', () => {
    expect(uniqueName('A4', [])).toBe('A4')
    expect(uniqueName('A4', ['A3'])).toBe('A4')
    expect(uniqueName('A4', ['A4'])).toBe('A4 (2)')
    expect(uniqueName('A4', ['A4', 'A4 (2)'])).toBe('A4 (3)')
    expect(uniqueName('A4', ['a4', ' a4 (2) '])).toBe('A4 (3)')
  })

  it('shortens the base so the result stays within MAX_PRESET_NAME', () => {
    const long = 'y'.repeat(MAX_PRESET_NAME)
    const out = uniqueName(long, [long])
    expect(out).toBe(`${'y'.repeat(MAX_PRESET_NAME - 4)} (2)`)
    expect(presetName(out)).toBe(out)
    const emoji = '🎨'.repeat(MAX_PRESET_NAME)
    expect(Array.from(uniqueName(emoji, [emoji])).length).toBe(MAX_PRESET_NAME)
  })

  it('never ends the base with a space before the suffix', () => {
    const name = `${'z'.repeat(35)} abcd`
    expect(uniqueName(name, [name])).toBe(`${'z'.repeat(35)} (2)`)
  })
})

describe('buildPresetFile', () => {
  it('gives { format: "artistica-presets", version: 1, presets }, pretty-printed with 2 spaces and a final newline', () => {
    const p = preset()
    const text = buildPresetFile([p])
    expect(PRESET_FILE_FORMAT).toBe('artistica-presets')
    expect(PRESET_FILE_VERSION).toBe(1)
    expect(JSON.parse(text)).toEqual({ format: 'artistica-presets', version: 1, presets: [p] })
    expect(text).toBe(
      `${JSON.stringify({ format: 'artistica-presets', version: 1, presets: [p] }, null, 2)}\n`,
    )
    expect(Object.keys(JSON.parse(text) as object)).toEqual(['format', 'version', 'presets'])
  })

  it('writes only the whitelisted keys, whatever the objects carry', () => {
    const sneaky = {
      ...preset(),
      imageId: 'img-1',
      pageSetup: { ...pageSetup, contentHash: 'abc' },
    }
    const text = buildPresetFile([sneaky])
    expect(text).not.toContain('imageId')
    expect(text).not.toContain('contentHash')
  })

  it('is deterministic whatever the key order of the input', () => {
    const p = preset()
    const reordered = {
      lines: p.lines,
      study: { values: p.study.values, blurPct: p.study.blurPct, versions: p.study.versions },
      pageSetup: Object.fromEntries(Object.entries(p.pageSetup).reverse()) as unknown as PageSetup,
      name: p.name,
    }
    expect(buildPresetFile([reordered])).toBe(buildPresetFile([p]))
  })
})

describe('parsePresetFile', () => {
  it('reports too-large for text longer than MAX_PRESET_FILE_BYTES (64 KiB) in UTF-8 bytes', () => {
    expect(MAX_PRESET_FILE_BYTES).toBe(64 * 1024)
    const valid = buildPresetFile([preset()])
    const padTo = (bytes: number, ch: string, chBytes: number): string => {
      const free = bytes - new TextEncoder().encode(valid).length
      return `${valid}${' '.repeat(free % chBytes)}${ch.repeat(Math.floor(free / chBytes))}`
    }
    expect(parsePresetFile(padTo(MAX_PRESET_FILE_BYTES, ' ', 1)).ok).toBe(true)
    expect(parsePresetFile(padTo(MAX_PRESET_FILE_BYTES + 1, ' ', 1))).toEqual({
      ok: false,
      error: 'too-large',
    })
    const name = 'é'.repeat(20)
    const multiByte = buildPresetFile([preset(name)])
    const text = `${multiByte}${' '.repeat(MAX_PRESET_FILE_BYTES - multiByte.length - 19)}`
    expect(text.length).toBeLessThanOrEqual(MAX_PRESET_FILE_BYTES)
    expect(new TextEncoder().encode(text).length).toBe(MAX_PRESET_FILE_BYTES + 1)
    expect(parsePresetFile(text)).toEqual({ ok: false, error: 'too-large' })
  })

  it('checks the size before parsing', () => {
    expect(parsePresetFile('{'.repeat(MAX_PRESET_FILE_BYTES + 1))).toEqual({
      ok: false,
      error: 'too-large',
    })
  })

  it.each([[''], ['{'], ['not json'], ['{"format": "artistica-presets",}'], ['\u0000']])(
    'reports not-json for invalid JSON %j',
    (text) => {
      expect(parsePresetFile(text)).toEqual({ ok: false, error: 'not-json' })
    },
  )

  it.each([
    ['an Artistica settings envelope', JSON.stringify({ state: { pageSetup }, version: 4 })],
    ['an array', JSON.stringify([preset()])],
    ['null', 'null'],
    ['a number', '3'],
    ['a string', '"artistica-presets"'],
    ['another format', fileText([preset()], { format: 'something-else' })],
    ['no version', JSON.stringify({ format: PRESET_FILE_FORMAT, presets: [preset()] })],
    ['a version of 0', fileText([preset()], { version: 0 })],
    ['a version that is not an integer', fileText([preset()], { version: 1.5 })],
    ['a version that is a string', fileText([preset()], { version: '1' })],
    ['presets that are not an array', fileText({ a: preset() })],
  ])('reports not-presets for %s', (_, text) => {
    expect(parsePresetFile(text)).toEqual({ ok: false, error: 'not-presets' })
  })

  it('reports newer-version with the version', () => {
    expect(parsePresetFile(fileText([preset()], { version: PRESET_FILE_VERSION + 1 }))).toEqual({
      ok: false,
      error: 'newer-version',
      version: PRESET_FILE_VERSION + 1,
    })
  })

  it('reports empty when no preset survives', () => {
    expect(parsePresetFile(fileText([]))).toEqual({ ok: false, error: 'empty' })
    expect(parsePresetFile(fileText([{ name: '' }, 3, null]))).toEqual({
      ok: false,
      error: 'empty',
    })
  })

  it('keeps the valid presets and counts the skipped ones', () => {
    const good = preset('Good')
    const noName: Record<string, unknown> = { ...preset('No name') }
    delete noName.name
    const adjustedRaw = { ...preset('Adjusted'), study: { ...study, blurPct: 900 } }
    const result = parsePresetFile(
      fileText([good, noName, { ...preset('Bad shape'), pageSetup: 5 }, adjustedRaw]),
    )
    expect(result).toEqual({
      ok: true,
      presets: [good, { ...preset('Adjusted'), study: { ...study, blurPct: 100 } }],
      skipped: 2,
      adjusted: 1,
    })
  })

  it('counts a preset whose guide switch was on, or whose name was not normalised, as adjusted', () => {
    const raw = {
      ...preset('Edges'),
      lines: { ...preset().lines, edges: { on: true, detailPct: 70 } },
    }
    const result = parsePresetFile(fileText([raw, { ...preset(), name: ' Spaced  name ' }]))
    expect(result).toMatchObject({ ok: true, skipped: 0, adjusted: 2 })
  })

  it('does not count dropped unknown keys as adjusted', () => {
    const result = parsePresetFile(fileText([{ ...preset(), extra: 1 }]))
    expect(result).toEqual({ ok: true, presets: [preset()], skipped: 0, adjusted: 0 })
  })

  it('drops unknown keys and ignores __proto__ and constructor keys', () => {
    const p = preset()
    const text = `{"format":"artistica-presets","version":1,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"presets":[{"__proto__":{"polluted":3},"constructor":{"x":1},"prototype":{"y":1},"name":"A4 values","pageSetup":${JSON.stringify({ ...p.pageSetup, __proto__: null })},"study":${JSON.stringify(p.study)},"lines":${JSON.stringify(p.lines)},"photo":"img-1"}]}`
    const result = parsePresetFile(text)
    expect(result).toEqual({ ok: true, presets: [p], skipped: 0, adjusted: 0 })
    if (!result.ok) throw new Error('expected ok')
    const [only] = result.presets
    expect(Object.hasOwn(only ?? {}, '__proto__')).toBe(false)
    expect(Object.getPrototypeOf(only)).toBe(Object.prototype)
    expect(Object.keys(only ?? {})).toEqual(['name', 'pageSetup', 'study', 'lines'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('reads at most MAX_PRESETS_PER_FILE (50) presets', () => {
    expect(MAX_PRESETS_PER_FILE).toBe(50)
    const list = Array.from({ length: 53 }, (_, i) => preset(`P${String(i)}`))
    const result = parsePresetFile(fileText(list))
    expect(result).toMatchObject({ ok: true, skipped: 3, adjusted: 0 })
    if (!result.ok) throw new Error('expected ok')
    expect(result.presets.map((p) => p.name)).toEqual(list.slice(0, 50).map((p) => p.name))
  })

  it('a file from buildPresetFile parses back to equal presets', () => {
    const list = [
      preset('One'),
      presetFromSettings('Two', {
        pageSetup: DEFAULT_PAGE_SETUP,
        study: DEFAULT_STUDY,
        lines: DEFAULT_LINES,
      }),
    ]
    expect(parsePresetFile(buildPresetFile(list))).toEqual({
      ok: true,
      presets: list,
      skipped: 0,
      adjusted: 0,
    })
  })

  it('has no migrations in version 1', () => {
    expect(Object.keys(PRESET_FILE_MIGRATIONS)).toEqual([])
  })
})
