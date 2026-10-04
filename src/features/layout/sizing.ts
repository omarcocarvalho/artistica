import { MIN_COMFORT_SHORT_SIDE_MM } from '../../shared/model/page-setup'
import type { SizeMm } from '../../shared/model/paper'
import type { Mm } from '../../shared/model/units'
import { maxFitTileWidth } from './geometry'
import { EPS_MM } from './tolerances'
import type { LayoutItemInput } from './types'

/** The tile widths an item may take. lo === hi for fixed items. */
export interface SizeRange {
  readonly lo: Mm
  readonly hi: Mm
  /** Largest tile width whose block fits the content box (turning allowed). ≤ 0 → unplaceable. */
  readonly fitW: Mm
  readonly scaledToFit: boolean
}

function fixedWidth(item: LayoutItemInput): Mm | null {
  const size = item.size
  if (size.kind !== 'fixed' || !Number.isFinite(size.mm) || size.mm <= 0) return null
  return size.axis === 'width' ? size.mm : size.mm * item.aspect
}

export function sizeRange(item: LayoutItemInput, gutter: Mm, content: SizeMm): SizeRange {
  const fitW = maxFitTileWidth(item.aspect, item.tiles, gutter, content)
  const fixed = fixedWidth(item)
  if (fixed !== null) {
    const scaledToFit = fixed > fitW + EPS_MM
    const w = scaledToFit ? fitW : fixed
    return { lo: w, hi: w, fitW, scaledToFit }
  }
  const comfortW = MIN_COMFORT_SHORT_SIDE_MM * Math.max(1, item.aspect)
  const lo = Math.min(comfortW, fitW)
  // Low-DPI images (cap < lo) stay at lo: the comfort minimum wins, and the placement is flagged.
  const hi = Math.max(lo, Math.min(item.maxPrintWidthMm, fitW))
  return { lo, hi, fitW, scaledToFit: false }
}

/** Tile width for the common target short side `s`: every auto item grows to short side `s`, clamped to its range. */
export function widthAtTarget(range: SizeRange, aspect: number, s: Mm): Mm {
  return Math.min(range.hi, Math.max(range.lo, s * Math.max(1, aspect)))
}
