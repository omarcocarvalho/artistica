import fc from 'fast-check'
import {
  DEFAULT_EDITS,
  type ImageDescriptor,
  type ImageEdits,
  type ImageId,
} from '../../../shared/model/image'
import {
  CROP_MARK_LENGTH_MM,
  CROP_MARK_OFFSET_MM,
  DEFAULT_PAGE_SETUP,
  type PageSetup,
} from '../../../shared/model/page-setup'
import { DEFAULT_STUDY, type StudySettings } from '../../../shared/model/study'
import type { LayoutResult, Placement, RectMm } from '../../layout/types'
import type { DrawTile, PageModel } from '../types'

/** Test-only helpers: hand-built LayoutResult fixtures (sub-plan D never imports B's engine). */

export const id = (s: string): ImageId => s as ImageId

export function descriptor(
  name: string,
  pxW = 3000,
  pxH = 2000,
  edits: Partial<ImageEdits> = {},
  study: StudySettings = DEFAULT_STUDY,
): ImageDescriptor {
  return {
    id: id(name),
    contentHash: `hash-${name}`,
    pxW,
    pxH,
    edits: { ...DEFAULT_EDITS, ...edits },
    study,
  }
}

export function placement(
  name: string,
  tiles: readonly RectMm[],
  extra: Partial<Placement> = {},
): Placement {
  const first = tiles[0] ?? { x: 0, y: 0, w: 0, h: 0 }
  return {
    key: `${name}#0`,
    imageId: id(name),
    block: first,
    tiles,
    turned: false,
    warnings: [],
    ...extra,
  }
}

export function layoutOf(
  pages: readonly (readonly Placement[])[],
  pageSize = { w: 210, h: 297 },
): LayoutResult {
  return {
    orientation: pageSize.w > pageSize.h ? 'landscape' : 'portrait',
    pageSize,
    pages: pages.map((placements) => ({ placements })),
    suggestedPerPage: 4,
  }
}

export function setupWith(patch: Partial<PageSetup> = {}): PageSetup {
  return { ...DEFAULT_PAGE_SETUP, ...patch }
}

export function drawTile(patch: Partial<DrawTile> = {}): DrawTile {
  return {
    imageId: id('a'),
    trim: { x: 20, y: 20, w: 100, h: 50 },
    bleedMm: 0,
    crop: { x: 0, y: 0, w: 3000, h: 1500 },
    rotation: 0,
    flipH: false,
    flipV: false,
    lowDpi: false,
    scaledToFit: false,
    ...patch,
  }
}

export function pageModel(tiles: readonly DrawTile[], patch: Partial<PageModel> = {}): PageModel {
  return {
    index: 0,
    size: { w: 210, h: 297 },
    safeArea: { x: 5, y: 5, w: 200, h: 287 },
    tiles,
    cropMarks: [],
    ...patch,
  }
}

/** A page of tiles laid out the way the layout contract guarantees (inside the content box, gaps ≥ gutter). */
export interface GridPage {
  readonly safeArea: RectMm
  readonly bleedMm: number
  readonly gutterMm: number
  readonly tiles: readonly { readonly trim: RectMm; readonly bleedMm: number }[]
}

/**
 * Random grid pages: cells separated by the gutter, each cell holding a tile shrunk towards a random
 * corner (so gaps vary and are always ≥ gutter), some cells empty. Gutter may be 0 when bleed is off.
 */
export const arbGridPage: fc.Arbitrary<GridPage> = fc
  .record({
    safe: fc.double({ min: 3, max: 15, noNaN: true }),
    bleedOn: fc.boolean(),
    bleed: fc.double({ min: 0.5, max: 5, noNaN: true }),
    gutterExtra: fc.double({ min: 0, max: 12, noNaN: true }),
    gutterOn: fc.boolean(),
    marks: fc.constant(true),
    cols: fc.integer({ min: 1, max: 4 }),
    rows: fc.integer({ min: 1, max: 4 }),
    cellW: fc.double({ min: 8, max: 90, noNaN: true }),
    cellH: fc.double({ min: 8, max: 90, noNaN: true }),
    cells: fc.array(
      fc.record({
        present: fc.boolean(),
        fw: fc.double({ min: 0.3, max: 1, noNaN: true }),
        fh: fc.double({ min: 0.3, max: 1, noNaN: true }),
        right: fc.boolean(),
        bottom: fc.boolean(),
      }),
      { minLength: 16, maxLength: 16 },
    ),
  })
  .map((r) => {
    const bleedMm = r.bleedOn ? r.bleed : 0
    // Contract: bleed ⇒ gutter on and gutter ≥ 2 × bleed.
    const gutterMm = r.bleedOn ? 2 * bleedMm + r.gutterExtra : r.gutterOn ? r.gutterExtra : 0
    const reserve = bleedMm + CROP_MARK_OFFSET_MM + CROP_MARK_LENGTH_MM
    const inset = r.safe + reserve
    const safeArea = {
      x: r.safe,
      y: r.safe,
      w: 2 * reserve + r.cols * r.cellW + (r.cols - 1) * gutterMm,
      h: 2 * reserve + r.rows * r.cellH + (r.rows - 1) * gutterMm,
    }
    const tiles: { trim: RectMm; bleedMm: number }[] = []
    for (let row = 0; row < r.rows; row++) {
      for (let col = 0; col < r.cols; col++) {
        const c = r.cells[row * 4 + col]
        if (!c?.present) continue
        const w = r.cellW * c.fw
        const h = r.cellH * c.fh
        const cx = inset + col * (r.cellW + gutterMm)
        const cy = inset + row * (r.cellH + gutterMm)
        tiles.push({
          trim: { x: c.right ? cx + r.cellW - w : cx, y: c.bottom ? cy + r.cellH - h : cy, w, h },
          bleedMm,
        })
      }
    }
    return { safeArea, bleedMm, gutterMm, tiles }
  })

/**
 * A grid page whose safe area is then shrunk inwards by a random 0..reserve on each side, so marks
 * genuinely need clipping or dropping (arbGridPage alone always leaves room for every mark).
 */
export const arbShrunkPage: fc.Arbitrary<GridPage> = fc
  .tuple(
    arbGridPage,
    fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 4, maxLength: 4 }),
  )
  .map(([page, f]) => {
    const reserve = page.bleedMm + CROP_MARK_OFFSET_MM + CROP_MARK_LENGTH_MM
    const [l = 0, t = 0, r = 0, b = 0] = f.map((v) => v * reserve)
    const s = page.safeArea
    return {
      ...page,
      safeArea: {
        x: s.x + l,
        y: s.y + t,
        w: Math.max(0, s.w - l - r),
        h: Math.max(0, s.h - t - b),
      },
    }
  })
