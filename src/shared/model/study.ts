export const STUDY_VERSIONS = ['original', 'blurred', 'values', 'blurValues'] as const
export type StudyVersion = (typeof STUDY_VERSIONS)[number]

export interface StudyValues {
  /** Integer MIN_VALUES..MAX_VALUES. */
  readonly count: number
  /** OKLCH hue in whole degrees, [0, 360). */
  readonly hue: number
  /** True: chroma 0 (the "Neutral grey" swatch). The hue is kept for when it is switched off. */
  readonly neutral: boolean
}

export interface StudySettings {
  /** Non-empty, no duplicates, always in STUDY_VERSIONS order. */
  readonly versions: readonly StudyVersion[]
  /** Integer MIN_BLUR_PCT..MAX_BLUR_PCT. */
  readonly blurPct: number
  readonly values: StudyValues
}

export const MIN_BLUR_PCT = 1
export const MAX_BLUR_PCT = 100
export const MIN_VALUES = 2
export const MAX_VALUES = 20
/** At 100% the Gaussian σ is this fraction of the printed tile's short side (spec §2.6). */
export const BLUR_SIGMA_AT_MAX = 0.05

/** New images start with this (owner Q1–Q4, default): Original only, 40%, 5 values, sepia. */
export const DEFAULT_STUDY: StudySettings = {
  versions: ['original'],
  blurPct: 40,
  values: { count: 5, hue: 55, neutral: false },
}

export type HuePresetId =
  'sepia' | 'terracotta' | 'ochre' | 'sapGreen' | 'teal' | 'ultramarine' | 'violet' | 'neutral'

/** The swatches of design/studies.html (owner D8), in display order. `hue: null` = neutral grey. */
export const HUE_PRESETS: readonly { readonly id: HuePresetId; readonly hue: number | null }[] = [
  { id: 'sepia', hue: 55 },
  { id: 'terracotta', hue: 35 },
  { id: 'ochre', hue: 85 },
  { id: 'sapGreen', hue: 135 },
  { id: 'teal', hue: 195 },
  { id: 'ultramarine', hue: 265 },
  { id: 'violet', hue: 305 },
  { id: 'neutral', hue: null },
]

function clampInt(value: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(value)))
}

function wrapHue(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STUDY.values.hue
  return ((Math.round(value) % 360) + 360) % 360
}

const isVersion = (v: unknown): v is StudyVersion =>
  (STUDY_VERSIONS as readonly unknown[]).includes(v)

/** Total and idempotent: any input that has the right shape becomes a valid StudySettings. */
export function sanitizeStudy(study: StudySettings): StudySettings {
  const raw: readonly unknown[] = Array.isArray(study.versions) ? study.versions : []
  const wanted = new Set(raw.filter(isVersion))
  const versions = STUDY_VERSIONS.filter((v) => wanted.has(v))
  const neutral: unknown = study.values.neutral
  return {
    versions: versions.length > 0 ? versions : ['original'],
    blurPct: clampInt(study.blurPct, MIN_BLUR_PCT, MAX_BLUR_PCT, DEFAULT_STUDY.blurPct),
    values: {
      count: clampInt(study.values.count, MIN_VALUES, MAX_VALUES, DEFAULT_STUDY.values.count),
      hue: wrapHue(study.values.hue),
      neutral: neutral === true,
    },
  }
}

export function studyEqual(a: StudySettings, b: StudySettings): boolean {
  return (
    a.blurPct === b.blurPct &&
    a.values.count === b.values.count &&
    a.values.hue === b.values.hue &&
    a.values.neutral === b.values.neutral &&
    a.versions.length === b.versions.length &&
    a.versions.every((v, i) => b.versions[i] === v)
  )
}

/** Turn one version on or off. Turning off the last selected version returns `study` itself (owner Q13). */
export function withVersion(
  study: StudySettings,
  version: StudyVersion,
  on: boolean,
): StudySettings {
  if (!on && study.versions.length === 1 && study.versions[0] === version) return study
  const versions = on ? [...study.versions, version] : study.versions.filter((v) => v !== version)
  return sanitizeStudy({ ...study, versions })
}

export interface StudyPatch {
  readonly versions?: readonly StudyVersion[]
  readonly blurPct?: number
  readonly values?: Partial<StudyValues>
}

/** Merge (values one level deep; undefined means "not patched") then sanitize. */
export function patchStudy(study: StudySettings, patch: StudyPatch): StudySettings {
  const entries: [string, unknown][] = Object.entries(patch.values ?? {})
  const values = Object.fromEntries(
    entries.filter(([, v]) => v !== undefined),
  ) as Partial<StudyValues>
  return sanitizeStudy({
    versions: patch.versions ?? study.versions,
    blurPct: patch.blurPct ?? study.blurPct,
    values: { ...study.values, ...values },
  })
}

/** What one printed tile needs. null for 'original'. */
export interface TileStudy {
  readonly blurPct: number | null
  readonly values: StudyValues | null
}

export function tileStudyFor(version: StudyVersion, study: StudySettings): TileStudy | null {
  switch (version) {
    case 'original':
      return null
    case 'blurred':
      return { blurPct: study.blurPct, values: null }
    case 'values':
      return { blurPct: null, values: study.values }
    case 'blurValues':
      return { blurPct: study.blurPct, values: study.values }
  }
}

/** Stable key: '-' for null; e.g. 'b40', 'v5h55', 'b40v5h55', 'v5n' (a neutral ramp ignores the hue). */
export function studyKey(study: TileStudy | null): string {
  if (study === null) return '-'
  const blur = study.blurPct === null ? '' : `b${String(study.blurPct)}`
  const v = study.values
  const values = v === null ? '' : `v${String(v.count)}${v.neutral ? 'n' : `h${String(v.hue)}`}`
  return blur + values
}

/** PNG for flat value studies (spec §2.5), JPEG for photographic tiles. */
export function tileFormat(version: StudyVersion): 'jpeg' | 'png' {
  return version === 'values' || version === 'blurValues' ? 'png' : 'jpeg'
}
