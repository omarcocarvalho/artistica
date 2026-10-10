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
import { linesEqual, type LineSettings } from '../../shared/model/lines'
import {
  MAX_PRESETS,
  presetName,
  sameName,
  sanitizePreset,
  uniqueName,
  type Preset,
} from '../../shared/model/preset'
import {
  DEFAULT_SETTINGS,
  normalizeLineDefaults,
  normalizeStudyDefaults,
  parseSettings,
  type SettingsData,
  type StudyDefaults,
  type Theme,
} from './schema'

export const SETTINGS_STORAGE_KEY = 'artistica:settings'
export const SETTINGS_VERSION = 5

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
  /** Remember the last-used study settings (owner Q5, default). Normalised; no state change or storage write when equal. */
  setStudyDefaults(defaults: StudyDefaults): void
  /** Remember the last-used line settings and edge detail, every type and guide off (owner Q7 and M4 Q8, default). Normalised; no state change or storage write when equal. */
  setLineDefaults(lines: LineSettings): void
  /** Adds the preset, sanitised, or with `replace` overwrites the one whose name matches (M5-R3). No storage write when nothing changes. */
  savePreset(preset: Preset, opts?: { replace?: boolean }): SavePresetResult
  /** Renames in place; the list order is kept. */
  renamePreset(from: string, to: string): RenamePresetResult
  deletePreset(name: string): void
  /** Appends sanitised presets under unique names, up to MAX_PRESETS, in one write. */
  addImportedPresets(list: readonly Preset[]): ImportedPresetsResult
  /** Whether the latest storage write failed (storage full or blocked). A preset action that writes nothing reports false. */
  lastWriteFailed(): boolean
  reset(): void
}

export type SavePresetResult = 'saved' | 'replaced' | 'exists' | 'full' | 'bad-name'
export type RenamePresetResult = 'renamed' | 'exists' | 'bad-name' | 'missing'
export interface ImportedPresetsResult {
  readonly added: number
  /** `[name in the file, name kept]` for each preset whose name was taken. */
  readonly renamed: readonly (readonly [string, string])[]
  readonly skippedFull: number
}

/** Presets are plain data built field by field in a fixed key order, so equal JSON means equal presets. */
const presetEqual = (a: Preset, b: Preset): boolean => JSON.stringify(a) === JSON.stringify(b)

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
 * must cost us persistence, not the app. Reads that fail look like "nothing saved"; `setItem`
 * returns false when the value was not stored.
 */
export function safeStorage(inner: () => StateStorage): StateStorage<boolean | undefined> {
  const guard = <T>(fn: (storage: StateStorage) => T, fallback: T): T => {
    try {
      return fn(inner())
    } catch {
      return fallback
    }
  }
  return {
    getItem: (key) => guard((s) => s.getItem(key) as string | null, null),
    setItem: (key, value) =>
      guard((s) => {
        s.setItem(key, value)
        return true
      }, false),
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

const presetListsEqual = (a: readonly Preset[], b: readonly Preset[]): boolean =>
  a.length === b.length &&
  a.every((p, i) => {
    const q = b[i]
    return q !== undefined && presetEqual(p, q)
  })

/** The presets of a settings envelope written by this version, or null for anything else. */
function presetsOfEnvelope(json: string): readonly Preset[] | null {
  let envelope: unknown
  try {
    envelope = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof envelope !== 'object' || envelope === null) return null
  const { version, state } = envelope as { version?: unknown; state?: unknown }
  if (version !== SETTINGS_VERSION || typeof state !== 'object' || state === null) return null
  return parseSettings(state).presets
}

/**
 * Exported for tests; the app uses `useSettings`. `initialUnit` applies only when nothing valid
 * is saved (and after `reset()`); tests leave it at `'mm'` so jsdom's `en-US` does not leak in.
 * `events` receives the `storage` events of other tabs: their presets are adopted, so a save here
 * never drops a preset saved there. Other settings stay this tab's own.
 */
export function createSettingsStore(
  storage: StateStorage = browserStorage,
  initialUnit: Unit = DEFAULT_SETTINGS.unit,
  events: EventTarget | null = null,
) {
  let writeFailed = false
  let adopting = false
  const tracked: StateStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      if (adopting) return
      writeFailed = storage.setItem(key, value) === false
    },
    removeItem: (key) => storage.removeItem(key),
  }
  const store = create<SettingsState>()(
    persist(
      (set, get) => ({
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
        // Equal values skip `set`: persist writes storage on every `set`, even one that keeps the state.
        setStudyDefaults: (defaults) => {
          const next = normalizeStudyDefaults(defaults)
          const cur = get().studyDefaults
          const equal =
            next.blurPct === cur.blurPct &&
            next.values.count === cur.values.count &&
            next.values.hue === cur.values.hue &&
            next.values.neutral === cur.values.neutral
          if (!equal) set({ studyDefaults: next })
        },
        setLineDefaults: (lines) => {
          const next = normalizeLineDefaults(lines)
          if (!linesEqual(next, get().lineDefaults)) set({ lineDefaults: next })
        },
        savePreset: (preset, opts) => {
          writeFailed = false
          const name = typeof preset.name === 'string' ? presetName(preset.name) : null
          const clean = name === null ? null : sanitizePreset({ ...preset, name })
          if (clean === null) return 'bad-name'
          const { presets } = get()
          const at = presets.findIndex((p) => sameName(p.name, clean.name))
          if (at === -1) {
            if (presets.length >= MAX_PRESETS) return 'full'
            set({ presets: [...presets, clean] })
            return 'saved'
          }
          if (opts?.replace !== true) return 'exists'
          const current = presets[at]
          if (current === undefined || !presetEqual(current, clean)) {
            set({ presets: presets.map((p, i) => (i === at ? clean : p)) })
          }
          return 'replaced'
        },
        renamePreset: (from, to) => {
          writeFailed = false
          const { presets } = get()
          const at = presets.findIndex((p) => sameName(p.name, from))
          const current = presets[at]
          if (current === undefined) return 'missing'
          const name = presetName(to)
          if (name === null) return 'bad-name'
          if (presets.some((p, i) => i !== at && sameName(p.name, name))) return 'exists'
          if (current.name !== name) {
            set({ presets: presets.map((p, i) => (i === at ? { ...p, name } : p)) })
          }
          return 'renamed'
        },
        deletePreset: (name) => {
          writeFailed = false
          const { presets } = get()
          const next = presets.filter((p) => !sameName(p.name, name))
          if (next.length !== presets.length) set({ presets: next })
        },
        addImportedPresets: (list) => {
          writeFailed = false
          const next = [...get().presets]
          const renamed: [string, string][] = []
          let added = 0
          let skippedFull = 0
          for (const raw of list) {
            const preset = sanitizePreset(raw)
            if (preset === null) continue
            if (next.length >= MAX_PRESETS) {
              skippedFull++
              continue
            }
            const name = uniqueName(
              preset.name,
              next.map((p) => p.name),
            )
            if (name !== preset.name) renamed.push([preset.name, name])
            next.push({ ...preset, name })
            added++
          }
          if (added > 0) set({ presets: next })
          return { added, renamed, skippedFull }
        },
        lastWriteFailed: () => writeFailed,
        reset: () => {
          set({ ...DEFAULT_SETTINGS, unit: initialUnit, pageSetupNotes: [] })
        },
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        version: SETTINGS_VERSION,
        storage: createJSONStorage(() => tracked),
        partialize: ({
          pageSetup,
          unit,
          language,
          theme,
          studyDefaults,
          lineDefaults,
          presets,
        }) => ({
          pageSetup,
          unit,
          language,
          theme,
          studyDefaults,
          lineDefaults,
          presets,
        }),
        // Runs for v1–v4 and any other version. parseSettings keeps every stored field and fills a
        // missing studyDefaults, lineDefaults, edge detail or presets with its default; there is no other format to convert.
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
  events?.addEventListener('storage', (event) => {
    const { key, newValue } = event as Partial<Pick<StorageEvent, 'key' | 'newValue'>>
    if (key !== SETTINGS_STORAGE_KEY || typeof newValue !== 'string') return
    const presets = presetsOfEnvelope(newValue)
    if (presets === null || presetListsEqual(presets, store.getState().presets)) return
    // Storage already holds the other tab's envelope; writing ours back would overwrite its other settings.
    adopting = true
    try {
      store.setState({ presets })
    } finally {
      adopting = false
    }
  })
  return store
}

export const useSettings = createSettingsStore(
  browserStorage,
  initialUnitFromNavigator(),
  typeof window === 'undefined' ? null : window,
)
