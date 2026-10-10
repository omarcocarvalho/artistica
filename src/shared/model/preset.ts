import { z } from 'zod'
import { sanitizeLines, type LineSettings } from './lines'
import type { PageSetup } from './page-setup'
import { parsePageSetup } from './page-setup-schema'
import { DEFAULT_STUDY, sanitizeStudy, type StudySettings } from './study'

/** A whitelist of settings (M5-R2): nothing in it is derived from a photo. */
export interface Preset {
  readonly name: string
  readonly pageSetup: PageSetup
  readonly study: StudySettings
  /** Guides (edges, face, pose) are always off, so applying a preset never starts a download. */
  readonly lines: LineSettings
}

export interface PresetFile {
  readonly format: typeof PRESET_FILE_FORMAT
  readonly version: number
  readonly presets: readonly Preset[]
}

export const PRESET_FILE_FORMAT = 'artistica-presets'
export const PRESET_FILE_VERSION = 1
export const MAX_PRESETS = 20
export const MAX_PRESET_NAME = 40
export const MAX_PRESETS_PER_FILE = 50
export const MAX_PRESET_FILE_BYTES = 64 * 1024

/** Upgrades a file of version `n` to `n + 1` (M5-R4). */
export const PRESET_FILE_MIGRATIONS: Readonly<Record<number, (raw: unknown) => unknown>> = {}

export type PresetImportError = 'too-large' | 'not-json' | 'not-presets' | 'newer-version' | 'empty'
export type PresetImport =
  | {
      readonly ok: true
      readonly presets: readonly Preset[]
      readonly skipped: number
      readonly adjusted: number
    }
  | { readonly ok: false; readonly error: PresetImportError; readonly version?: number }

const codePoints = (s: string): string[] => Array.from(s)
const collapse = (raw: string): string => raw.trim().replace(/\s+/g, ' ')

export function presetName(raw: string): string | null {
  const name = collapse(raw)
  const length = codePoints(name).length
  return length === 0 || length > MAX_PRESET_NAME ? null : name
}

export function sameName(a: string, b: string): boolean {
  return collapse(a).toLowerCase() === collapse(b).toLowerCase()
}

export function uniqueName(name: string, taken: readonly string[]): string {
  const clash = (candidate: string): boolean => taken.some((t) => sameName(t, candidate))
  if (!clash(name)) return name
  for (let n = 2; ; n++) {
    const suffix = ` (${String(n)})`
    const base = codePoints(name)
      .slice(0, MAX_PRESET_NAME - suffix.length)
      .join('')
      .trimEnd()
    const candidate = `${base}${suffix}`
    if (!clash(candidate)) return candidate
  }
}

/** Types only: ranges belong to `sanitizeStudy`. */
const studySchema = z.object({
  versions: z.array(z.unknown()).catch([]),
  blurPct: z.number().catch(DEFAULT_STUDY.blurPct),
  values: z
    .object({
      count: z.number().catch(DEFAULT_STUDY.values.count),
      hue: z.number().catch(DEFAULT_STUDY.values.hue),
      neutral: z.boolean().catch(DEFAULT_STUDY.values.neutral),
    })
    .catch(DEFAULT_STUDY.values),
})

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function toLines(raw: Readonly<Record<string, unknown>>): LineSettings {
  const lines = sanitizeLines(raw as unknown as LineSettings)
  return { ...lines, edges: { ...lines.edges, on: false }, face: false, pose: false }
}

function build(
  name: string,
  pageSetup: Readonly<Record<string, unknown>>,
  study: Readonly<Record<string, unknown>>,
  lines: Readonly<Record<string, unknown>>,
): Preset {
  return {
    name,
    pageSetup: parsePageSetup(pageSetup),
    study: sanitizeStudy(studySchema.parse(study) as StudySettings),
    lines: toLines(lines),
  }
}

/** Reads only the whitelisted fields of `s`; a name `presetName` refuses is kept for the caller to report. */
export function presetFromSettings(
  name: string,
  s: { pageSetup: PageSetup; study: StudySettings; lines: LineSettings },
): Preset {
  const record = (v: unknown) => (isRecord(v) ? v : {})
  return build(presetName(name) ?? name, record(s.pageSetup), record(s.study), record(s.lines))
}

export function sanitizePreset(raw: unknown): Preset | null {
  if (!isRecord(raw) || typeof raw.name !== 'string') return null
  const name = presetName(raw.name)
  const { pageSetup, study, lines } = raw
  if (name === null || !isRecord(pageSetup) || !isRecord(study) || !isRecord(lines)) return null
  return build(name, pageSetup, study, lines)
}

export function buildPresetFile(presets: readonly Preset[]): string {
  const file: PresetFile = {
    format: PRESET_FILE_FORMAT,
    version: PRESET_FILE_VERSION,
    presets: presets.map(sanitizePreset).filter((p): p is Preset => p !== null),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

/** True when every value of `clean` is present, equal, in `raw`; keys `clean` lacks are ignored. */
function sameValues(clean: unknown, raw: unknown): boolean {
  if (Array.isArray(clean)) {
    return (
      Array.isArray(raw) &&
      raw.length === clean.length &&
      clean.every((v, i) => sameValues(v, raw[i]))
    )
  }
  if (isRecord(clean)) {
    return isRecord(raw) && Object.keys(clean).every((k) => sameValues(clean[k], raw[k]))
  }
  return Object.is(clean, raw)
}

export function parsePresetFile(text: string): PresetImport {
  if (text.length > MAX_PRESET_FILE_BYTES || utf8Length(text) > MAX_PRESET_FILE_BYTES) {
    return { ok: false, error: 'too-large' }
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not-json' }
  }
  if (!isRecord(data) || data.format !== PRESET_FILE_FORMAT) {
    return { ok: false, error: 'not-presets' }
  }
  const { version } = data
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { ok: false, error: 'not-presets' }
  }
  if (version > PRESET_FILE_VERSION) return { ok: false, error: 'newer-version', version }
  let upgraded: unknown = data
  for (let v = version; v < PRESET_FILE_VERSION; v++) {
    const migrate = PRESET_FILE_MIGRATIONS[v]
    if (migrate === undefined) return { ok: false, error: 'not-presets' }
    upgraded = migrate(upgraded)
  }
  if (!isRecord(upgraded) || !Array.isArray(upgraded.presets)) {
    return { ok: false, error: 'not-presets' }
  }
  const list: readonly unknown[] = upgraded.presets
  const presets: Preset[] = []
  let adjusted = 0
  for (const raw of list.slice(0, MAX_PRESETS_PER_FILE)) {
    const preset = sanitizePreset(raw)
    if (preset === null) continue
    presets.push(preset)
    if (!sameValues(preset, raw)) adjusted++
  }
  if (presets.length === 0) return { ok: false, error: 'empty' }
  return { ok: true, presets, skipped: list.length - presets.length, adjusted }
}
