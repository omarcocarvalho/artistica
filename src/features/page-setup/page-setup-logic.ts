import type { PageSetupNote } from '../../shared/model/page-setup'
import { CUSTOM_PAPER_LIMITS, type SizeMm } from '../../shared/model/paper'
import { MM_PER_INCH, type Mm, type Unit } from '../../shared/model/units'

/** Field limits the contract does not define (UI-only, generous). */
export const SAFE_AREA_MAX_MM = 30
export const GUTTER_MAX_MM = 30
export const BLEED_MIN_MM = 0.5
export const BLEED_MAX_MM = 10

/** Arrow-key step per unit. Inches step by 0.01 in (0.254 mm): A's NumberField only emits when the displayed value changes, and inches display 2 decimals. */
export function stepMmFor(unit: Unit): Mm {
  return unit === 'mm' ? 0.5 : MM_PER_INCH * 0.01
}

/** Clamp into [min, max]; non-finite input becomes `min` so the store never sees NaN. */
export function clampMm(value: number, min: Mm, max: Mm): Mm {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Clamp both sides to the custom limits and keep width <= height (the stored form). */
export function normalizeCustomSize(size: SizeMm): SizeMm {
  const { minMm, maxMm } = CUSTOM_PAPER_LIMITS
  const w = clampMm(size.w, minMm, maxMm)
  const h = clampMm(size.h, minMm, maxMm)
  return w <= h ? { w, h } : { w: h, h: w }
}

export const NOTE_KEYS: Readonly<Record<PageSetupNote, string>> = {
  'gutter-enabled-for-bleed': 'notes.gutterEnabledForBleed',
  'gutter-raised-for-bleed': 'notes.gutterRaisedForBleed',
  'safe-area-raised-to-minimum': 'notes.safeAreaRaisedToMinimum',
}
