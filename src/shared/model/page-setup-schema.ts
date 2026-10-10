import { z } from 'zod'
import { CUSTOM_PAPER_LIMITS, PAPER_IDS, type PaperId } from './paper'
import {
  DEFAULT_PAGE_SETUP,
  normalizePageSetup,
  type Orientation,
  type PageSetup,
} from './page-setup'

const D = DEFAULT_PAGE_SETUP
const { minMm, maxMm } = CUSTOM_PAPER_LIMITS

/** `+ 0` turns -0 into 0, which JSON would write as 0 anyway. */
const lengthMm = (max: number) =>
  z
    .number()
    .min(0)
    .max(max)
    .transform((mm) => mm + 0)
const paperIds = PAPER_IDS as [PaperId, ...PaperId[]]
const orientations: [Orientation, ...Orientation[]] = ['auto', 'portrait', 'landscape']

/**
 * The page setup as saved settings and presets store it. Every field falls back to its default on
 * its own (`.catch`), so one bad field never throws away the others, and `parse` never throws on an
 * object. Unknown keys are stripped.
 */
export const pageSetupSchema = z.object({
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

/** Any input to a valid page setup: parsed, the custom size portrait-normalised (w ≤ h), then `normalizePageSetup`. Never throws. */
export function parsePageSetup(raw: unknown): PageSetup {
  const parsed = pageSetupSchema.catch(D).parse(raw)
  const { w, h } = parsed.customSize
  const customSize = w <= h ? { w, h } : { w: h, h: w }
  return normalizePageSetup({ ...parsed, customSize }).setup
}
