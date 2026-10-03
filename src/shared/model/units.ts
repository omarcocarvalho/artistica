/** Millimetres. Every length in the model is `Mm` unless a name says otherwise. */
export type Mm = number
export type Unit = 'mm' | 'in'

export const MM_PER_INCH = 25.4
export const PT_PER_MM = 72 / 25.4
export const TARGET_DPI = 300

export function mmToUnit(mm: Mm, unit: Unit): number {
  return unit === 'mm' ? mm : mm / MM_PER_INCH
}

export function unitToMm(value: number, unit: Unit): Mm {
  return unit === 'mm' ? value : value * MM_PER_INCH
}

/** Largest print length (mm) for `px` pixels at `dpi`. */
export function maxPrintMm(px: number, dpi: number = TARGET_DPI): Mm {
  return (px / dpi) * MM_PER_INCH
}

/** Effective DPI when `px` pixels are printed across `mm`. A zero-length print has infinite DPI. */
export function effectiveDpi(px: number, mm: Mm): number {
  if (mm <= 0) return Number.POSITIVE_INFINITY
  return px / (mm / MM_PER_INCH)
}

/**
 * First-run unit for a browser locale (owner Q8, default): inches for `en-US` and `en-CA`,
 * millimetres everywhere else. Only used when no settings are saved.
 */
export function defaultUnitForLocale(locale: string): Unit {
  const normalized = locale.replace('_', '-').toLowerCase()
  return normalized === 'en-us' || normalized === 'en-ca' ? 'in' : 'mm'
}

/** Round for display: mm → 1 decimal, in → 2 decimals. */
export function roundForUnit(value: number, unit: Unit): number {
  const factor = unit === 'mm' ? 10 : 100
  return Math.round(value * factor) / factor
}
