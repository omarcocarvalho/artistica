import { describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { DEFAULT_SETTINGS } from './schema'
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
  it('writes version 2 under artistica:settings, without notes or actions', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setTheme('light')
    store.getState().setPageSetup({ safeAreaMm: 1 })
    const { version, state } = saved(storage)
    expect(SETTINGS_STORAGE_KEY).toBe('artistica:settings')
    expect(version).toBe(2)
    expect(SETTINGS_VERSION).toBe(2)
    expect(Object.keys(state).sort()).toEqual([
      'language',
      'pageSetup',
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

  it('is version 2', () => {
    expect(SETTINGS_VERSION).toBe(2)
  })

  it('migrates a v1 envelope to v2 keeping every field', () => {
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

  it('setStudyDefaults persists blur and values, sanitized, under version 2', () => {
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
    expect(env.version).toBe(2)
    expect(env.state.studyDefaults).toEqual(store.getState().studyDefaults)
  })

  it('persists nothing but the four M1 fields and studyDefaults', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setStudyDefaults({ blurPct: 10, values: DEFAULT_STUDY.values })
    expect(Object.keys(saved(storage).state).sort()).toEqual([
      'language',
      'pageSetup',
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

  it('keeps the same state when setStudyDefaults gets equal values (no storage write churn)', () => {
    const store = createSettingsStore(memoryStorage())
    const before = store.getState().studyDefaults
    store.getState().setStudyDefaults({ ...before, values: { ...before.values } })
    expect(store.getState().studyDefaults).toBe(before)
  })
})
