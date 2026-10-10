import { z } from 'zod'
import { LANGUAGES, type LanguageCode } from '../../shared/i18n/languages'
import {
  DEFAULT_LINES,
  sanitizeLines,
  SPIRAL_CORNERS,
  withoutLineTypes,
  type LineSettings,
} from '../../shared/model/lines'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../shared/model/page-setup'
import { pageSetupSchema, parsePageSetup } from '../../shared/model/page-setup-schema'
import { MAX_PRESETS, sameName, sanitizePreset, type Preset } from '../../shared/model/preset'
import { DEFAULT_STUDY, sanitizeStudy, type StudySettings } from '../../shared/model/study'
import type { Unit } from '../../shared/model/units'

export const THEMES = ['auto', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** Owner Q5 (default): blur %, value count and hue are remembered; versions are not. */
export type StudyDefaults = Omit<StudySettings, 'versions'>

export interface SettingsData {
  readonly pageSetup: PageSetup
  readonly unit: Unit
  readonly language: LanguageCode | null
  readonly theme: Theme
  readonly studyDefaults: StudyDefaults
  /** What new photos start with: every line type off (owner Q7, default). */
  readonly lineDefaults: LineSettings
  /** At most MAX_PRESETS, names unique case-insensitively (M5-R3). */
  readonly presets: readonly Preset[]
}

const DS: StudyDefaults = { blurPct: DEFAULT_STUDY.blurPct, values: DEFAULT_STUDY.values }

export const DEFAULT_SETTINGS: SettingsData = {
  pageSetup: DEFAULT_PAGE_SETUP,
  unit: 'mm',
  language: null,
  theme: 'auto',
  studyDefaults: DS,
  lineDefaults: DEFAULT_LINES,
  presets: [],
}

/**
 * Total, like the page-setup schema, but it checks types only: ranges belong to `sanitizeStudy`, so a
 * stored value is clamped or wrapped exactly as `setStudyDefaults` would. Unknown keys (e.g. a
 * stored `versions`) are stripped.
 */
const studyDefaultsSchema = z.object({
  blurPct: z.number().catch(DS.blurPct),
  values: z
    .object({
      count: z.number().catch(DS.values.count),
      hue: z.number().catch(DS.values.hue),
      neutral: z.boolean().catch(DS.values.neutral),
    })
    .catch(DS.values),
})

/** The one normalisation for study defaults, on load and in `setStudyDefaults`. Drops `versions`. */
export function normalizeStudyDefaults(defaults: StudyDefaults): StudyDefaults {
  const study = sanitizeStudy({ ...defaults, versions: DEFAULT_STUDY.versions })
  return { blurPct: study.blurPct, values: study.values }
}

const L = DEFAULT_LINES

/**
 * Total and types-only, like studyDefaultsSchema: ranges and hex belong to `sanitizeLines` (M3-R16).
 * The corner is a type (a name union) with the same fallback as `sanitizeLines`. Unknown keys are stripped.
 */
const lineDefaultsSchema = z.object({
  grid: z
    .object({
      on: z.boolean().catch(L.grid.on),
      cols: z.number().catch(L.grid.cols),
      rows: z.number().catch(L.grid.rows),
    })
    .catch(L.grid),
  thirds: z.boolean().catch(L.thirds),
  armature: z.boolean().catch(L.armature),
  golden: z.boolean().catch(L.golden),
  spiral: z
    .object({
      on: z.boolean().catch(L.spiral.on),
      corner: z.enum(SPIRAL_CORNERS).catch(L.spiral.corner),
    })
    .catch(L.spiral),
  centre: z.boolean().catch(L.centre),
  style: z
    .object({
      colour: z.string().catch(L.style.colour),
      widthMm: z.number().catch(L.style.widthMm),
      opacityPct: z.number().catch(L.style.opacityPct),
    })
    .catch(L.style),
  edges: z
    .object({
      on: z.boolean().catch(L.edges.on),
      detailPct: z.number().catch(L.edges.detailPct),
    })
    .catch(L.edges),
  face: z.boolean().catch(L.face),
  pose: z.boolean().catch(L.pose),
})

/** The one normalisation for line defaults, on load and in `setLineDefaults` (M3 owner Q7 and M4 owner Q8, default: types and guide switches are not remembered; the edge detail is). */
export function normalizeLineDefaults(lines: LineSettings): LineSettings {
  return withoutLineTypes(sanitizeLines(lines))
}

/** The one load path for stored presets: each through `sanitizePreset` alone, the first of equal names kept, at most MAX_PRESETS. */
export function sanitizePresets(raw: readonly unknown[]): Preset[] {
  const kept: Preset[] = []
  for (const entry of raw) {
    if (kept.length === MAX_PRESETS) break
    const preset = sanitizePreset(entry)
    if (preset !== null && !kept.some((p) => sameName(p.name, preset.name))) kept.push(preset)
  }
  return kept
}

export const settingsSchema = z.object({
  pageSetup: pageSetupSchema.catch(DEFAULT_PAGE_SETUP),
  unit: z.enum(['mm', 'in']).catch(DEFAULT_SETTINGS.unit),
  language: z.enum(LANGUAGES).nullable().catch(null),
  theme: z.enum(THEMES).catch(DEFAULT_SETTINGS.theme),
  studyDefaults: studyDefaultsSchema.catch(DS),
  lineDefaults: lineDefaultsSchema.catch(L),
  presets: z.array(z.unknown()).catch([]),
})

let warned = false
function warnOnce(reason: unknown): void {
  if (warned || !import.meta.env.DEV) return
  warned = true
  console.warn('[artistica] Ignoring unreadable saved settings; using defaults.', reason)
}

/**
 * Turn anything that came out of storage into valid settings. Never throws.
 * Missing or invalid fields take their defaults and the page setup is normalised.
 */
export function parseSettings(input: unknown): SettingsData {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    if (input !== undefined && input !== null) warnOnce(input)
    return DEFAULT_SETTINGS
  }
  try {
    const parsed = settingsSchema.parse(input)
    return {
      ...parsed,
      pageSetup: parsePageSetup(parsed.pageSetup),
      studyDefaults: normalizeStudyDefaults(parsed.studyDefaults),
      lineDefaults: normalizeLineDefaults(parsed.lineDefaults),
      presets: sanitizePresets(parsed.presets),
    }
  } catch (error) {
    warnOnce(error)
    return DEFAULT_SETTINGS
  }
}
