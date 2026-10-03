import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { LanguageCode } from '../../shared/i18n/languages'
import {
  normalizePageSetup,
  type PageSetup,
  type PageSetupNote,
} from '../../shared/model/page-setup'
import type { SizeMm } from '../../shared/model/paper'
import { defaultUnitForLocale, type Unit } from '../../shared/model/units'
import { DEFAULT_SETTINGS, parseSettings, type SettingsData, type Theme } from './schema'

export const SETTINGS_STORAGE_KEY = 'artistica:settings'
export const SETTINGS_VERSION = 1

/** Nested objects are merged one level deep, so callers can change one gutter field. */
export interface PageSetupPatch {
  readonly paper?: PageSetup['paper']
  readonly customSize?: Partial<SizeMm>
  readonly orientation?: PageSetup['orientation']
  readonly safeAreaMm?: PageSetup['safeAreaMm']
  readonly gutter?: Partial<PageSetup['gutter']>
  readonly cropMarks?: PageSetup['cropMarks']
  readonly bleed?: Partial<PageSetup['bleed']>
}

export interface SettingsState extends SettingsData {
  /** Notes from the latest `setPageSetup` call. Not persisted. */
  readonly pageSetupNotes: PageSetupNote[]
  setPageSetup(patch: PageSetupPatch): void
  setUnit(unit: Unit): void
  setLanguage(language: LanguageCode | null): void
  setTheme(theme: Theme): void
  reset(): void
}

function mergePageSetup(base: PageSetup, patch: PageSetupPatch): PageSetup {
  return {
    ...base,
    ...patch,
    customSize: { ...base.customSize, ...patch.customSize },
    gutter: { ...base.gutter, ...patch.gutter },
    bleed: { ...base.bleed, ...patch.bleed },
  }
}

/**
 * Wrap a storage so that it can never throw: blocked site data, quota errors and private windows
 * must cost us persistence, not the app. Reads that fail look like "nothing saved".
 */
export function safeStorage(inner: () => StateStorage): StateStorage {
  const guard = <T>(fn: (storage: StateStorage) => T, fallback: T): T => {
    try {
      return fn(inner())
    } catch {
      return fallback
    }
  }
  return {
    getItem: (key) => guard((s) => s.getItem(key) as string | null, null),
    setItem: (key, value) => {
      guard((s) => {
        s.setItem(key, value)
      }, undefined)
    },
    removeItem: (key) => {
      guard((s) => {
        s.removeItem(key)
      }, undefined)
    },
  }
}

/** `window.localStorage` is read lazily because merely touching it can throw. */
const browserStorage = safeStorage(() => window.localStorage)

/**
 * First-run unit from the browser language (owner Q8, default). `navigator` may be missing
 * (SSR, workers) or its getters may throw, in which case the answer is millimetres.
 */
export function initialUnitFromNavigator(
  ...args: [nav?: { readonly language?: unknown } | undefined]
): Unit {
  try {
    // An explicit `undefined` means "no navigator"; only a call with no argument reads the global.
    const nav =
      args.length === 0 ? (typeof navigator === 'undefined' ? undefined : navigator) : args[0]
    const language = nav?.language
    return typeof language === 'string' ? defaultUnitForLocale(language) : 'mm'
  } catch {
    return 'mm'
  }
}

/**
 * Exported for tests; the app uses `useSettings`. `initialUnit` applies only when nothing valid
 * is saved (and after `reset()`); tests leave it at `'mm'` so jsdom's `en-US` does not leak in.
 */
export function createSettingsStore(
  storage: StateStorage = browserStorage,
  initialUnit: Unit = DEFAULT_SETTINGS.unit,
) {
  return create<SettingsState>()(
    persist(
      (set) => ({
        ...DEFAULT_SETTINGS,
        unit: initialUnit,
        pageSetupNotes: [],
        setPageSetup: (patch) => {
          set((state) => {
            const { setup, notes } = normalizePageSetup(mergePageSetup(state.pageSetup, patch))
            return { pageSetup: setup, pageSetupNotes: notes }
          })
        },
        setUnit: (unit) => {
          set({ unit })
        },
        setLanguage: (language) => {
          set({ language })
        },
        setTheme: (theme) => {
          set({ theme })
        },
        reset: () => {
          set({ ...DEFAULT_SETTINGS, unit: initialUnit, pageSetupNotes: [] })
        },
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        version: SETTINGS_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ pageSetup, unit, language, theme }) => ({
          pageSetup,
          unit,
          language,
          theme,
        }),
        // Runs for older/newer versions. There is no earlier format to convert, so anything
        // that is not a v1 object is sanitised the same way.
        migrate: (persisted) => parseSettings(persisted),
        // Runs for every load, including current-version data that was edited by hand.
        // Nothing saved (or unreadable JSON, which storage reports as null) keeps the initial
        // state, including the locale-based unit.
        merge: (persisted, current) =>
          persisted === undefined || persisted === null
            ? current
            : { ...current, ...parseSettings(persisted) },
      },
    ),
  )
}

export const useSettings = createSettingsStore(browserStorage, initialUnitFromNavigator())
