import fc from 'fast-check'
import {
  DEFAULT_EDITS,
  type ImageDescriptor,
  type ImageEdits,
  type ImageId,
} from '../../../shared/model/image'
import {
  DEFAULT_LINES,
  type LineSettings,
  type LinesPatch,
  MAX_GRID,
  MAX_LINE_OPACITY_PCT,
  MAX_LINE_WIDTH_MM,
  MIN_GRID,
  MIN_LINE_OPACITY_PCT,
  MIN_LINE_WIDTH_MM,
  patchLines,
  SPIRAL_CORNERS,
} from '../../../shared/model/lines'
import {
  CROP_MARK_LENGTH_MM,
  CROP_MARK_OFFSET_MM,
  DEFAULT_PAGE_SETUP,
  type PageSetup,
} from '../../../shared/model/page-setup'
import { DEFAULT_STUDY, type StudySettings, type StudyVersion } from '../../../shared/model/study'
import type { LayoutResult, Placement, RectMm } from '../../layout/types'
import { MAX_EDGE_VERTICES } from '../../lines/edges/outline'
import { mulberry32 } from '../../lines/edges/test-support/synthetic'
import faceJson from '../../lines/guides/__fixtures__/face-landmarks.json'
import poseJson from '../../lines/guides/__fixtures__/pose-landmarks.json'
import {
  NO_GUIDES,
  type EdgeOutline,
  type FaceLandmarks,
  type ImageGuides,
  type PoseLandmarks,
  type SourcePoint,
} from '../../lines/guides/types'
import { tileLinesFor } from '../page-model/tile-lines'
import type { DrawTile, PageModel, TileLines } from '../types'

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
    lines: DEFAULT_LINES,
  }
}

/** `base` with its lines patched from DEFAULT_LINES. */
export function linesDescriptor(
  name: string,
  patch: LinesPatch,
  base: ImageDescriptor = descriptor(name),
): ImageDescriptor {
  return { ...base, lines: patchLines(DEFAULT_LINES, patch) }
}

/** A tile's lines without guides (M3's call). */
export function compositionLinesFor(
  lines: LineSettings,
  trim: RectMm,
  turned: boolean,
  tileIndex: number,
): TileLines | null {
  return tileLinesFor({ ...descriptor('a'), lines }, NO_GUIDES, trim, turned, tileIndex)
}

/** Any sanitized line settings, every type and every style value in range. */
export const arbLineSettings: fc.Arbitrary<LineSettings> = fc
  .record({
    grid: fc.record({
      on: fc.boolean(),
      cols: fc.integer({ min: MIN_GRID, max: MAX_GRID }),
      rows: fc.integer({ min: MIN_GRID, max: MAX_GRID }),
    }),
    thirds: fc.boolean(),
    armature: fc.boolean(),
    golden: fc.boolean(),
    spiral: fc.record({ on: fc.boolean(), corner: fc.constantFrom(...SPIRAL_CORNERS) }),
    centre: fc.boolean(),
    style: fc.record({
      colour: fc
        .integer({ min: 0, max: 0xffffff })
        .map((n) => `#${n.toString(16).padStart(6, '0')}`),
      widthMm: fc.double({ min: MIN_LINE_WIDTH_MM, max: MAX_LINE_WIDTH_MM, noNaN: true }),
      opacityPct: fc.integer({ min: MIN_LINE_OPACITY_PCT, max: MAX_LINE_OPACITY_PCT }),
    }),
  })
  .map((raw) => patchLines(DEFAULT_LINES, raw))

/** A descriptor whose study selects `versions` (other study fields default). */
export function studyDescriptor(
  name: string,
  versions: readonly StudyVersion[],
  pxW = 3000,
  pxH = 2000,
): ImageDescriptor {
  return descriptor(name, pxW, pxH, {}, { ...DEFAULT_STUDY, versions })
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
    version: 'original',
    study: null,
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
    groups: [],
    lines: [],
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

const pointOf = (p: readonly number[]): SourcePoint => ({
  x: p[0] ?? Number.NaN,
  y: p[1] ?? Number.NaN,
})

/** The recorded face of portrait.jpg (C4 Step 3), normalised to the photo. */
export const FIXTURE_FACE: FaceLandmarks = { points: faceJson.points.map(pointOf) }
export const PORTRAIT_PX = { w: faceJson.pxW, h: faceJson.pxH } as const

/** The recorded pose of figure.jpg (C4 Step 3), normalised to the photo. */
export const FIXTURE_POSE: PoseLandmarks = {
  points: poseJson.points.map(pointOf),
  visibility: poseJson.visibility,
}
export const FIGURE_PX = { w: poseJson.pxW, h: poseJson.pxH } as const

/** `count` wavy polylines of `perLine` points across the photo, normalised (0..1). */
export function syntheticOutline(count: number, perLine: number): EdgeOutline {
  return {
    polylines: Array.from({ length: count }, (_, k) =>
      Array.from({ length: perLine }, (_, i) => {
        const t = perLine === 1 ? 0 : i / (perLine - 1)
        return {
          x: 0.05 + 0.9 * t,
          y: (k + 0.5) / count + (0.25 / count) * Math.sin(7 * t + k),
        }
      }),
    ),
  }
}

/** `count` random walks of `perLine` points (steps of a few analysis px), normalised (0..1). */
export function noisyOutline(count: number, perLine: number, seed = 7): EdgeOutline {
  const rand = mulberry32(seed)
  return {
    polylines: Array.from({ length: count }, () => {
      let x = 0.1 + 0.8 * rand()
      let y = 0.1 + 0.8 * rand()
      return Array.from({ length: perLine }, () => {
        x = Math.min(0.99, Math.max(0.01, x + (rand() - 0.5) * 0.012))
        y = Math.min(0.99, Math.max(0.01, y + (rand() - 0.5) * 0.012))
        return { x, y }
      })
    }),
  }
}

/** The worst case the page model must bound (M4-R17): 4000 edge vertices, 4 faces, 4 poses. */
export function worstCaseGuides(): ImageGuides {
  const shift = <P extends SourcePoint>(p: P, d: number): P => ({ ...p, x: p.x + d, y: p.y + d })
  const shifts = [-0.12, -0.04, 0.04, 0.12]
  return {
    faces: shifts.map((d) => ({ points: FIXTURE_FACE.points.map((p) => shift(p, d)) })),
    poses: shifts.map((d) => ({
      points: FIXTURE_POSE.points.map((p) => shift(p, d / 2)),
      visibility: FIXTURE_POSE.visibility,
    })),
    edges: noisyOutline(40, MAX_EDGE_VERTICES / 40),
  }
}

/** Every guide from the fixtures (the face, the pose) and a small synthetic outline. */
export function guidesFixture(): ImageGuides {
  return { faces: [FIXTURE_FACE], poses: [FIXTURE_POSE], edges: syntheticOutline(3, 5) }
}

/** The patch that switches every guide on. */
export const EVERY_GUIDE: LinesPatch = { edges: { on: true }, face: true, pose: true }
