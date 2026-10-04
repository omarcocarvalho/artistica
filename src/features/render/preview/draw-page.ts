import { PT_PER_MM } from '../../../shared/model/units'
import type { RectMm } from '../../layout/types'
import { CROP_MARK_WIDTH_PT } from '../page-model/crop-marks'
import { expandRect } from '../page-model/rect'
import type { PageModel } from '../types'
import type { PreviewScale } from './preview-geometry'

/** Screen-only guide colours come from the design tokens; the paper and marks are print colours. */
export interface PageDrawColors {
  readonly paper: string
  readonly safe: string
  readonly bleed: string
  readonly cut: string
  readonly mark: string
  readonly missing: string
}

/** Fallbacks mirror design/tokens.css (--color-paper, --color-guide-*, --color-crop-mark). */
export const DEFAULT_PAGE_DRAW_COLORS: PageDrawColors = {
  paper: '#ffffff',
  safe: '#2a7ab8',
  bleed: '#d63a78',
  cut: 'rgba(0, 0, 0, 0.35)',
  mark: '#000000',
  missing: '#e8e2d9',
}

export interface PageCtx {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality
  fillRect(x: number, y: number, w: number, h: number): void
  strokeRect(x: number, y: number, w: number, h: number): void
  setLineDash(segments: number[]): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
}

export interface DrawPageOptions {
  readonly showGuides: boolean
  readonly colors: PageDrawColors
  /** Rendered tile (renderTile output, bleed included) or null while its bitmap is missing. */
  readonly tileImage: (tileIndex: number) => CanvasImageSource | null
}

/**
 * Draw a PageModel exactly as the PDF composes it: tiles at trim+bleed, crop marks from page.cropMarks.
 * Guides (safe area, trim, bleed) are screen-only and drawn last.
 */
export function drawPage(
  ctx: PageCtx,
  page: PageModel,
  scale: PreviewScale,
  opts: DrawPageOptions,
): void {
  const k = scale.pxPerMm
  const px = (r: RectMm): [number, number, number, number] => [r.x * k, r.y * k, r.w * k, r.h * k]
  const hairline = Math.max(1, (CROP_MARK_WIDTH_PT / PT_PER_MM) * k)

  ctx.fillStyle = opts.colors.paper
  ctx.fillRect(0, 0, scale.deviceW, scale.deviceH)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  page.tiles.forEach((tile, i) => {
    const img = opts.tileImage(i)
    const box = px(expandRect(tile.trim, tile.bleedMm))
    if (img) {
      ctx.drawImage(img, ...box)
    } else {
      ctx.fillStyle = opts.colors.missing
      ctx.fillRect(...box)
    }
  })

  ctx.setLineDash([])
  ctx.strokeStyle = opts.colors.mark
  ctx.lineWidth = hairline
  ctx.beginPath()
  for (const s of page.cropMarks) {
    ctx.moveTo(s.x1 * k, s.y1 * k)
    ctx.lineTo(s.x2 * k, s.y2 * k)
  }
  ctx.stroke()

  if (!opts.showGuides) return
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = opts.colors.safe
  ctx.strokeRect(...px(page.safeArea))
  for (const tile of page.tiles) {
    if (tile.bleedMm > 0) {
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = opts.colors.bleed
      ctx.strokeRect(...px(expandRect(tile.trim, tile.bleedMm)))
    }
    ctx.setLineDash([1, 2])
    ctx.strokeStyle = opts.colors.cut
    ctx.strokeRect(...px(tile.trim))
  }
  ctx.setLineDash([])
}
