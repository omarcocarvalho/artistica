import type { ImageId } from '../../../shared/model/image'
import type { SizeMm } from '../../../shared/model/paper'
import type { StudyVersion } from '../../../shared/model/study'
import { MM_PER_INCH, TARGET_DPI } from '../../../shared/model/units'
import type { RectMm } from '../../layout/types'
import { MAX_CANVAS_AREA_PX, tileSourceDpi } from '../pixels/tile-plan'
import type { PageModel } from '../types'

export interface PreviewScale {
  /** CSS size of the sheet. */
  readonly cssW: number
  readonly cssH: number
  /** Canvas backing-store size (CSS × devicePixelRatio, clamped to the canvas area cap). */
  readonly deviceW: number
  readonly deviceH: number
  /** Device pixels per millimetre. */
  readonly pxPerMm: number
}

/** Backing store of the sheet canvas never exceeds MAX_CANVAS_AREA_PX (phones fail above that). */
export function previewScale(size: SizeMm, cssWidth: number, dpr: number): PreviewScale {
  const cssW = Math.max(1, cssWidth)
  const cssH = (cssW * size.h) / size.w
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const area = cssW * ratio * (cssH * ratio)
  const clamped = area > MAX_CANVAS_AREA_PX
  const r = clamped ? ratio * Math.sqrt(MAX_CANVAS_AREA_PX / area) : ratio
  // floor when clamped, so rounding can never push the area past the cap
  const snap = clamped ? Math.floor : Math.round
  const deviceW = Math.max(1, snap(cssW * r))
  const deviceH = Math.max(1, snap(cssH * r))
  return { cssW, cssH, deviceW, deviceH, pxPerMm: deviceW / size.w }
}

/** Resolution to render preview tiles at: the screen's, never more than the print's. */
export function previewDpi(scale: PreviewScale): number {
  return Math.min(TARGET_DPI, scale.pxPerMm * MM_PER_INCH)
}

/** One clickable/focusable tile on the sheet, positioned in % of the sheet (resolution-independent). */
export interface TileHitArea {
  readonly key: string
  readonly imageId: ImageId
  readonly leftPct: number
  readonly topPct: number
  readonly widthPct: number
  readonly heightPct: number
  readonly lowDpi: boolean
  readonly scaledToFit: boolean
  /** Source DPI at the printed size (shown on the low-DPI chip). */
  readonly dpi: number
  readonly version: StudyVersion
  /** Tiles in this tile's study group (1 when it is in none). */
  readonly groupSize: number
  /** First tile of its group in reading order; warning chips show here only (M2-R13). */
  readonly firstInGroup: boolean
}

const EPS_MM = 1e-6

const inside = (r: RectMm, box: RectMm): boolean =>
  r.x >= box.x - EPS_MM &&
  r.y >= box.y - EPS_MM &&
  r.x + r.w <= box.x + box.w + EPS_MM &&
  r.y + r.h <= box.y + box.h + EPS_MM

function groupInfo(page: PageModel): { size: number; first: boolean }[] {
  const info = page.tiles.map(() => ({ size: 1, first: true }))
  for (const g of page.groups) {
    const members = page.tiles.flatMap((t, i) =>
      t.imageId === g.imageId && inside(t.trim, g.block) ? [i] : [],
    )
    members.forEach((m, k) => {
      info[m] = { size: members.length, first: k === 0 }
    })
  }
  return info
}

/** Hit areas cover each tile's trim box, in tile order (= reading order of the layout). */
export function tileHitAreas(page: PageModel): TileHitArea[] {
  const { w, h } = page.size
  const groups = groupInfo(page)
  return page.tiles.map((t, i) => ({
    key: `${String(page.index)}:${String(i)}`,
    imageId: t.imageId,
    leftPct: (t.trim.x / w) * 100,
    topPct: (t.trim.y / h) * 100,
    widthPct: (t.trim.w / w) * 100,
    heightPct: (t.trim.h / h) * 100,
    lowDpi: t.lowDpi,
    scaledToFit: t.scaledToFit,
    dpi: tileSourceDpi(t),
    version: t.version,
    groupSize: groups[i]?.size ?? 1,
    firstInGroup: groups[i]?.first ?? true,
  }))
}
