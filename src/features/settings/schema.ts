import { z } from 'zod'
import { LANGUAGES, type LanguageCode } from '../../shared/i18n/languages'
import {
  DEFAULT_LINES,
  sanitizeLines,
  withoutLineTypes,
  type LineSettings,
} from '../../shared/model/lines'
import { CUSTOM_PAPER_LIMITS, PAPER_IDS, type PaperId } from '../../shared/model/paper'
import {
  DEFAULT_PAGE_SETUP,
  normalizePageSetup,
  type Orientation,
  type PageSetup,
} from '../../shared/model/page-setup'
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
}

const DS: StudyDefaults = { blurPct: DEFAULT_STUDY.blurPct, values: DEFAULT_STUDY.values }

export const DEFAULT_SETTINGS: SettingsData = {
  pageSetup: DEFAULT_PAGE_SETUP,
  unit: 'mm',
  language: null,
  theme: 'auto',
  studyDefaults: DS,
  lineDefaults: DEFAULT_LINES,
}

const D = DEFAULT_PAGE_SETUP
const { minMm, maxMm } = CUSTOM_PAPER_LIMITS

const lengthMm = (max: number) => z.number().min(0).max(max)
const paperIds = PAPER_IDS as [PaperId, ...PaperId[]]
const orientations: [Orientation, ...Orientation[]] = ['auto', 'portrait', 'landscape']

/**
 * Every field falls back to its default on its own (`.catch`), so one bad field never throws away
 * the others. The schema is deliberately total: `parse` never throws on any input that is an object.
 */
const pageSetupSchema = z.object({
  paper: z.enum(paperIds).catch(D.paper),
  customSize: z
    .object({
      w: z.number().min(minMm).max(maxMm),
      h: z.number().min(minMm).max(maxMm),
    })
    .catch(D.customSize),
  orientation: z.enum(orientations).catch(D.orientation),
  safeAreaMm: lengthMm(100).catch(D.safeAreaMm),
  gutter: z
    .object({ enabled: z.boolean().catch(D.gutter.enabled), mm: lengthMm(100).catch(D.gutter.mm) })
    .catch(D.gutter),
  cropMarks: z.boolean().catch(D.cropMarks),
  bleed: z
    .object({ enabled: z.boolean().catch(D.bleed.enabled), mm: lengthMm(50).catch(D.bleed.mm) })
    .catch(D.bleed),
})

/**
 * Total, like pageSetupSchema, but it checks types only: ranges belong to `sanitizeStudy`, so a
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

/** Total and types-only, like studyDefaultsSchema: ranges, hex and corner names belong to `sanitizeLines` (M3-R16). */
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
      corner: z.string().catch(L.spiral.corner),
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
})

/** The one normalisation for line defaults, on load and in `setLineDefaults` (owner Q7, default: types are not remembered). */
export function normalizeLineDefaults(lines: LineSettings): LineSettings {
  return withoutLineTypes(sanitizeLines(lines))
}

export const settingsSchema = z.object({
  pageSetup: pageSetupSchema.catch(D),
  unit: z.enum(['mm', 'in']).catch(DEFAULT_SETTINGS.unit),
  language: z.enum(LANGUAGES).nullable().catch(null),
  theme: z.enum(THEMES).catch(DEFAULT_SETTINGS.theme),
  studyDefaults: studyDefaultsSchema.catch(DS),
  lineDefaults: lineDefaultsSchema.catch(L),
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
    // customSize is stored portrait-normalised (w ≤ h).
    const { w, h } = parsed.pageSetup.customSize
    const customSize = w <= h ? { w, h } : { w: h, h: w }
    const pageSetup = normalizePageSetup({ ...parsed.pageSetup, customSize }).setup
    return {
      ...parsed,
      pageSetup,
      studyDefaults: normalizeStudyDefaults(parsed.studyDefaults),
      // The corner is any string until sanitizeLines, which is total, narrows it.
      lineDefaults: normalizeLineDefaults(parsed.lineDefaults as LineSettings),
    }
  } catch (error) {
    warnOnce(error)
    return DEFAULT_SETTINGS
  }
}
