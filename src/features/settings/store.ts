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
import {
  DEFAULT_SETTINGS,
  normalizeStudyDefaults,
  parseSettings,
  type SettingsData,
  type StudyDefaults,
  type Theme,
} from './schema'

export const SETTINGS_STORAGE_KEY = 'artistica:settings'
export const SETTINGS_VERSION = 2

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
  /** Remember the last-used study settings (owner Q5, default). Normalised; same state when equal. */
  setStudyDefaults(defaults: StudyDefaults): void
  reset(): void
}

/** A key set to `undefined` means "not patched", the same as a missing key. */
function definedOnly<T extends object>(patch: T | undefined): Partial<T> {
  if (patch === undefined) return {}
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

function mergePageSetup(base: PageSetup, patch: PageSetupPatch): PageSetup {
  return {
    ...base,
    ...definedOnly(patch),
    customSize: { ...base.customSize, ...definedOnly(patch.customSize) },
    gutter: { ...base.gutter, ...definedOnly(patch.gutter) },
    bleed: { ...base.bleed, ...definedOnly(patch.bleed) },
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
        setStudyDefaults: (defaults) => {
          set((state) => {
            const next = normalizeStudyDefaults(defaults)
            const cur = state.studyDefaults
            const equal =
              next.blurPct === cur.blurPct &&
              next.values.count === cur.values.count &&
              next.values.hue === cur.values.hue &&
              next.values.neutral === cur.values.neutral
            return equal ? state : { studyDefaults: next }
          })
        },
        reset: () => {
          set({ ...DEFAULT_SETTINGS, unit: initialUnit, pageSetupNotes: [] })
        },
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        version: SETTINGS_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ pageSetup, unit, language, theme, studyDefaults }) => ({
          pageSetup,
          unit,
          language,
          theme,
          studyDefaults,
        }),
        // Runs for v1 and any other version. parseSettings keeps every v1 field and fills
        // studyDefaults with the default; there is no other format to convert.
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
