import { MM_PER_INCH, TARGET_DPI } from '../../../shared/model/units'
import type { Rotation } from '../../../shared/model/image'
import type { DrawTile } from '../types'

/** JPEG quality for photos in the PDF (spec §2.5). */
export const JPEG_QUALITY = 0.92
/** Largest canvas we ever allocate: iOS Safari refuses canvases above 4096² = 16,777,216 px. */
export const MAX_CANVAS_AREA_PX = 16_777_216

export interface PxRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}
/** Canvas `setTransform(a, b, c, d, e, f)` order. */
export type Matrix2D = readonly [number, number, number, number, number, number]

export interface TilePixelPlan {
  /** Crop rect (fractional px) in the source bitmap (EXIF-corrected, before rotation/flip). */
  readonly src: PxRect
  /** Resampled size, still in source orientation (before rotation/flip). */
  readonly scaledW: number
  readonly scaledH: number
  /** Printed image size in px (after rotation), without bleed. */
  readonly outW: number
  readonly outH: number
  readonly bleedPx: number
  /** Final canvas: outW + 2·bleedPx by outH + 2·bleedPx. */
  readonly canvasW: number
  readonly canvasH: number
  /** Maps the scaled image (0..scaledW, 0..scaledH) onto the canvas, rotated and flipped, offset by bleed. */
  readonly matrix: Matrix2D
  /** Effective resolution of the output (≤ the requested dpi). */
  readonly dpi: number
}

export interface PlanOptions {
  /** Requested resolution; the export uses TARGET_DPI, the preview its screen resolution. */
  readonly dpi?: number
  readonly maxAreaPx?: number
}

const isQuarter = (r: Rotation): boolean => r === 90 || r === 270

/**
 * Source rect in fractional source pixels (crops are fractional; drawImage accepts fractional
 * source rects, so nothing is rounded away). At least 1 px wide/tall.
 */
export function sourceRect(tile: DrawTile): PxRect {
  return {
    x: tile.crop.x,
    y: tile.crop.y,
    w: Math.max(1, tile.crop.w),
    h: Math.max(1, tile.crop.h),
  }
}

type Coeffs = readonly [number, number, number, number, number, number]
const ROTATION_COEFFS: Readonly<Record<Rotation, Coeffs>> = {
  0: [1, 0, 0, 0, 1, 0],
  90: [0, -1, 1, 1, 0, 0],
  180: [-1, 0, 1, 0, -1, 1],
  270: [0, 1, 0, -1, 0, 1],
}

/**
 * Affine map from the scaled, unrotated image to the canvas.
 * Normalised coords (u, v) ∈ [0,1]²: rotation clockwise, then flips, then scale to out size + bleed offset.
 *   0°: (u, v)   90°: (1−v, u)   180°: (1−u, 1−v)   270°: (v, 1−u)
 */
export function orientMatrix(
  rotation: Rotation,
  flipH: boolean,
  flipV: boolean,
  scaledW: number,
  scaledH: number,
  outW: number,
  outH: number,
  offset: number,
): Matrix2D {
  // X = ax·u + bx·v + cx ; Y = ay·u + by·v + cy
  let [ax, bx, cx, ay, by, cy] = ROTATION_COEFFS[rotation]
  if (flipH) [ax, bx, cx] = [-ax, -bx, 1 - cx]
  if (flipV) [ay, by, cy] = [-ay, -by, 1 - cy]
  return [
    (ax * outW) / scaledW,
    (ay * outH) / scaledW,
    (bx * outW) / scaledH,
    (by * outH) / scaledH,
    offset + cx * outW,
    offset + cy * outH,
  ]
}

export function applyMatrix(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

/**
 * Pixel plan for one tile: target = dpi × printed mm, never upscaled past the source pixels,
 * and the whole canvas (with bleed) capped at maxAreaPx.
 */
export function planTilePixels(tile: DrawTile, options: PlanOptions = {}): TilePixelPlan {
  const dpi = options.dpi ?? TARGET_DPI
  const maxArea = options.maxAreaPx ?? MAX_CANVAS_AREA_PX
  const src = sourceRect(tile)
  const quarter = isQuarter(tile.rotation)
  const rotW = quarter ? src.h : src.w
  const rotH = quarter ? src.w : src.h
  const pxPerMm = dpi / MM_PER_INCH
  const wantW = tile.trim.w * pxPerMm
  const wantH = tile.trim.h * pxPerMm
  const fullW = (tile.trim.w + 2 * tile.bleedMm) * pxPerMm
  const fullH = (tile.trim.h + 2 * tile.bleedMm) * pxPerMm
  const k = Math.min(1, rotW / wantW, rotH / wantH, Math.sqrt(maxArea / (fullW * fullH)))
  const outW = Math.max(1, Math.round(wantW * k))
  const outH = Math.max(1, Math.round(wantH * k))
  const bleedPx =
    tile.bleedMm > 0 ? Math.max(1, Math.round((tile.bleedMm * outW) / tile.trim.w)) : 0
  const scaledW = quarter ? outH : outW
  const scaledH = quarter ? outW : outH
  return {
    src,
    scaledW,
    scaledH,
    outW,
    outH,
    bleedPx,
    canvasW: outW + 2 * bleedPx,
    canvasH: outH + 2 * bleedPx,
    matrix: orientMatrix(
      tile.rotation,
      tile.flipH,
      tile.flipV,
      scaledW,
      scaledH,
      outW,
      outH,
      bleedPx,
    ),
    dpi: (outW / tile.trim.w) * MM_PER_INCH,
  }
}

/** The same plan for a source that was already cropped to `src` (what the export worker receives). */
export function forCroppedSource(plan: TilePixelPlan): TilePixelPlan {
  return { ...plan, src: { x: 0, y: 0, w: plan.src.w, h: plan.src.h } }
}

/**
 * Intermediate sizes for a high-quality downscale: halve until within 2× of the target.
 * Browsers that ignore imageSmoothingQuality ('high') still avoid aliasing this way.
 * Excludes the final size. Empty when no step is needed (including upscales).
 */
export function downscaleSteps(
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): { w: number; h: number }[] {
  const steps: { w: number; h: number }[] = []
  let w = fromW
  let h = fromH
  while (w > 2 * toW || h > 2 * toH) {
    w = Math.max(toW, Math.ceil(w / 2))
    h = Math.max(toH, Math.ceil(h / 2))
    steps.push({ w, h })
  }
  return steps
}

/**
 * Identity of a tile's encoded pixels: equal keys ⇒ byte-identical images, so copies at the same
 * size share one embedded image in the PDF.
 */
export function tileRenderKey(tile: DrawTile, plan: TilePixelPlan = planTilePixels(tile)): string {
  const { x, y, w, h } = plan.src
  return [
    tile.imageId,
    `${String(x)},${String(y)},${String(w)},${String(h)}`,
    `${String(plan.outW)}x${String(plan.outH)}`,
    `r${String(tile.rotation)}`,
    tile.flipH ? 'h' : '-',
    tile.flipV ? 'v' : '-',
    `b${String(plan.bleedPx)}`,
  ].join('|')
}

/** Effective DPI of the source pixels over the printed size (for the low-DPI chip; ignores the 300 cap). */
export function tileSourceDpi(tile: DrawTile): number {
  const src = sourceRect(tile)
  const printedPxW = isQuarter(tile.rotation) ? src.h : src.w
  return Math.round((printedPxW / tile.trim.w) * MM_PER_INCH)
}
