import type { Mm } from './units'

export type PaperId = 'A3' | 'A4' | 'A5' | 'A6' | 'Letter' | 'Legal' | 'Tabloid' | 'Custom'

export interface SizeMm {
  readonly w: Mm
  readonly h: Mm
}

/** Portrait sizes. */
export const PAPER_SIZES: Readonly<Record<Exclude<PaperId, 'Custom'>, SizeMm>> = {
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
  Tabloid: { w: 279.4, h: 431.8 },
}

/** Order shown in the UI. */
export const PAPER_IDS: readonly PaperId[] = [
  'A4',
  'Letter',
  'A3',
  'A5',
  'A6',
  'Legal',
  'Tabloid',
  'Custom',
]

export const CUSTOM_PAPER_LIMITS = { minMm: 50, maxMm: 1200 } as const
