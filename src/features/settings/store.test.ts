import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { DEFAULT_LINES, SPIRAL_CORNERS, type LineSettings } from '../../shared/model/lines'
import {
  MAX_PRESETS,
  presetFromSettings,
  sanitizePreset,
  type Preset,
} from '../../shared/model/preset'
import { DEFAULT_STUDY, type StudySettings } from '../../shared/model/study'
import { DEFAULT_SETTINGS, parseSettings } from './schema'
import {
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  createSettingsStore,
  initialUnitFromNavigator,
  safeStorage,
} from './store'

function memoryStorage(initial?: string): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(SETTINGS_STORAGE_KEY, initial)
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}

function countingStorage(): StateStorage & { data: Map<string, string>; writes: () => number } {
  const inner = memoryStorage()
  let writes = 0
  return {
    ...inner,
    setItem: (k, v) => {
      writes++
      inner.setItem(k, v)
    },
    writes: () => writes,
  }
}

const saved = (storage: { data: Map<string, string> }) =>
  JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY) ?? 'null') as {
    version: number
    state: Record<string, unknown>
  }

describe('defaults', () => {
  it('starts from the defaults', () => {
    const s = createSettingsStore(memoryStorage()).getState()
    expect(s.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
    expect(s.unit).toBe('mm')
    expect(s.language).toBeNull()
    expect(s.theme).toBe('auto')
    expect(s.pageSetupNotes).toEqual([])
  })
})

describe('initial unit (owner Q8, default)', () => {
  it('uses the given initial unit when nothing is saved', () => {
    expect(createSettingsStore(memoryStorage(), 'in').getState().unit).toBe('in')
  })

  it('lets a saved unit win over the initial unit', () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 1, state: { ...DEFAULT_SETTINGS, unit: 'mm' } }),
    )
    expect(createSettingsStore(storage, 'in').getState().unit).toBe('mm')
  })

  it('keeps the initial unit when the saved value is unreadable', () => {
    expect(createSettingsStore(memoryStorage('{oops'), 'in').getState().unit).toBe('in')
  })

  it('reset restores the initial unit', () => {
    const store = createSettingsStore(memoryStorage(), 'in')
    store.getState().setUnit('mm')
    store.getState().reset()
    expect(store.getState().unit).toBe('in')
  })

  it('reads the browser locale in a guarded way', () => {
    expect(initialUnitFromNavigator({ language: 'en-US' })).toBe('in')
    expect(initialUnitFromNavigator({ language: 'en-CA' })).toBe('in')
    expect(initialUnitFromNavigator({ language: 'fr' })).toBe('mm')
    expect(initialUnitFromNavigator({})).toBe('mm')
    expect(initialUnitFromNavigator(undefined)).toBe('mm')
    const hostile = {
      get language(): string {
        throw new Error('blocked')
      },
    }
    expect(initialUnitFromNavigator(hostile)).toBe('mm')
  })
})

describe('actions', () => {
  it('setPageSetup merges nested fields and normalises', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setPageSetup({ bleed: { enabled: true } })
    const s = store.getState()
    expect(s.pageSetup.bleed).toEqual({ enabled: true, mm: 3 })
    expect(s.pageSetup.gutter).toEqual({ enabled: true, mm: 6 })
    expect(s.pageSetupNotes).toEqual([])
    store.getState().setPageSetup({ bleed: { mm: 5 } })
    expect(store.getState().pageSetup.gutter.mm).toBe(10)
    expect(store.getState().pageSetupNotes).toEqual(['gutter-raised-for-bleed'])
    store.getState().setPageSetup({ cropMarks: false })
    expect(store.getState().pageSetupNotes).toEqual([])
  })

  it('setPageSetup merges gutter and customSize one level deep', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setPageSetup({ gutter: { mm: 9 } })
    store.getState().setPageSetup({ gutter: { enabled: false } })
    expect(store.getState().pageSetup.gutter).toEqual({ enabled: false, mm: 9 })
    store.getState().setPageSetup({ customSize: { h: 250 } })
    store.getState().setPageSetup({ customSize: { w: 100 } })
    expect(store.getState().pageSetup.customSize).toEqual({ w: 100, h: 250 })
  })

  describe('setPageSetup treats keys set to undefined as not patched', () => {
    function customised() {
      const storage = memoryStorage()
      const store = createSettingsStore(storage)
      store.getState().setPageSetup({
        paper: 'Letter',
        safeAreaMm: 8,
        gutter: { mm: 9 },
        bleed: { enabled: true, mm: 4 },
        customSize: { w: 100, h: 250 },
      })
      return { storage, store, before: store.getState().pageSetup }
    }

    it('gutter.mm', () => {
      const { store } = customised()
      store.getState().setPageSetup({ gutter: { mm: undefined } })
      expect(store.getState().pageSetup.gutter).toEqual({ enabled: true, mm: 9 })
      expect(store.getState().pageSetupNotes).toEqual([])
    })

    it('safeAreaMm', () => {
      const { store } = customised()
      store.getState().setPageSetup({ safeAreaMm: undefined })
      expect(store.getState().pageSetup.safeAreaMm).toBe(8)
      expect(store.getState().pageSetupNotes).toEqual([])
    })

    it('paper', () => {
      const { store } = customised()
      store.getState().setPageSetup({ paper: undefined })
      expect(store.getState().pageSetup.paper).toBe('Letter')
    })

    it('every other key, and what is persisted', () => {
      const { storage, store, before } = customised()
      store.getState().setPageSetup({
        orientation: undefined,
        cropMarks: undefined,
        bleed: { enabled: undefined, mm: undefined },
        customSize: { w: undefined, h: undefined },
      })
      expect(store.getState().pageSetup).toEqual(before)
      expect(saved(storage).state.pageSetup).toEqual(before)
    })
  })

  it('setPageSetup enforces the minimum safe area', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setPageSetup({ safeAreaMm: 0 })
    expect(store.getState().pageSetup.safeAreaMm).toBe(3)
    expect(store.getState().pageSetupNotes).toEqual(['safe-area-raised-to-minimum'])
  })

  it('sets unit, language and theme, and reset restores the defaults', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setUnit('in')
    store.getState().setLanguage('pt-BR')
    store.getState().setTheme('dark')
    store.getState().setPageSetup({ paper: 'Letter' })
    expect(store.getState()).toMatchObject({ unit: 'in', language: 'pt-BR', theme: 'dark' })
    store.getState().reset()
    expect(store.getState()).toMatchObject({ ...DEFAULT_SETTINGS, pageSetupNotes: [] })
  })

  it('toggling the unit never changes stored millimetres', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setPageSetup({ safeAreaMm: 7.3 })
    store.getState().setUnit('in')
    store.getState().setUnit('mm')
    expect(store.getState().pageSetup.safeAreaMm).toBe(7.3)
  })
})

describe('persistence', () => {
  it('writes the current version under artistica:settings, without notes or actions', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setTheme('light')
    store.getState().setPageSetup({ safeAreaMm: 1 })
    const { version, state } = saved(storage)
    expect(SETTINGS_STORAGE_KEY).toBe('artistica:settings')
    expect(version).toBe(SETTINGS_VERSION)
    expect(Object.keys(state).sort()).toEqual([
      'language',
      'lineDefaults',
      'pageSetup',
      'presets',
      'studyDefaults',
      'theme',
      'unit',
    ])
  })

  it('restores saved settings', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        state: { ...DEFAULT_SETTINGS, unit: 'in', theme: 'dark', language: 'ja' },
      }),
    )
    expect(createSettingsStore(storage).getState()).toMatchObject({
      unit: 'in',
      theme: 'dark',
      language: 'ja',
    })
  })

  it.each([
    ['not JSON', '{oops'],
    ['an empty string', ''],
    ['JSON null', 'null'],
    ['a bare number', '42'],
    ['no state', JSON.stringify({ version: 1 })],
    ['state is a string', JSON.stringify({ version: 1, state: 'x' })],
    ['an array', '[1,2,3]'],
  ])('falls back to defaults when the saved value is %s', (_name, raw) => {
    const s = createSettingsStore(memoryStorage(raw)).getState()
    expect(s).toMatchObject(DEFAULT_SETTINGS)
  })

  it('sanitises current-version data that was edited by hand', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        state: { unit: 'furlongs', theme: 'dark', pageSetup: { paper: 'A3', safeAreaMm: 0.5 } },
      }),
    )
    const s = createSettingsStore(storage).getState()
    expect(s.unit).toBe('mm')
    expect(s.theme).toBe('dark')
    expect(s.pageSetup.paper).toBe('A3')
    expect(s.pageSetup.safeAreaMm).toBe(3)
  })

  it('migrates old versions by sanitising them', () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 0, state: { unit: 'in', page: { paper: 'A5' } } }),
    )
    const s = createSettingsStore(storage).getState()
    expect(s.unit).toBe('in')
    expect(s.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
  })

  it('reads settings written by a newer version as well as it can', () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 99, state: { theme: 'light', extra: { a: 1 } } }),
    )
    const s = createSettingsStore(storage).getState()
    expect(s.theme).toBe('light')
    expect(s).not.toHaveProperty('extra')
  })

  it('does not store anything but the settings (privacy)', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setUnit('in')
    expect(JSON.stringify(saved(storage))).not.toMatch(/image|bitmap|blob|url/i)
  })
})

describe('storage that fails', () => {
  const throwing: StateStorage = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
  }

  it('safeStorage swallows read and write errors', () => {
    const s = safeStorage(() => throwing)
    expect(s.getItem('k')).toBeNull()
    expect(() => {
      s.setItem('k', 'v')
      void s.removeItem('k')
    }).not.toThrow()
  })

  it('safeStorage survives the storage accessor itself throwing', () => {
    const s = safeStorage(() => {
      throw new Error('blocked')
    })
    expect(s.getItem('k')).toBeNull()
  })

  it('the store keeps working in memory when storage is unavailable', () => {
    const store = createSettingsStore(safeStorage(() => throwing))
    expect(() => {
      store.getState().setTheme('dark')
    }).not.toThrow()
    expect(store.getState().theme).toBe('dark')
  })
})

describe('study defaults (schema v2)', () => {
  const D = { blurPct: DEFAULT_STUDY.blurPct, values: DEFAULT_STUDY.values }

  it('migrates a v1 envelope keeping every field', () => {
    const v1 = {
      pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'Letter', safeAreaMm: 7 },
      unit: 'in',
      language: 'en',
      theme: 'dark',
    }
    const storage = memoryStorage(JSON.stringify({ version: 1, state: v1 }))
    const s = createSettingsStore(storage).getState()
    expect(s.pageSetup).toEqual(v1.pageSetup)
    expect(s.unit).toBe('in')
    expect(s.language).toBe('en')
    expect(s.theme).toBe('dark')
    expect(s.studyDefaults).toEqual(D)
  })

  it.each([
    ['values: null', { blurPct: 22, values: null }],
    ['values: "x"', { blurPct: 22, values: 'x' }],
    ['no values', { blurPct: 22 }],
  ])('loads a v2 envelope with %s, keeping every other field', (_name, studyDefaults) => {
    const state = {
      pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'A3' },
      unit: 'in',
      language: 'ja',
      theme: 'light',
      studyDefaults,
    }
    const s = createSettingsStore(memoryStorage(JSON.stringify({ version: 2, state }))).getState()
    expect(s.pageSetup).toEqual(state.pageSetup)
    expect(s).toMatchObject({ unit: 'in', language: 'ja', theme: 'light' })
    expect(s.studyDefaults).toEqual({ blurPct: 22, values: DEFAULT_STUDY.values })
  })

  it('loads a v2 envelope without studyDefaults with the defaults', () => {
    const state = { ...DEFAULT_SETTINGS, unit: 'in' } as Record<string, unknown>
    delete state.studyDefaults
    const s = createSettingsStore(memoryStorage(JSON.stringify({ version: 2, state }))).getState()
    expect(s.unit).toBe('in')
    expect(s.studyDefaults).toEqual(D)
  })

  it.each([
    [{ blurPct: 250, values: { count: 7, hue: 420, neutral: false } }],
    [{ blurPct: -5, values: { count: 99, hue: -30, neutral: true } }],
    [{ blurPct: 33.6, values: { count: 1, hue: 360, neutral: false } }],
  ])('loads stored study defaults %j the same as setStudyDefaults sets them', (input) => {
    const set = createSettingsStore(memoryStorage())
    set.getState().setStudyDefaults(input)
    const state = { ...DEFAULT_SETTINGS, unit: 'in', studyDefaults: input }
    const loaded = createSettingsStore(memoryStorage(JSON.stringify({ version: 2, state })))
    expect(loaded.getState().unit).toBe('in')
    expect(loaded.getState().studyDefaults).toEqual(set.getState().studyDefaults)
    expect(loaded.getState().studyDefaults).not.toEqual(DEFAULT_SETTINGS.studyDefaults)
  })

  it('setStudyDefaults persists blur and values, sanitized, under the current version', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store
      .getState()
      .setStudyDefaults({ blurPct: 250, values: { count: 7, hue: 420, neutral: false } })
    expect(store.getState().studyDefaults).toEqual({
      blurPct: 100,
      values: { count: 7, hue: 60, neutral: false },
    })
    const env = saved(storage)
    expect(env.version).toBe(SETTINGS_VERSION)
    expect(env.state.studyDefaults).toEqual(store.getState().studyDefaults)
  })

  it('persists nothing but the four M1 fields, studyDefaults, lineDefaults and presets', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setStudyDefaults({ blurPct: 10, values: DEFAULT_STUDY.values })
    expect(Object.keys(saved(storage).state).sort()).toEqual([
      'language',
      'lineDefaults',
      'pageSetup',
      'presets',
      'studyDefaults',
      'theme',
      'unit',
    ])
  })

  it('never persists versions, even when the caller passes them', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    const withVersions = { blurPct: 10, values: DEFAULT_STUDY.values, versions: ['values'] }
    store.getState().setStudyDefaults(withVersions)
    expect(store.getState().studyDefaults).toEqual({ blurPct: 10, values: DEFAULT_STUDY.values })
    expect(saved(storage).state.studyDefaults).toEqual({
      blurPct: 10,
      values: DEFAULT_STUDY.values,
    })
  })

  it('reloads the saved study defaults', () => {
    const storage = memoryStorage()
    createSettingsStore(storage)
      .getState()
      .setStudyDefaults({ blurPct: 15, values: { count: 3, hue: 195, neutral: true } })
    expect(createSettingsStore(storage).getState().studyDefaults).toEqual({
      blurPct: 15,
      values: { count: 3, hue: 195, neutral: true },
    })
  })

  it('reset restores the default study defaults', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setStudyDefaults({ blurPct: 15, values: DEFAULT_STUDY.values })
    store.getState().reset()
    expect(store.getState().studyDefaults).toEqual(DEFAULT_SETTINGS.studyDefaults)
  })

  it.each([
    ['blurPct', { blurPct: 41, values: DEFAULT_STUDY.values }],
    ['count', { blurPct: 40, values: { ...DEFAULT_STUDY.values, count: 6 } }],
    ['hue', { blurPct: 40, values: { ...DEFAULT_STUDY.values, hue: 56 } }],
    ['neutral', { blurPct: 40, values: { ...DEFAULT_STUDY.values, neutral: true } }],
  ])('setStudyDefaults stores a change to %s alone', (_name, next) => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setStudyDefaults(next)
    expect(store.getState().studyDefaults).toEqual(next)
    expect(saved(storage).state.studyDefaults).toEqual(next)
  })

  it('keeps the same state when setStudyDefaults gets equal values', () => {
    const store = createSettingsStore(memoryStorage())
    const before = store.getState().studyDefaults
    store.getState().setStudyDefaults({ ...before, values: { ...before.values } })
    expect(store.getState().studyDefaults).toBe(before)
  })

  it('writes nothing to storage when setStudyDefaults gets equal values', () => {
    const storage = countingStorage()
    const store = createSettingsStore(storage)
    store.getState().setStudyDefaults({ blurPct: 10, values: DEFAULT_STUDY.values })
    const writes = storage.writes()
    const listened: unknown[] = []
    store.subscribe((s) => listened.push(s))
    store.getState().setStudyDefaults({ blurPct: 10.2, values: { ...DEFAULT_STUDY.values } })
    expect(storage.writes()).toBe(writes)
    expect(listened).toEqual([])
  })
})

describe('line defaults (schema v3)', () => {
  const allOn: LineSettings = {
    ...DEFAULT_LINES,
    grid: { on: true, cols: 3, rows: 2 },
    thirds: true,
    armature: true,
    golden: true,
    spiral: { on: true, corner: 'bottomRight' },
    centre: true,
    style: { colour: '#1F3FBF', widthMm: 1.37, opacityPct: 55.6 },
  }
  const remembered: LineSettings = {
    ...DEFAULT_LINES,
    grid: { on: false, cols: 3, rows: 2 },
    spiral: { on: false, corner: 'bottomRight' },
    style: { colour: '#1f3fbf', widthMm: 1.35, opacityPct: 56 },
  }
  const v2 = {
    pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'Letter', safeAreaMm: 7 },
    unit: 'in',
    language: 'ja',
    theme: 'dark',
    studyDefaults: { blurPct: 70, values: { count: 7, hue: 200, neutral: true } },
  }

  it('starts from DEFAULT_LINES', () => {
    expect(createSettingsStore(memoryStorage()).getState().lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('migrates a stored v2 envelope keeping every v2 field and adding the default lines', () => {
    const storage = memoryStorage(JSON.stringify({ version: 2, state: v2 }))
    const s = createSettingsStore(storage, 'mm').getState()
    expect({
      pageSetup: s.pageSetup,
      unit: s.unit,
      language: s.language,
      theme: s.theme,
      studyDefaults: s.studyDefaults,
    }).toEqual(v2)
    expect(s.lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('migrates a stored v1 envelope with default studies and lines', () => {
    const v1 = { pageSetup: v2.pageSetup, unit: v2.unit, language: v2.language, theme: v2.theme }
    const s = createSettingsStore(
      memoryStorage(JSON.stringify({ version: 1, state: v1 })),
    ).getState()
    expect(s.pageSetup).toEqual(v1.pageSetup)
    expect(s).toMatchObject({ unit: 'in', language: 'ja', theme: 'dark' })
    expect(s.studyDefaults).toEqual(DEFAULT_SETTINGS.studyDefaults)
    expect(s.lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('setLineDefaults normalises and drops the line types (owner Q7, default)', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setLineDefaults(allOn)
    expect(store.getState().lineDefaults).toEqual(remembered)
  })

  it('persists lineDefaults under the current version, with every on flag false', () => {
    const storage = memoryStorage()
    createSettingsStore(storage).getState().setLineDefaults(allOn)
    const env = saved(storage)
    expect(env.version).toBe(SETTINGS_VERSION)
    expect(env.state.lineDefaults).toEqual(remembered)
    expect(JSON.stringify(env.state.lineDefaults)).not.toMatch(/true/)
  })

  it('reloads the saved line defaults', () => {
    const storage = memoryStorage()
    createSettingsStore(storage).getState().setLineDefaults(allOn)
    expect(createSettingsStore(storage).getState().lineDefaults).toEqual(remembered)
  })

  it('a stored v3 envelope with the types on loads with them off and keeps the rest', () => {
    const state = { ...v2, lineDefaults: allOn }
    const s = createSettingsStore(memoryStorage(JSON.stringify({ version: 3, state }))).getState()
    expect(s.lineDefaults).toEqual(remembered)
    expect(s.studyDefaults).toEqual(v2.studyDefaults)
    expect(s.unit).toBe('in')
  })

  it('a corrupted lineDefaults never throws and never wipes the other settings', () => {
    for (const lineDefaults of [null, 'x', 7, [1], { grid: 'x', style: { widthMm: '1' } }]) {
      const raw = JSON.stringify({ version: 3, state: { ...v2, lineDefaults } })
      const s = createSettingsStore(memoryStorage(raw)).getState()
      expect(s.studyDefaults).toEqual(v2.studyDefaults)
      expect(s).toMatchObject({ unit: 'in', language: 'ja', theme: 'dark' })
      expect(s.lineDefaults).toEqual(DEFAULT_LINES)
    }
  })

  it('reset restores the default line defaults', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setLineDefaults(allOn)
    store.getState().reset()
    expect(store.getState().lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('keeps the same state when setLineDefaults gets equal values', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setLineDefaults(allOn)
    const before = store.getState().lineDefaults
    store.getState().setLineDefaults({ ...allOn, thirds: false })
    expect(store.getState().lineDefaults).toBe(before)
  })

  it('writes nothing to storage when setLineDefaults gets values equal after normalising', () => {
    const storage = countingStorage()
    const store = createSettingsStore(storage)
    store.getState().setLineDefaults(allOn)
    const writes = storage.writes()
    expect(writes).toBeGreaterThan(0)
    const listened: unknown[] = []
    store.subscribe((s) => listened.push(s))
    store
      .getState()
      .setLineDefaults({ ...allOn, golden: false, style: { ...allOn.style, widthMm: 1.36 } })
    expect(storage.writes()).toBe(writes)
    expect(listened).toEqual([])
  })

  const anyValue = fc.oneof(
    fc.double(),
    fc.integer({ min: -100, max: 100 }),
    fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '2', true, [3], null),
    fc.string(),
  )
  const arbitraryLines = fc.record({
    grid: fc.record({ on: anyValue, cols: anyValue, rows: anyValue }),
    thirds: anyValue,
    armature: anyValue,
    golden: anyValue,
    spiral: fc.record({
      on: anyValue,
      corner: fc.oneof(fc.constantFrom(...SPIRAL_CORNERS), anyValue),
    }),
    centre: anyValue,
    style: fc.record({
      colour: fc.oneof(fc.constantFrom('#A1B2C3', '#a1b2c3', 'red'), anyValue),
      widthMm: anyValue,
      opacityPct: anyValue,
    }),
    edges: fc.oneof(fc.record({ on: anyValue, detailPct: anyValue }), anyValue),
    face: anyValue,
    pose: anyValue,
  }) as fc.Arbitrary<unknown> as fc.Arbitrary<LineSettings>

  it('ranges are owned by sanitizeLines: load and setLineDefaults give identical values (property)', () => {
    fc.assert(
      fc.property(arbitraryLines, (raw) => {
        const loaded = parseSettings({ lineDefaults: raw }).lineDefaults
        const viaStore = createSettingsStore(
          memoryStorage(JSON.stringify({ version: 3, state: { lineDefaults: raw } })),
        ).getState().lineDefaults
        const store = createSettingsStore(memoryStorage())
        store.getState().setLineDefaults(raw)
        expect(store.getState().lineDefaults).toEqual(loaded)
        expect(viaStore).toEqual(loaded)
        store.getState().setLineDefaults(store.getState().lineDefaults)
        expect(store.getState().lineDefaults).toEqual(loaded)
      }),
    )
  })
})

describe('guide defaults (schema v4)', () => {
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
  }
  const guidesOn: LineSettings = {
    ...DEFAULT_LINES,
    style: { colour: '#1f3fbf', widthMm: 1.35, opacityPct: 56 },
    edges: { on: true, detailPct: 72.6 },
    face: true,
    pose: true,
  }
  const rememberedGuides: LineSettings = {
    ...guidesOn,
    edges: { on: false, detailPct: 73 },
    face: false,
    pose: false,
  }

  it('a v3 envelope loads with every field and the default edge detail 50', () => {
    const s = createSettingsStore(
      memoryStorage(JSON.stringify({ version: 3, state: v3 })),
      'mm',
    ).getState()
    expect({
      pageSetup: s.pageSetup,
      unit: s.unit,
      language: s.language,
      theme: s.theme,
      studyDefaults: s.studyDefaults,
      lineDefaults: s.lineDefaults,
    }).toEqual({
      ...v3,
      lineDefaults: {
        ...v3.lineDefaults,
        edges: { on: false, detailPct: 50 },
        face: false,
        pose: false,
      },
    })
  })

  it('v2 and v1 envelopes still load', () => {
    const { pageSetup, unit, language, theme, studyDefaults } = v3
    const v2 = { pageSetup, unit, language, theme, studyDefaults }
    const fromV2 = createSettingsStore(
      memoryStorage(JSON.stringify({ version: 2, state: v2 })),
    ).getState()
    expect(fromV2).toMatchObject({ ...v2, lineDefaults: DEFAULT_LINES })
    const v1 = { pageSetup, unit, language, theme }
    const fromV1 = createSettingsStore(
      memoryStorage(JSON.stringify({ version: 1, state: v1 })),
    ).getState()
    expect(fromV1).toMatchObject({
      ...v1,
      studyDefaults: DEFAULT_SETTINGS.studyDefaults,
      lineDefaults: DEFAULT_LINES,
    })
  })

  it('setLineDefaults keeps the detail and turns guides off', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setLineDefaults(guidesOn)
    expect(store.getState().lineDefaults).toEqual(rememberedGuides)
  })

  it('partialize persists lineDefaults with the detail', () => {
    const storage = memoryStorage()
    createSettingsStore(storage).getState().setLineDefaults(guidesOn)
    const env = saved(storage)
    expect(env.version).toBe(SETTINGS_VERSION)
    expect(env.state.lineDefaults).toEqual(rememberedGuides)
  })

  it('the detail is remembered across a reload', () => {
    const storage = memoryStorage()
    createSettingsStore(storage).getState().setLineDefaults(guidesOn)
    expect(createSettingsStore(storage).getState().lineDefaults).toEqual(rememberedGuides)
  })

  it('stored guide switches are turned off on load', () => {
    const state = { ...v3, lineDefaults: guidesOn }
    const s = createSettingsStore(memoryStorage(JSON.stringify({ version: 4, state }))).getState()
    expect(s.lineDefaults).toEqual(rememberedGuides)
    expect(s.studyDefaults).toEqual(v3.studyDefaults)
  })

  it.each([
    ['above the range', 400, 100],
    ['below the range', -3, 1],
    ['fractional', 9.5, 10],
  ])('a stored detail %s is clamped and rounded on load', (_name, stored, want) => {
    const state = {
      ...v3,
      lineDefaults: { ...v3.lineDefaults, edges: { on: false, detailPct: stored } },
    }
    const s = createSettingsStore(memoryStorage(JSON.stringify({ version: 4, state }))).getState()
    expect(s.lineDefaults.edges).toEqual({ on: false, detailPct: want })
  })

  it('a bad detail alone falls back to 50', () => {
    const state = {
      ...v3,
      lineDefaults: { ...v3.lineDefaults, edges: { on: false, detailPct: 'x' } },
    }
    const s = createSettingsStore(memoryStorage(JSON.stringify({ version: 4, state }))).getState()
    expect(s.lineDefaults).toEqual({ ...DEFAULT_LINES, ...v3.lineDefaults })
  })

  it('a new detail writes storage once; an equal value does not write it', () => {
    const storage = countingStorage()
    const store = createSettingsStore(storage)
    store.getState().setLineDefaults(guidesOn)
    const writes = storage.writes()
    expect(writes).toBeGreaterThan(0)
    const listened: unknown[] = []
    store.subscribe((s) => listened.push(s))
    store.getState().setLineDefaults({
      ...guidesOn,
      edges: { on: false, detailPct: 73.2 },
      face: false,
      pose: true,
    })
    expect(storage.writes()).toBe(writes)
    expect(listened).toEqual([])
    store.getState().setLineDefaults({ ...guidesOn, edges: { on: true, detailPct: 20 } })
    expect(storage.writes()).toBe(writes + 1)
    expect(saved(storage).state.lineDefaults).toEqual({
      ...rememberedGuides,
      edges: { on: false, detailPct: 20 },
    })
  })
})

describe('presets (schema v5)', () => {
  const study: StudySettings = {
    versions: ['original', 'values'],
    blurPct: 25,
    values: { count: 7, hue: 200, neutral: true },
  }
  const make = (name: string, over: Partial<StudySettings> = {}): Preset =>
    presetFromSettings(name, {
      pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'A3' },
      study: { ...study, ...over },
      lines: { ...DEFAULT_LINES, thirds: true },
    })
  const names = (store: ReturnType<typeof createSettingsStore>) =>
    store.getState().presets.map((p) => p.name)
  const v4 = {
    pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'Letter', safeAreaMm: 7 },
    unit: 'in',
    language: 'ja',
    theme: 'dark',
    studyDefaults: { blurPct: 70, values: { count: 7, hue: 200, neutral: true } },
    lineDefaults: {
      ...DEFAULT_LINES,
      style: { colour: '#1f3fbf', widthMm: 1.35, opacityPct: 56 },
      edges: { on: false, detailPct: 73 },
    },
  }

  it('SETTINGS_VERSION is 5', () => {
    expect(SETTINGS_VERSION).toBe(5)
  })

  it('a v4 envelope loads with every field and presets []', () => {
    const s = createSettingsStore(
      memoryStorage(JSON.stringify({ version: 4, state: v4 })),
      'mm',
    ).getState()
    expect({
      pageSetup: s.pageSetup,
      unit: s.unit,
      language: s.language,
      theme: s.theme,
      studyDefaults: s.studyDefaults,
      lineDefaults: s.lineDefaults,
      presets: s.presets,
    }).toEqual({ ...v4, presets: [] })
  })

  it.each([1, 2, 3])('a v%i envelope still loads, with presets []', (version) => {
    const { pageSetup, unit, language, theme } = v4
    const s = createSettingsStore(
      memoryStorage(JSON.stringify({ version, state: { pageSetup, unit, language, theme } })),
    ).getState()
    expect(s).toMatchObject({ pageSetup, unit, language, theme, presets: [] })
  })

  it('stored presets are sanitised on load: a bad one is dropped alone, duplicates keep the first, at most 20', () => {
    const presets = [
      { ...make('A'), pageSetup: { ...make('A').pageSetup, safeAreaMm: 1 } },
      { name: 'broken', pageSetup: 3 },
      make('a'),
      ...Array.from({ length: 22 }, (_, i) => make(`P${String(i)}`)),
    ]
    const s = createSettingsStore(
      memoryStorage(JSON.stringify({ version: 5, state: { ...v4, presets } })),
    ).getState()
    expect(s.presets).toHaveLength(MAX_PRESETS)
    expect(s.presets.map((p) => p.name).slice(0, 3)).toEqual(['A', 'P0', 'P1'])
    expect(s.presets[0]?.pageSetup.safeAreaMm).toBe(3)
    expect(s.theme).toBe('dark')
  })

  describe('savePreset', () => {
    it('adds a new preset at the end and returns saved', () => {
      const store = createSettingsStore(memoryStorage())
      expect(store.getState().savePreset(make('A'))).toBe('saved')
      expect(store.getState().savePreset(make('B'))).toBe('saved')
      expect(names(store)).toEqual(['A', 'B'])
      expect(store.getState().presets[0]).toEqual(make('A'))
    })

    it('normalises the name', () => {
      const store = createSettingsStore(memoryStorage())
      expect(store.getState().savePreset({ ...make('x'), name: '  A4   values ' })).toBe('saved')
      expect(names(store)).toEqual(['A4 values'])
    })

    it('refuses a name that is taken, case-insensitively, unless replace is true', () => {
      const store = createSettingsStore(memoryStorage())
      store.getState().savePreset(make('A4 values'))
      store.getState().savePreset(make('B'))
      const next = make(' a4 VALUES ', { blurPct: 60 })
      expect(store.getState().savePreset(next)).toBe('exists')
      expect(store.getState().presets[0]?.study.blurPct).toBe(25)
      expect(store.getState().savePreset(next, { replace: false })).toBe('exists')
      expect(store.getState().savePreset(next, { replace: true })).toBe('replaced')
      expect(names(store)).toEqual(['a4 VALUES', 'B'])
      expect(store.getState().presets[0]?.study.blurPct).toBe(60)
    })

    it('refuses a new preset when 20 are kept, but still replaces one', () => {
      const store = createSettingsStore(memoryStorage())
      for (let i = 0; i < MAX_PRESETS; i++) {
        expect(store.getState().savePreset(make(`P${String(i)}`))).toBe('saved')
      }
      expect(store.getState().savePreset(make('one more'))).toBe('full')
      expect(store.getState().presets).toHaveLength(MAX_PRESETS)
      expect(store.getState().savePreset(make('P3', { blurPct: 9 }), { replace: true })).toBe(
        'replaced',
      )
      expect(store.getState().presets[3]?.study.blurPct).toBe(9)
    })

    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['too long', 'x'.repeat(41)],
    ])('refuses a name that is %s with bad-name', (_n, name) => {
      const store = createSettingsStore(memoryStorage())
      expect(store.getState().savePreset({ ...make('x'), name })).toBe('bad-name')
      expect(store.getState().presets).toEqual([])
    })

    it('stores only the whitelisted, sanitised fields', () => {
      const storage = memoryStorage()
      const store = createSettingsStore(storage)
      const dirty = {
        ...make('A'),
        imageId: 'img-1',
        study: { ...study, blurPct: 900, contentHash: 'h' },
        lines: { ...make('A').lines, face: true },
      } as unknown as Preset
      store.getState().savePreset(dirty)
      const [p] = store.getState().presets
      expect(p).toEqual(sanitizePreset(dirty))
      expect(p?.study.blurPct).toBe(100)
      expect(p?.lines.face).toBe(false)
      expect(JSON.stringify(saved(storage).state.presets)).not.toMatch(/imageId|contentHash/)
    })
  })

  describe('renamePreset', () => {
    it('renames in place and keeps the list order', () => {
      const store = createSettingsStore(memoryStorage())
      for (const n of ['A', 'B', 'C']) store.getState().savePreset(make(n))
      expect(store.getState().renamePreset('b', '  Bee  ')).toBe('renamed')
      expect(names(store)).toEqual(['A', 'Bee', 'C'])
      expect(store.getState().presets[1]?.study).toEqual(study)
    })

    it('refuses a name another preset has', () => {
      const store = createSettingsStore(memoryStorage())
      for (const n of ['A', 'B']) store.getState().savePreset(make(n))
      expect(store.getState().renamePreset('A', ' b ')).toBe('exists')
      expect(names(store)).toEqual(['A', 'B'])
    })

    it('lets a preset change the case of its own name', () => {
      const store = createSettingsStore(memoryStorage())
      store.getState().savePreset(make('a4'))
      expect(store.getState().renamePreset('a4', 'A4')).toBe('renamed')
      expect(names(store)).toEqual(['A4'])
    })

    it('reports bad-name and missing', () => {
      const store = createSettingsStore(memoryStorage())
      store.getState().savePreset(make('A'))
      expect(store.getState().renamePreset('A', ' ')).toBe('bad-name')
      expect(store.getState().renamePreset('Z', 'Y')).toBe('missing')
      expect(names(store)).toEqual(['A'])
    })
  })

  describe('deletePreset', () => {
    it('removes by name, case-insensitively', () => {
      const store = createSettingsStore(memoryStorage())
      for (const n of ['A', 'B', 'C']) store.getState().savePreset(make(n))
      store.getState().deletePreset(' b ')
      expect(names(store)).toEqual(['A', 'C'])
    })

    it('does nothing for a name it does not have', () => {
      const storage = countingStorage()
      const store = createSettingsStore(storage)
      store.getState().savePreset(make('A'))
      const writes = storage.writes()
      const before = store.getState().presets
      store.getState().deletePreset('Z')
      expect(store.getState().presets).toBe(before)
      expect(storage.writes()).toBe(writes)
    })
  })

  describe('addImportedPresets', () => {
    it('adds each preset with a unique name and reports the renames', () => {
      const store = createSettingsStore(memoryStorage())
      store.getState().savePreset(make('A4'))
      const out = store.getState().addImportedPresets([make('a4'), make('B'), make('B')])
      expect(out).toEqual({
        added: 3,
        renamed: [
          ['a4', 'a4 (2)'],
          ['B', 'B (2)'],
        ],
        skippedFull: 0,
      })
      expect(names(store)).toEqual(['A4', 'a4 (2)', 'B', 'B (2)'])
    })

    it('stops at 20 and counts the rest', () => {
      const store = createSettingsStore(memoryStorage())
      for (let i = 0; i < 18; i++) store.getState().savePreset(make(`P${String(i)}`))
      const out = store.getState().addImportedPresets([make('X'), make('Y'), make('Z'), make('W')])
      expect(out).toEqual({ added: 2, renamed: [], skippedFull: 2 })
      expect(names(store).slice(-2)).toEqual(['X', 'Y'])
    })

    it('sanitises imported presets and skips one whose name is unusable', () => {
      const store = createSettingsStore(memoryStorage())
      const bad = { ...make('x'), name: '' }
      const big = { ...make('Big'), study: { ...study, blurPct: 900 } }
      const out = store.getState().addImportedPresets([bad, big])
      expect(out.added).toBe(1)
      expect(store.getState().presets[0]?.study.blurPct).toBe(100)
    })

    it('writes storage once for a batch, and not at all when nothing is added', () => {
      const storage = countingStorage()
      const store = createSettingsStore(storage)
      store.getState().addImportedPresets([make('A'), make('B'), make('C')])
      expect(storage.writes()).toBe(1)
      for (let i = 0; i < 17; i++) store.getState().savePreset(make(`P${String(i)}`))
      const writes = storage.writes()
      expect(store.getState().addImportedPresets([make('Q')])).toEqual({
        added: 0,
        renamed: [],
        skippedFull: 1,
      })
      expect(storage.writes()).toBe(writes)
    })
  })

  it("an equal save or rename doesn't write storage", () => {
    const storage = countingStorage()
    const store = createSettingsStore(storage)
    store.getState().savePreset(make('A'))
    const writes = storage.writes()
    const before = store.getState().presets
    const listened: unknown[] = []
    store.subscribe((s) => listened.push(s))
    expect(store.getState().savePreset(make('A'), { replace: true })).toBe('replaced')
    expect(store.getState().renamePreset('A', ' A ')).toBe('renamed')
    expect(storage.writes()).toBe(writes)
    expect(listened).toEqual([])
    expect(store.getState().presets).toBe(before)
  })

  it('partialize persists presets, and they reload', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().savePreset(make('A'))
    store.getState().savePreset(make('B'))
    const env = saved(storage)
    expect(env.version).toBe(5)
    expect(env.state.presets).toEqual([make('A'), make('B')])
    expect(createSettingsStore(storage).getState().presets).toEqual([make('A'), make('B')])
  })

  it('reset clears the presets', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().savePreset(make('A'))
    store.getState().reset()
    expect(store.getState().presets).toEqual([])
  })

  describe('presets saved in another tab', () => {
    const envelope = (presets: readonly Preset[], over: Record<string, unknown> = {}) =>
      JSON.stringify({
        version: SETTINGS_VERSION,
        state: { ...DEFAULT_SETTINGS, presets, ...over },
      })
    const storageEvent = (key: string | null, newValue: string | null) =>
      Object.assign(new Event('storage'), { key, newValue })

    it('adopts the presets of a write from another tab without writing storage, so a later save keeps them', () => {
      const events = new EventTarget()
      const storage = countingStorage()
      const store = createSettingsStore(storage, 'mm', events)
      store.getState().savePreset(make('Mine'))
      const writes = storage.writes()
      events.dispatchEvent(
        storageEvent(SETTINGS_STORAGE_KEY, envelope([make('Mine'), make('Theirs')])),
      )
      expect(names(store)).toEqual(['Mine', 'Theirs'])
      expect(storage.writes()).toBe(writes)
      store.getState().savePreset(make('Third'))
      expect((saved(storage).state.presets as Preset[]).map((p) => p.name)).toEqual([
        'Mine',
        'Theirs',
        'Third',
      ])
    })

    it('adopts only the presets: the other settings of this tab stay', () => {
      const events = new EventTarget()
      const store = createSettingsStore(memoryStorage(), 'mm', events)
      events.dispatchEvent(
        storageEvent(
          SETTINGS_STORAGE_KEY,
          envelope([make('Theirs')], { theme: 'dark', unit: 'in' }),
        ),
      )
      expect(names(store)).toEqual(['Theirs'])
      expect(store.getState().theme).toBe('auto')
      expect(store.getState().unit).toBe('mm')
    })

    it('sanitises the adopted presets as a load does', () => {
      const events = new EventTarget()
      const store = createSettingsStore(memoryStorage(), 'mm', events)
      const raw = { ...make('A'), imageId: 'x', study: { ...study, blurPct: 900 } }
      events.dispatchEvent(storageEvent(SETTINGS_STORAGE_KEY, envelope([raw, make('a')])))
      expect(names(store)).toEqual(['A'])
      expect(store.getState().presets[0]?.study.blurPct).toBe(100)
      expect(store.getState().presets[0]).not.toHaveProperty('imageId')
    })

    it('an equal list changes nothing', () => {
      const events = new EventTarget()
      const store = createSettingsStore(memoryStorage(), 'mm', events)
      store.getState().savePreset(make('A'))
      const listened: unknown[] = []
      store.subscribe((s) => listened.push(s))
      events.dispatchEvent(storageEvent(SETTINGS_STORAGE_KEY, envelope([make('A')])))
      expect(listened).toEqual([])
    })

    it.each([
      ['another key', 'other', envelope([])],
      ['a cleared storage', null, null],
      ['a removed value', SETTINGS_STORAGE_KEY, null],
      ['unreadable JSON', SETTINGS_STORAGE_KEY, '{oops'],
      ['an envelope that is not an object', SETTINGS_STORAGE_KEY, '[1]'],
      ['an envelope without a state', SETTINGS_STORAGE_KEY, JSON.stringify({ version: 5 })],
      [
        'an older version, which does not know presets',
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ version: 4, state: { ...DEFAULT_SETTINGS, presets: [] } }),
      ],
      [
        'a newer version',
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ version: 6, state: { ...DEFAULT_SETTINGS, presets: [] } }),
      ],
    ])('ignores %s', (_label, key, newValue) => {
      const events = new EventTarget()
      const store = createSettingsStore(memoryStorage(), 'mm', events)
      store.getState().savePreset(make('Mine'))
      events.dispatchEvent(storageEvent(key, newValue))
      expect(names(store)).toEqual(['Mine'])
    })
  })

  describe('a failed storage write', () => {
    type Store = ReturnType<typeof createSettingsStore>
    const failing = (): StateStorage => ({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => undefined,
    })

    it('safeStorage reports whether a write was stored', () => {
      expect(safeStorage(() => failing()).setItem('k', 'v')).toBe(false)
      expect(safeStorage(() => memoryStorage()).setItem('k', 'v')).toBe(true)
    })

    it.each([
      ['savePreset', (s: Store) => s.getState().savePreset(make('B'))],
      [
        'savePreset with replace',
        (s: Store) => s.getState().savePreset(make('A', { blurPct: 60 }), { replace: true }),
      ],
      ['renamePreset', (s: Store) => s.getState().renamePreset('A', 'Z')],
      [
        'deletePreset',
        (s: Store) => {
          s.getState().deletePreset('A')
        },
      ],
      ['addImportedPresets', (s: Store) => s.getState().addImportedPresets([make('C')])],
    ])('%s reports it through lastWriteFailed', (_label, act) => {
      let fail = false
      const inner = memoryStorage()
      const storage = safeStorage(() => (fail ? failing() : inner))
      const store = createSettingsStore(storage)
      store.getState().savePreset(make('A'))
      expect(store.getState().lastWriteFailed()).toBe(false)
      fail = true
      act(store)
      expect(store.getState().lastWriteFailed()).toBe(true)
    })

    it.each([
      ['savePreset to a taken name', (s: Store) => s.getState().savePreset(make('a'))],
      ['an equal replace', (s: Store) => s.getState().savePreset(make('A'), { replace: true })],
      ['renamePreset of a missing name', (s: Store) => s.getState().renamePreset('Z', 'Y')],
      [
        'deletePreset of a missing name',
        (s: Store) => {
          s.getState().deletePreset('Z')
        },
      ],
      ['addImportedPresets of nothing', (s: Store) => s.getState().addImportedPresets([])],
    ])('%s writes nothing and reports no failure', (_label, act) => {
      let fail = false
      const storage = safeStorage(() => (fail ? failing() : memoryStorage()))
      const store = createSettingsStore(storage)
      store.getState().savePreset(make('A'))
      fail = true
      store.getState().savePreset(make('B'))
      expect(store.getState().lastWriteFailed()).toBe(true)
      act(store)
      expect(store.getState().lastWriteFailed()).toBe(false)
    })

    it('a write that succeeds again clears the failure', () => {
      let fail = true
      const storage = safeStorage(() => (fail ? failing() : memoryStorage()))
      const store = createSettingsStore(storage)
      store.getState().savePreset(make('A'))
      expect(store.getState().lastWriteFailed()).toBe(true)
      fail = false
      store.getState().savePreset(make('B'))
      expect(store.getState().lastWriteFailed()).toBe(false)
    })
  })
})
