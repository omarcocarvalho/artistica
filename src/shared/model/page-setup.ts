import type { PaperId, SizeMm } from './paper'
import { PAPER_SIZES } from './paper'
import type { Mm } from './units'

export type Orientation = 'auto' | 'portrait' | 'landscape'

export interface PageSetup {
  readonly paper: PaperId
  /** Used only when `paper === 'Custom'` (portrait-normalised: w ≤ h). */
  readonly customSize: SizeMm
  readonly orientation: Orientation
  /** ≥ MIN_SAFE_AREA_MM */
  readonly safeAreaMm: Mm
  readonly gutter: { readonly enabled: boolean; readonly mm: Mm }
  readonly cropMarks: boolean
  readonly bleed: { readonly enabled: boolean; readonly mm: Mm }
}

export const MIN_SAFE_AREA_MM = 3
/** Shortest trim-box side (mm) that still counts as a comfortable reference. Used by layout and images (CR-C2). */
export const MIN_COMFORT_SHORT_SIDE_MM = 60
export const CROP_MARK_LENGTH_MM = 4
/** Gap between the bleed edge and the start of a mark. */
export const CROP_MARK_OFFSET_MM = 1

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: 'A4',
  customSize: { w: 210, h: 297 },
  orientation: 'auto',
  safeAreaMm: 5,
  gutter: { enabled: true, mm: 6 },
  cropMarks: true,
  bleed: { enabled: false, mm: 3 },
}

export type PageSetupNote =
  'gutter-enabled-for-bleed' | 'gutter-raised-for-bleed' | 'safe-area-raised-to-minimum'

/**
 * Enforce invariants: safeArea ≥ 3; if bleed is enabled, the gutter is enabled and
 * gutter.mm ≥ 2 × bleed.mm (raise the gutter, never lower the bleed). Idempotent.
 */
export function normalizePageSetup(setup: PageSetup): { setup: PageSetup; notes: PageSetupNote[] } {
  const notes: PageSetupNote[] = []

  let safeAreaMm = setup.safeAreaMm
  // `!(x >= min)` also catches NaN.
  if (!(safeAreaMm >= MIN_SAFE_AREA_MM)) {
    safeAreaMm = MIN_SAFE_AREA_MM
    notes.push('safe-area-raised-to-minimum')
  }

  let gutter = setup.gutter
  if (setup.bleed.enabled) {
    if (!gutter.enabled) {
      gutter = { enabled: true, mm: gutter.mm }
      notes.push('gutter-enabled-for-bleed')
    }
    const minGutter = 2 * setup.bleed.mm
    if (!(gutter.mm >= minGutter)) {
      gutter = { enabled: true, mm: minGutter }
      notes.push('gutter-raised-for-bleed')
    }
  }

  return { setup: { ...setup, safeAreaMm, gutter }, notes }
}

/** Portrait paper size for the setup (`customSize` for Custom). */
export function paperSizeMm(setup: PageSetup): SizeMm {
  return setup.paper === 'Custom' ? setup.customSize : PAPER_SIZES[setup.paper]
}

/** Space reserved outside every trim box for bleed + crop marks (D2: inside the safe area). */
export function outerReserveMm(setup: PageSetup): Mm {
  return (
    (setup.bleed.enabled ? setup.bleed.mm : 0) +
    (setup.cropMarks ? CROP_MARK_OFFSET_MM + CROP_MARK_LENGTH_MM : 0)
  )
}

/** Gap between neighbouring trim boxes. */
export function gutterMm(setup: PageSetup): Mm {
  return setup.gutter.enabled ? setup.gutter.mm : 0
}

/**
 * Area available to trim boxes on an oriented page: the page inset by
 * `safeAreaMm + outerReserveMm`. Width and height never go below 0.
 */
export function contentBoxMm(setup: PageSetup, oriented: SizeMm): { x: Mm; y: Mm; w: Mm; h: Mm } {
  const inset = setup.safeAreaMm + outerReserveMm(setup)
  return {
    x: inset,
    y: inset,
    w: Math.max(0, oriented.w - 2 * inset),
    h: Math.max(0, oriented.h - 2 * inset),
  }
}
