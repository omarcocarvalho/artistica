import i18next, { type TFunction } from 'i18next'
import { mmToUnit, roundForUnit, type Mm, type Unit } from '../model/units'
import { DEFAULT_LANGUAGE } from './languages'

export interface NumberOptions {
  readonly maxFractionDigits?: number
  readonly minFractionDigits?: number
  readonly grouping?: boolean
}

const INTL_UNITS: Readonly<Record<Unit, string>> = { mm: 'millimeter', in: 'inch' }
const FRACTION_DIGITS: Readonly<Record<Unit, number>> = { mm: 1, in: 2 }
const BYTES_PER_MEGABYTE = 1_000_000

const cache = new Map<string, Intl.NumberFormat>()

function current(lng: string | undefined): string {
  return lng ?? (i18next.language || DEFAULT_LANGUAGE)
}

function formatter(lng: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lng}|${JSON.stringify(options)}`
  let nf = cache.get(key)
  if (!nf) {
    nf = new Intl.NumberFormat(lng, options)
    cache.set(key, nf)
  }
  return nf
}

function lengthFormatter(unit: Unit, lng: string): Intl.NumberFormat {
  return formatter(lng, {
    style: 'unit',
    unit: INTL_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: FRACTION_DIGITS[unit],
  })
}

const displayed = (mm: Mm, unit: Unit): number => roundForUnit(mmToUnit(mm, unit), unit)

export function formatNumber(value: number, opts: NumberOptions = {}, lng?: string): string {
  return formatter(current(lng), {
    useGrouping: opts.grouping ?? true,
    ...(opts.minFractionDigits === undefined
      ? {}
      : { minimumFractionDigits: opts.minFractionDigits }),
    ...(opts.maxFractionDigits === undefined
      ? {}
      : { maximumFractionDigits: opts.maxFractionDigits }),
  }).format(value)
}

export function formatLength(mm: Mm, unit: Unit, lng?: string): string {
  return lengthFormatter(unit, current(lng)).format(displayed(mm, unit))
}

/** The number of a length with display rounding and grouping but no unit, for a pair that shares one `unitLabel`. */
export function formatLengthNumber(mm: Mm, unit: Unit, lng?: string): string {
  return formatNumber(displayed(mm, unit), { maxFractionDigits: FRACTION_DIGITS[unit] }, lng)
}

/** The number of a length for an editable field: no unit and no grouping, so `parseDecimal` reads it back. */
export function formatLengthValue(mm: Mm, unit: Unit, lng?: string): string {
  return formatNumber(
    displayed(mm, unit),
    { maxFractionDigits: FRACTION_DIGITS[unit], grouping: false },
    lng,
  )
}

export function unitLabel(unit: Unit, lng?: string): string {
  const parts = lengthFormatter(unit, current(lng)).formatToParts(2)
  return parts.find((p) => p.type === 'unit')?.value ?? unit
}

/** `pct` runs 0–100. */
export function formatPercent(pct: number, lng?: string): string {
  return formatter(current(lng), { style: 'percent', maximumFractionDigits: 0 }).format(pct / 100)
}

/** Decimal megabytes (10⁶ bytes). */
export function formatMegabytes(bytes: number, lng?: string): string {
  return formatter(current(lng), {
    style: 'unit',
    unit: 'megabyte',
    unitDisplay: 'short',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / BYTES_PER_MEGABYTE)
}

export function formatMegabytesNumber(bytes: number, lng?: string): string {
  return formatNumber(
    bytes / BYTES_PER_MEGABYTE,
    { minFractionDigits: 1, maxFractionDigits: 1 },
    lng,
  )
}

/** The narrow symbol: the short one is `45 deg` in English. */
export function formatDegrees(deg: number, lng?: string): string {
  return formatter(current(lng), {
    style: 'unit',
    unit: 'degree',
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
  }).format(deg)
}

export function joinSentences(t: TFunction, a: string, b: string): string {
  return t('common:joinSentences', { a, b })
}
