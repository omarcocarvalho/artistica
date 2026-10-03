import { TARGET_DPI, effectiveDpi, maxPrintMm, type Mm } from '../../shared/model/units'
import type { SizeMode } from '../../shared/model/image'
import { MIN_COMFORT_SHORT_SIDE_MM } from '../../shared/model/page-setup'
import { MAX_FIXED_MM, MIN_FIXED_MM } from './edits'

// The comfort minimum is the shared constant owned by A (ruled: see overview CR-C2). No local copy.

export type FixedSize = Extract<SizeMode, { kind: 'fixed' }>
export interface PrintedPx {
  readonly pxW: number
  readonly pxH: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export function fixedSizeMm(printed: PrintedPx, size: FixedSize): { w: Mm; h: Mm } {
  return size.axis === 'width'
    ? { w: size.mm, h: (size.mm * printed.pxH) / printed.pxW }
    : { w: (size.mm * printed.pxW) / printed.pxH, h: size.mm }
}

export function withAxis(printed: PrintedPx, size: FixedSize, axis: 'width' | 'height'): FixedSize {
  const d = fixedSizeMm(printed, size)
  return { kind: 'fixed', axis, mm: round1(axis === 'width' ? d.w : d.h) }
}

export function defaultFixedSize(printed: PrintedPx): FixedSize {
  const sharp = maxPrintMm(printed.pxW)
  const mm = Math.min(MAX_FIXED_MM, Math.max(MIN_FIXED_MM, Math.min(100, Math.floor(sharp))))
  return { kind: 'fixed', axis: 'width', mm }
}

export interface DpiInfo {
  /** Auto: the worst case (smallest comfortable size), capped at 300. Fixed: the real value. */
  readonly dpi: number
  readonly low: boolean
  /** Largest size that is still 300 DPI. */
  readonly sharpUpToMm: { readonly w: Mm; readonly h: Mm }
}

export function dpiInfo(printed: PrintedPx, size: SizeMode): DpiInfo {
  const sharpUpToMm = { w: maxPrintMm(printed.pxW), h: maxPrintMm(printed.pxH) }
  const dpi =
    size.kind === 'fixed'
      ? effectiveDpi(printed.pxW, fixedSizeMm(printed, size).w)
      : Math.min(
          TARGET_DPI,
          effectiveDpi(Math.min(printed.pxW, printed.pxH), MIN_COMFORT_SHORT_SIDE_MM),
        )
  return { dpi, low: dpi < TARGET_DPI - 0.5, sharpUpToMm }
}
