import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ImageDescriptor, ImageEdits, Rotation } from '../../../shared/model/image'
import {
  DEFAULT_LINES,
  type LinesPatch,
  patchLines,
  SPIRAL_CORNERS,
  type SpiralCorner,
} from '../../../shared/model/lines'
import { outerReserveMm } from '../../../shared/model/page-setup'
import { DEFAULT_STUDY, type StudyVersion } from '../../../shared/model/study'
import { compositionPaths } from '../../lines/composition'
import { circlePath } from '../../lines/guides/curves'
import { edgePaths } from '../../lines/guides/edge-paths'
import { facePaths } from '../../lines/guides/face'
import { poseFigure } from '../../lines/guides/pose'
import { NO_GUIDES, type ImageGuides } from '../../lines/guides/types'
import type { PathCmd } from '../../lines/types'
import type { Placement, RectMm } from '../../layout/types'
import { applyMatrix, orientMatrix, planTilePixels, tileRenderKey } from '../pixels/tile-plan'
import {
  arbLineSettings,
  descriptor,
  EVERY_GUIDE,
  guidesFixture,
  id,
  layoutOf,
  linesDescriptor,
  placement,
  PORTRAIT_PX,
  setupWith,
  studyDescriptor,
} from '../test-support/fixtures'
import type { DrawTile, PageModel, TileLines } from '../types'
import { buildPageModels, combineRotation, readingOrder } from './build-page-models'
import { idealCropMarks } from './crop-marks'
import { expandRect, segmentIntersectsRect } from './rect'

describe('combineRotation', () => {
  it.each<[Rotation, boolean, Rotation]>([
    [0, false, 0],
    [0, true, 90],
    [90, true, 180],
    [180, true, 270],
    [270, true, 0],
    [270, false, 270],
  ])('%i + turned=%s → %i', (r, turned, expected) => {
    expect(combineRotation(r, turned)).toBe(expected)
  })
})

describe('buildPageModels', () => {
  const trimA = { x: 20, y: 20, w: 100, h: 66.67 }
  const trimB = { x: 20, y: 100, w: 60, h: 90 }

  it('returns no pages for an empty layout', () => {
    expect(buildPageModels(layoutOf([]), setupWith(), [])).toEqual([])
  })

  it('builds one tile per placement tile with resolved crop, bleed and safe area', () => {
    const pages = buildPageModels(
      layoutOf([[placement('a', [trimA], { warnings: ['low-dpi', 'scaled-to-fit'] })]]),
      setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } }),
      [descriptor('a', 3000, 2000)],
    )
    expect(pages).toHaveLength(1)
    const page = pages[0]
    expect(page?.index).toBe(0)
    expect(page?.size).toEqual({ w: 210, h: 297 })
    expect(page?.safeArea).toEqual({ x: 5, y: 5, w: 200, h: 287 })
    expect(page?.tiles).toEqual([
      {
        imageId: id('a'),
        trim: trimA,
        bleedMm: 3,
        crop: { x: 0, y: 0, w: 3000, h: 2000 },
        rotation: 0,
        flipH: false,
        flipV: false,
        lowDpi: true,
        scaledToFit: true,
        version: 'original',
        study: null,
      },
    ])
    expect(page?.cropMarks).toHaveLength(8)
  })

  it('sets scaledToFit only from the scaled-to-fit warning, independently of lowDpi (CR-X1)', () => {
    const [page] = buildPageModels(
      layoutOf([
        [
          placement('a', [trimA], { warnings: ['scaled-to-fit'] }),
          placement('b', [trimB], { warnings: ['low-dpi'] }),
          placement('c', [{ x: 120, y: 100, w: 40, h: 40 }]),
        ],
      ]),
      setupWith(),
      [descriptor('a', 3000, 2000), descriptor('b', 3000, 2000), descriptor('c', 3000, 2000)],
    )
    expect(page?.tiles.map((t) => [t.lowDpi, t.scaledToFit])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ])
  })

  it('uses bleed 0 when bleed is off, and no marks when crop marks are off', () => {
    const [page] = buildPageModels(
      layoutOf([[placement('a', [trimA])]]),
      setupWith({ cropMarks: false }),
      [descriptor('a')],
    )
    expect(page?.tiles[0]?.bleedMm).toBe(0)
    expect(page?.cropMarks).toEqual([])
  })

  it('adds 90° and swaps the flips when the engine turned the item', () => {
    const [page] = buildPageModels(
      layoutOf([[placement('a', [trimB], { turned: true })]]),
      setupWith(),
      [descriptor('a', 3000, 2000, { rotation: 90, flipH: true, flipV: false })],
    )
    expect(page?.tiles[0]).toMatchObject({ rotation: 180, flipH: false, flipV: true })
  })

  it('skips placements whose image is gone and drops pages left empty', () => {
    const pages = buildPageModels(
      layoutOf([[placement('gone', [trimA])], [placement('b', [trimB])]]),
      setupWith(),
      [descriptor('b')],
    )
    expect(pages).toHaveLength(1)
    expect(pages[0]?.index).toBe(0)
    expect(pages[0]?.tiles[0]?.imageId).toBe(id('b'))
  })

  it('emits one tile per rect of a multi-tile placement (M2 study groups)', () => {
    const [page] = buildPageModels(
      layoutOf([[placement('a', [trimA, { ...trimA, x: 130, w: 60 }])]]),
      setupWith(),
      [studyDescriptor('a', ['original', 'blurred'])],
    )
    expect(page?.tiles).toHaveLength(2)
  })

  it('crop marks never cross another tile’s trim+bleed box (snapshot of a tight 2-up)', () => {
    const [page] = buildPageModels(
      layoutOf([
        [
          placement('a', [{ x: 14, y: 14, w: 88, h: 60 }]),
          placement('b', [{ x: 108, y: 14, w: 88, h: 60 }]),
        ],
      ]),
      setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } }),
      [descriptor('a'), descriptor('b')],
    )
    const boxes = page?.tiles.map((t) => expandRect(t.trim, t.bleedMm)) ?? []
    page?.cropMarks.forEach((s) => {
      boxes.forEach((b) => {
        expect(segmentIntersectsRect(s, b)).toBe(false)
      })
    })
    // The 4 marks facing the 6 mm gutter (2 per tile) are fully blocked: 16 − 4 = 12.
    expect(page?.cropMarks).toHaveLength(12)
    expect(page).toMatchSnapshot()
  })

  it('is deterministic (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.double({ min: 10, max: 100, noNaN: true }),
            y: fc.double({ min: 10, max: 200, noNaN: true }),
          }),
          { maxLength: 6 },
        ),
        fc.constantFrom<Rotation>(0, 90, 180, 270),
        fc.boolean(),
        (origins, rotation, turned) => {
          const placements = origins.map((o, i) =>
            placement(`i${String(i)}`, [{ x: o.x, y: o.y, w: 20, h: 30 }], { turned }),
          )
          const images = origins.map((_, i) => descriptor(`i${String(i)}`, 800, 1200, { rotation }))
          const layout = layoutOf([placements])
          expect(buildPageModels(layout, setupWith(), images)).toEqual(
            buildPageModels(layout, setupWith(), images),
          )
        },
      ),
    )
  })
})

const R = (x: number, y: number, w = 40, h = 60): RectMm => ({ x, y, w, h })

describe('study versions (M2-R4)', () => {
  const three = studyDescriptor('a', ['original', 'blurred', 'values'])

  it('assigns versions in reading order: row, column, turned row, turned column', () => {
    const row = placement('a', [R(20, 20), R(66, 20), R(112, 20)])
    const column = placement('a', [R(20, 20, 60, 40), R(20, 66, 60, 40), R(20, 112, 60, 40)])
    const turnedRow = placement('a', [R(20, 20, 60, 40), R(20, 66, 60, 40), R(20, 112, 60, 40)], {
      turned: true,
    })
    // A turned column places tile i i-th from the right (CR-B5).
    const turnedColumn = placement('a', [R(112, 20), R(66, 20), R(20, 20)], { turned: true })
    for (const p of [row, column, turnedRow, turnedColumn]) {
      const [page] = buildPageModels(layoutOf([[p]]), setupWith({ cropMarks: false }), [three])
      const tiles = page?.tiles ?? []
      expect(tiles.map((t) => t.version)).toEqual(['original', 'blurred', 'values'])
      const trims = tiles.map((t) => t.trim)
      expect(trims).toEqual(readingOrder(trims))
    }
    const [turned] = buildPageModels(layoutOf([[turnedColumn]]), setupWith(), [three])
    expect(turned?.tiles[0]?.trim).toEqual(R(20, 20))
  })

  it("emits each placement's tiles consecutively, in reading order (CR-M2-5)", () => {
    // Two side-by-side columns: sorting the whole page would interleave a and b.
    const a = placement('a', [R(20, 112, 40, 40), R(20, 20, 40, 40), R(20, 66, 40, 40)])
    const b = placement('b', [R(66, 66, 40, 40), R(66, 20, 40, 40)])
    const [page] = buildPageModels(layoutOf([[a, b]]), setupWith({ cropMarks: false }), [
      three,
      studyDescriptor('b', ['original', 'values']),
    ])
    const tiles = page?.tiles ?? []
    expect(tiles.map((t) => t.imageId)).toEqual([id('a'), id('a'), id('a'), id('b'), id('b')])
    expect(tiles.map((t) => t.trim.y)).toEqual([20, 66, 112, 20, 66])
    expect(tiles[3]?.version).toBe('original')
    expect(tiles[4]?.version).toBe('values')
  })

  it('attaches tileStudyFor(version, study) and keeps the M1 fields of every tile', () => {
    const p = placement('a', [R(20, 20), R(66, 20), R(112, 20)], { warnings: ['low-dpi'] })
    const [page] = buildPageModels(layoutOf([[p]]), setupWith(), [three])
    const [o, b, v] = page?.tiles ?? []
    expect(o?.study).toBeNull()
    expect(b?.study).toEqual({ blurPct: DEFAULT_STUDY.blurPct, values: null })
    expect(v?.study).toEqual({ blurPct: null, values: DEFAULT_STUDY.values })
    expect(page?.tiles.every((t) => t.lowDpi)).toBe(true)
    expect(new Set(page?.tiles.map((t) => JSON.stringify(t.crop))).size).toBe(1)
  })

  it('gives every version of the four its study, in canonical order', () => {
    const all = studyDescriptor('a', ['original', 'blurred', 'values', 'blurValues'])
    const p = placement('a', [R(20, 20), R(66, 20), R(112, 20), R(158, 20)])
    const [page] = buildPageModels(layoutOf([[p]]), setupWith(), [all])
    expect(page?.tiles.map((t) => t.version)).toEqual([
      'original',
      'blurred',
      'values',
      'blurValues',
    ])
    expect(page?.tiles[3]?.study).toEqual({
      blurPct: DEFAULT_STUDY.blurPct,
      values: DEFAULT_STUDY.values,
    })
  })

  it('lists placements with ≥ 2 tiles as groups, in placement order', () => {
    const group = placement('a', [R(20, 20), R(66, 20)], { block: R(20, 20, 86, 60) })
    const single = placement('b', [R(20, 100)])
    const last = placement('c', [R(20, 180), R(66, 180)], { block: R(20, 180, 86, 60) })
    const [page] = buildPageModels(layoutOf([[group, single, last]]), setupWith(), [
      studyDescriptor('a', ['original', 'values']),
      descriptor('b'),
      studyDescriptor('c', ['blurred', 'values']),
    ])
    expect(page?.groups).toEqual([
      { imageId: id('a'), block: group.block },
      { imageId: id('c'), block: last.block },
    ])
  })

  it('skips a placement whose tile count no longer matches the versions (stale layout)', () => {
    const stale = placement('a', [R(20, 20)])
    const other = placement('b', [R(20, 100)])
    const pages = buildPageModels(layoutOf([[stale, other]]), setupWith(), [
      studyDescriptor('a', ['original', 'values']),
      descriptor('b'),
    ])
    expect(pages[0]?.tiles.map((t) => t.imageId)).toEqual([id('b')])
    expect(pages[0]?.groups).toEqual([])
  })

  it('skips a stale group laid out for more tiles than the image now has', () => {
    const stale = placement('a', [R(20, 20), R(66, 20)])
    const pages = buildPageModels(layoutOf([[stale]]), setupWith(), [descriptor('a')])
    expect(pages).toEqual([])
  })

  it('drops a page left empty by a stale placement and re-indexes', () => {
    const pages = buildPageModels(
      layoutOf([[placement('a', [R(20, 20)])], [placement('b', [R(20, 20)])]]),
      setupWith(),
      [studyDescriptor('a', ['original', 'values']), descriptor('b')],
    )
    expect(pages.map((p) => p.index)).toEqual([0])
    expect(pages[0]?.tiles[0]?.imageId).toBe(id('b'))
  })

  it('Original-only images give the M1 model plus version/study/groups defaults', () => {
    const [page] = buildPageModels(layoutOf([[placement('a', [R(20, 20)])]]), setupWith(), [
      descriptor('a'),
    ])
    expect(page?.tiles[0]?.version).toBe('original')
    expect(page?.tiles[0]?.study).toBeNull()
    expect(page?.groups).toEqual([])
  })

  describe('a 3-version turned group with bleed and crop marks', () => {
    const setup = setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })
    const x0 = setup.safeAreaMm + outerReserveMm(setup)
    const p = placement('a', [R(x0 + 100, 14, 44, 66), R(x0 + 50, 14, 44, 66), R(x0, 14, 44, 66)], {
      turned: true,
      block: R(x0, 14, 144, 66),
    })
    const [page] = buildPageModels(layoutOf([[p]]), setup, [three])

    it('matches the snapshot', () => {
      expect(page).toMatchSnapshot()
    })

    it("keeps the group's outer crop marks at full length (H4)", () => {
      const outer = idealCropMarks({ trim: p.block, bleedMm: 3 }).map((m) => ({
        x1: m.x,
        y1: m.y,
        x2: m.x + m.dx * m.length,
        y2: m.y + m.dy * m.length,
      }))
      expect(page?.cropMarks).toEqual(expect.arrayContaining(outer))
    })
  })
})

describe('readingOrder', () => {
  it('sorts by y then x, treating y within 1e-6 mm as one row', () => {
    const a = R(10, 20 + 1e-9)
    const b = R(50, 20)
    const c = R(10, 90)
    expect(readingOrder([c, b, a])).toEqual([a, b, c])
  })

  it('starts a new row when y differs by more than 1e-6 mm', () => {
    const lower = R(10, 20 + 1e-5)
    const upper = R(50, 20)
    expect(readingOrder([lower, upper])).toEqual([upper, lower])
  })

  it('does not mutate its input', () => {
    const input = [R(50, 20), R(10, 20)]
    readingOrder(input)
    expect(input).toEqual([R(50, 20), R(10, 20)])
  })
})

const EVERY_TYPE: LinesPatch = {
  grid: { on: true, cols: 4, rows: 5 },
  thirds: true,
  armature: true,
  golden: true,
  spiral: { on: true, corner: 'topRight' },
  centre: true,
}
const VERSIONS: readonly StudyVersion[] = ['original', 'blurred', 'values', 'blurValues']

const withLines = (img: ImageDescriptor, patch: LinesPatch): ImageDescriptor =>
  linesDescriptor(img.id, patch, img)

/** Every end and control point, relative to the trim's top-left corner. */
const relative = (tl: TileLines): number[][] =>
  tl.strokes.map((s) =>
    s.cmds.flatMap((c: PathCmd) => {
      const { x, y } = tl.clip
      return c.op === 'C'
        ? [c.x1 - x, c.y1 - y, c.x2 - x, c.y2 - y, c.x - x, c.y - y]
        : [c.x - x, c.y - y]
    }),
  )

function expectClose(a: readonly number[][], b: readonly number[][]): void {
  expect(a.map((r) => r.length)).toEqual(b.map((r) => r.length))
  a.forEach((row, i) => {
    row.forEach((v, j) => {
      expect(Math.abs(v - (b[i]?.[j] ?? Number.NaN))).toBeLessThan(1e-9)
    })
  })
}

const pointsOf = (cmds: readonly PathCmd[]): (readonly [number, number])[] =>
  cmds.flatMap((c) =>
    c.op === 'C'
      ? [[c.x1, c.y1] as const, [c.x2, c.y2] as const, [c.x, c.y] as const]
      : [[c.x, c.y] as const],
  )

const firstMove = (page: PageModel | undefined): PathCmd | undefined =>
  page?.lines[0]?.strokes[0]?.cmds[0]

const withoutLines = (pages: readonly PageModel[]) => pages.map((p) => ({ ...p, lines: [] }))

const styleOf = (l: TileLines) => ({
  colour: l.colour,
  opacity: l.opacity,
  widthMm: l.widthMm,
  types: l.types,
  dashes: l.strokes.map((s) => s.dashMm),
})

interface Case {
  readonly images: ImageDescriptor[]
  readonly placements: Placement[]
}
const arbCase: fc.Arbitrary<Case> = fc
  .array(
    fc.record({
      versions: fc.integer({ min: 1, max: 4 }),
      laidOut: fc.integer({ min: 1, max: 4 }),
      w: fc.double({ min: 5, max: 80, noNaN: true }),
      h: fc.double({ min: 5, max: 80, noNaN: true }),
      turned: fc.boolean(),
      rotation: fc.constantFrom<Rotation>(0, 90, 180, 270),
      flipH: fc.boolean(),
      lines: fc.oneof(fc.constant(DEFAULT_LINES), arbLineSettings),
    }),
    { minLength: 1, maxLength: 5 },
  )
  .map((specs) => {
    let y = 10
    const images: ImageDescriptor[] = []
    const placements: Placement[] = []
    specs.forEach((s, i) => {
      const name = `i${String(i)}`
      const tiles = Array.from({ length: s.laidOut }, (_, k) => R(10 + k * (s.w + 2), y, s.w, s.h))
      y += s.h + 2
      images.push({
        ...descriptor(name, 1200, 800, { rotation: s.rotation, flipH: s.flipH }),
        study: { ...DEFAULT_STUDY, versions: VERSIONS.slice(0, s.versions) },
        lines: s.lines,
      })
      placements.push(placement(name, tiles, { turned: s.turned }))
    })
    return { images, placements }
  })

describe('composition lines in the page model', () => {
  const three = studyDescriptor('a', ['original', 'blurred', 'values'])
  const row = placement('a', [R(20, 20), R(66, 20), R(112, 20)], { block: R(20, 20, 132, 60) })
  const single = placement('b', [R(20, 100, 60, 40)])

  it('puts the same lines on every version tile of a group, none on a photo without lines (golden)', () => {
    const [page] = buildPageModels(layoutOf([[row, single]]), setupWith(), [
      withLines(three, EVERY_TYPE),
      descriptor('b'),
    ])
    const lines = page?.lines ?? []
    expect(lines.map((l) => l.tileIndex)).toEqual([0, 1, 2])
    lines.forEach((l) => {
      expect(l.clip).toEqual(page?.tiles[l.tileIndex]?.trim)
      expect(l.types).toEqual(['grid', 'thirds', 'armature', 'golden', 'spiral', 'centre'])
    })
    const [first, ...rest] = lines
    rest.forEach((l) => {
      expect(styleOf(l)).toEqual(first ? styleOf(first) : undefined)
      expectClose(relative(l), first ? relative(first) : [])
    })
    expect(page ? { ...page, lines: page.lines.slice(0, 1) } : page).toMatchSnapshot()
  })

  it('emits no lines, whatever the grid size and style, when no type is on', () => {
    const images = [three, descriptor('b')]
    const pages = buildPageModels(layoutOf([[row, single]]), setupWith(), images)
    expect(pages.map((p) => p.lines)).toEqual([[]])
    const styled = images.map((img) =>
      withLines(img, { grid: { cols: 9 }, style: { colour: '#000000', opacityPct: 10 } }),
    )
    expect(buildPageModels(layoutOf([[row, single]]), setupWith(), styled)).toEqual(pages)
  })

  it('turns the lines with a turned placement: a top-left spiral starts at the trim top right', () => {
    const trim = R(20, 20, 60, 40)
    const [page] = buildPageModels(
      layoutOf([[placement('a', [trim], { turned: true })]]),
      setupWith(),
      [linesDescriptor('a', { spiral: { on: true, corner: 'topLeft' } })],
    )
    expect(firstMove(page)).toEqual({ op: 'M', x: trim.x + trim.w, y: trim.y })
  })

  it('starts the spiral on the tile pixel that shows the chosen corner of the picture as edited (Q4, property)', () => {
    const cornerAt: Record<SpiralCorner, readonly [number, number]> = {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomLeft: [0, 1],
      bottomRight: [1, 1],
    }
    const sourceCorners = Object.values(cornerAt)
    fc.assert(
      fc.property(
        fc.constantFrom<Rotation>(0, 90, 180, 270),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom(...SPIRAL_CORNERS),
        (rotation, flipH, flipV, turned, corner) => {
          const img = linesDescriptor(
            'a',
            { spiral: { on: true, corner } },
            descriptor('a', 3000, 2000, { rotation, flipH, flipV }),
          )
          const [ew, eh] = rotation % 180 === 0 ? [60, 40] : [40, 60]
          const trim = turned ? R(20, 20, eh, ew) : R(20, 20, ew, eh)
          const [page] = buildPageModels(
            layoutOf([[placement('a', [trim], { turned })]]),
            setupWith(),
            [img],
          )
          const tile = page?.tiles[0]
          if (!tile) throw new Error('no tile')
          const asEdited = orientMatrix(rotation, flipH, flipV, 1, 1, 1, 1, 0)
          const [cu, cv] = cornerAt[corner]
          const source = sourceCorners.find(([s, r]) => {
            const p = applyMatrix(asEdited, s, r)
            return Math.abs(p.x - cu) < 1e-9 && Math.abs(p.y - cv) < 1e-9
          })
          if (!source) throw new Error('no source corner')
          const onTile = applyMatrix(
            orientMatrix(tile.rotation, tile.flipH, tile.flipV, 1, 1, trim.w, trim.h, 0),
            source[0],
            source[1],
          )
          const start = firstMove(page)
          expect(start?.op).toBe('M')
          if (start?.op !== 'M') return
          expect(Math.abs(start.x - (trim.x + onTile.x))).toBeLessThan(1e-9)
          expect(Math.abs(start.y - (trim.y + onTile.y))).toBeLessThan(1e-9)
        },
      ),
    )
  })

  it.each<[string, Partial<ImageDescriptor['edits']>]>([
    ['rotated 90°', { rotation: 90 }],
    ['rotated 270°', { rotation: 270 }],
    ['flipped horizontally', { flipH: true }],
    ['flipped vertically', { flipV: true }],
  ])('does not move the lines of a photo the user %s (M3-R2)', (_, edits) => {
    const trim = R(20, 20, 60, 40)
    const img = linesDescriptor(
      'a',
      { spiral: { on: true, corner: 'topLeft' } },
      descriptor('a', 3000, 2000, edits),
    )
    const [flat] = buildPageModels(layoutOf([[placement('a', [trim])]]), setupWith(), [img])
    expect(firstMove(flat)).toEqual({ op: 'M', x: trim.x, y: trim.y })
    const [turned] = buildPageModels(
      layoutOf([[placement('a', [trim], { turned: true })]]),
      setupWith(),
      [img],
    )
    expect(firstMove(turned)).toEqual({ op: 'M', x: trim.x + trim.w, y: trim.y })
  })

  it('clips to the trim, never to the trim plus bleed (M3-R4)', () => {
    const [page] = buildPageModels(
      layoutOf([[row]]),
      setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } }),
      [withLines(three, { thirds: true })],
    )
    expect(page?.tiles.every((t) => t.bleedMm === 3)).toBe(true)
    expect(page?.lines.map((l) => l.clip)).toEqual(page?.tiles.map((t) => t.trim))
  })

  it('leaves every tile and its render key unchanged when lines are switched on (M3-R5)', () => {
    const layout = layoutOf([[row, single]])
    const setup = setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })
    const off = buildPageModels(layout, setup, [three, descriptor('b')])
    const on = buildPageModels(layout, setup, [
      withLines(three, EVERY_TYPE),
      linesDescriptor('b', { centre: true }),
    ])
    expect(on.flatMap((p) => p.lines)).toHaveLength(4)
    expect(withoutLines(on)).toEqual(withoutLines(off))
    expect(on.flatMap((p) => p.tiles.map((t) => tileRenderKey(t)))).toEqual(
      off.flatMap((p) => p.tiles.map((t) => tileRenderKey(t))),
    )
  })

  it('indexes the tiles left after skipping a stale or missing placement', () => {
    const stale = placement('s', [R(20, 20)])
    const gone = placement('gone', [R(66, 20)])
    const plain = placement('p', [R(112, 20)])
    const group = placement('g', [R(20, 100), R(66, 100)])
    const [page] = buildPageModels(layoutOf([[stale, gone, plain, group]]), setupWith(), [
      linesDescriptor('s', { thirds: true }, studyDescriptor('s', ['original', 'values'])),
      descriptor('p'),
      linesDescriptor('g', { centre: true }, studyDescriptor('g', ['original', 'values'])),
    ])
    expect(page?.tiles.map((t) => t.imageId)).toEqual([id('p'), id('g'), id('g')])
    expect(page?.lines.map((l) => l.tileIndex)).toEqual([1, 2])
    expect(page?.lines.map((l) => l.clip)).toEqual(page?.tiles.slice(1).map((t) => t.trim))
  })

  it('restarts the tile index on every page', () => {
    const pages = buildPageModels(
      layoutOf([[placement('a', [R(20, 20)])], [placement('b', [R(20, 20)])]]),
      setupWith(),
      [linesDescriptor('a', { thirds: true }), linesDescriptor('b', { thirds: true })],
    )
    expect(pages.map((p) => p.lines.map((l) => l.tileIndex))).toEqual([[0], [0]])
  })

  describe('a 3-version turned group with lines, bleed and crop marks', () => {
    const setup = setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })
    const x0 = setup.safeAreaMm + outerReserveMm(setup)
    const p = placement('a', [R(x0 + 100, 14, 44, 66), R(x0 + 50, 14, 44, 66), R(x0, 14, 44, 66)], {
      turned: true,
      block: R(x0, 14, 144, 66),
    })
    const img = withLines(three, {
      thirds: true,
      spiral: { on: true, corner: 'topLeft' },
      centre: true,
      style: { colour: '#1f3fbf', widthMm: 0.5, opacityPct: 75 },
    })
    const [page] = buildPageModels(layoutOf([[p]]), setup, [img])

    it("matches the snapshot (the first tile's lines; tiles and marks are pinned by the M2 snapshot)", () => {
      expect(page?.lines[0]).toMatchSnapshot()
    })

    it("starts each tile's spiral at its own trim's top right, with the same lines on every tile", () => {
      expect(page?.lines.map((l) => l.clip)).toEqual(page?.tiles.map((t) => t.trim))
      const [first, ...rest] = page?.lines ?? []
      page?.lines.forEach((l) => {
        expect(l.strokes[0]?.cmds[8]).toEqual({ op: 'M', x: l.clip.x + l.clip.w, y: l.clip.y })
      })
      expect(rest).toHaveLength(2)
      rest.forEach((l) => {
        expect(styleOf(l)).toEqual(first ? styleOf(first) : undefined)
        expectClose(relative(l), first ? relative(first) : [])
      })
    })
  })

  const pagesOf = ({ images, placements }: Case, bleed: boolean) =>
    buildPageModels(
      layoutOf([placements], { w: 420, h: 594 }),
      bleed
        ? setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })
        : setupWith(),
      images,
    )

  it('one entry per tile whose image prints lines, in tile order, inside its trim (property)', () => {
    fc.assert(
      fc.property(arbCase, fc.boolean(), (c, bleed) => {
        const byId = new Map(c.images.map((img) => [img.id, img]))
        for (const page of pagesOf(c, bleed)) {
          const expected = page.tiles.flatMap((t, i) => {
            const lines = byId.get(t.imageId)?.lines ?? DEFAULT_LINES
            return compositionPaths(lines, { w: 1, h: 1 }).length > 0 ? [i] : []
          })
          expect(page.lines.map((l) => l.tileIndex)).toEqual(expected)
          page.lines.forEach((l) => {
            expect(l.clip).toEqual(page.tiles[l.tileIndex]?.trim)
            const { x, y, w, h } = l.clip
            pointsOf(l.strokes.flatMap((s) => s.cmds)).forEach(([px, py]) => {
              expect(px).toBeGreaterThanOrEqual(x - 1e-9)
              expect(px).toBeLessThanOrEqual(x + w + 1e-9)
              expect(py).toBeGreaterThanOrEqual(y - 1e-9)
              expect(py).toBeLessThanOrEqual(y + h + 1e-9)
            })
          })
        }
      }),
    )
  })

  it('gives every version of a group the same lines, relative to its tile (property)', () => {
    fc.assert(
      fc.property(arbCase, fc.boolean(), (c, bleed) => {
        for (const page of pagesOf(c, bleed)) {
          const firstOf = new Map<string, TileLines>()
          page.lines.forEach((l) => {
            const imageId = page.tiles[l.tileIndex]?.imageId ?? ''
            const first = firstOf.get(imageId)
            if (!first) {
              firstOf.set(imageId, l)
              return
            }
            expect([l.colour, l.opacity, l.widthMm, l.types]).toEqual([
              first.colour,
              first.opacity,
              first.widthMm,
              first.types,
            ])
            expect(l.strokes.map((s) => s.dashMm)).toEqual(first.strokes.map((s) => s.dashMm))
            expectClose(relative(l), relative(first))
          })
        }
      }),
    )
  })

  it('lines change nothing else in the model, and no lines means lines: [] (property)', () => {
    fc.assert(
      fc.property(arbCase, fc.boolean(), (c, bleed) => {
        const plain = pagesOf(
          { ...c, images: c.images.map((img) => ({ ...img, lines: DEFAULT_LINES })) },
          bleed,
        )
        expect(plain.every((p) => p.lines.length === 0)).toBe(true)
        expect(withoutLines(pagesOf(c, bleed))).toEqual(withoutLines(plain))
      }),
    )
  })

  it('is deterministic with lines on (property)', () => {
    fc.assert(
      fc.property(arbCase, fc.boolean(), (c, bleed) => {
        expect(pagesOf(c, bleed)).toEqual(pagesOf(c, bleed))
      }),
    )
  })
})

/** Source px → page mm through the tile's pixels (A2's oracle, independent of sourceToFrame). */
function pixelOracle(tile: DrawTile, x: number, y: number): { x: number; y: number } {
  const plan = planTilePixels(tile, { dpi: 72 })
  const onCanvas = applyMatrix(
    plan.matrix,
    ((x - plan.src.x) * plan.scaledW) / plan.src.w,
    ((y - plan.src.y) * plan.scaledH) / plan.src.h,
  )
  return {
    x: tile.trim.x + ((onCanvas.x - plan.bleedPx) * tile.trim.w) / plan.outW,
    y: tile.trim.y + ((onCanvas.y - plan.bleedPx) * tile.trim.h) / plan.outH,
  }
}

function placeByOracle(tile: DrawTile, c: PathCmd): PathCmd {
  if (c.op === 'C') {
    const p1 = pixelOracle(tile, c.x1, c.y1)
    const p2 = pixelOracle(tile, c.x2, c.y2)
    const p = pixelOracle(tile, c.x, c.y)
    return { op: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y }
  }
  return { op: c.op, ...pixelOracle(tile, c.x, c.y) }
}

/** The types and solid batch a tile with every guide on must hold, from the source-px geometry and the oracle. */
function oracleGuides(
  img: ImageDescriptor,
  guides: ImageGuides,
  tile: DrawTile,
): { types: string[]; cmds: PathCmd[] } {
  const place = (c: PathCmd) => placeByOracle(tile, c)
  const edges = guides.edges ? edgePaths(guides.edges, img).map(place) : []
  const faces = (guides.faces ?? []).flatMap((f) => facePaths(f, img).map(place))
  const poses = (guides.poses ?? []).flatMap((p) => {
    const fig = poseFigure(p, img)
    return [
      ...fig.cmds.map(place),
      ...fig.joints.flatMap((j) => {
        const c = pixelOracle(tile, j.x, j.y)
        return circlePath(c.x, c.y, img.lines.style.widthMm / 2)
      }),
    ]
  })
  const found = [
    ['edges', edges],
    ['face', faces],
    ['pose', poses],
  ] as const
  return {
    types: found.filter(([, c]) => c.length > 0).map(([t]) => t),
    cmds: [...edges, ...faces, ...poses],
  }
}

function expectCmdsNear(got: readonly PathCmd[], want: readonly PathCmd[], eps: number): void {
  expect(got.map((c) => c.op).join('')).toBe(want.map((c) => c.op).join(''))
  const g = pointsOf(got)
  pointsOf(want).forEach(([x, y], i) => {
    expect(Math.abs((g[i]?.[0] ?? NaN) - x)).toBeLessThan(eps)
    expect(Math.abs((g[i]?.[1] ?? NaN) - y)).toBeLessThan(eps)
  })
}

describe('guides in the page model (M4-R10–R12)', () => {
  const portrait = (
    edits: Partial<ImageEdits> = {},
    versions: readonly StudyVersion[] = ['original'],
  ) =>
    linesDescriptor(
      'p',
      { ...EVERY_GUIDE, style: { widthMm: 0.5 } },
      {
        ...descriptor('p', PORTRAIT_PX.w, PORTRAIT_PX.h, edits),
        study: { ...DEFAULT_STUDY, versions },
      },
    )
  const guides = guidesFixture()
  const byOracle = (page: PageModel | undefined, img: ImageDescriptor) => {
    page?.tiles.forEach((tile, i) => {
      const want = oracleGuides(img, guides, tile)
      const l = page.lines.find((e) => e.tileIndex === i)
      if (want.types.length === 0) {
        expect(l).toBeUndefined()
        return
      }
      const t = tile.trim
      const eps = 1e-9 * (1 + Math.abs(t.x) + Math.abs(t.y) + t.w + t.h)
      expect(l?.clip).toEqual(t)
      expect(l?.types).toEqual(want.types)
      expect(l?.strokes).toHaveLength(1)
      expectCmdsNear(l?.strokes[0]?.cmds ?? [], want.cmds, eps)
    })
  }

  it('without guides the page models equal master’s: no argument and () => NO_GUIDES (property)', () => {
    fc.assert(
      fc.property(arbCase, fc.boolean(), fc.boolean(), (c, bleed, switches) => {
        const images = switches
          ? c.images.map((img) => ({ ...img, lines: patchLines(img.lines, EVERY_GUIDE) }))
          : c.images
        const layout = layoutOf([c.placements], { w: 420, h: 594 })
        const setup = bleed
          ? setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })
          : setupWith()
        const master = JSON.stringify(buildPageModels(layout, setup, c.images))
        expect(JSON.stringify(buildPageModels(layout, setup, images))).toBe(master)
        expect(JSON.stringify(buildPageModels(layout, setup, images, () => NO_GUIDES))).toBe(master)
      }),
    )
  })

  it('a face on a picture rotated 90° by the user and turned by the engine lands on the face in the tile', () => {
    const img = portrait({ rotation: 90, flipH: true, crop: { x: 100, y: 300, w: 1100, h: 900 } })
    const [page] = buildPageModels(
      layoutOf([[placement('p', [R(20, 30, 85.5, 70)], { turned: true })]]),
      setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } }),
      [img],
      () => guides,
    )
    expect(page?.tiles[0]?.rotation).toBe(180)
    expect(page?.lines[0]?.types).toEqual(['edges', 'face', 'pose'])
    byOracle(page, img)
  })

  it('guides follow the picture through rotation, flips, crop, bleed and the engine’s turn (property)', () => {
    const crops = fc.oneof(
      fc.constant(null),
      fc.record({
        x: fc.double({ min: 0, max: 600, noNaN: true }),
        y: fc.double({ min: 0, max: 700, noNaN: true }),
        w: fc.double({ min: 300, max: 700, noNaN: true }),
        h: fc.double({ min: 300, max: 1300, noNaN: true }),
      }),
    )
    fc.assert(
      fc.property(
        fc.constantFrom<Rotation>(0, 90, 180, 270),
        fc.boolean(),
        fc.boolean(),
        crops,
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 1, max: 4 }),
        fc.double({ min: 10, max: 80, noNaN: true }),
        fc.double({ min: 10, max: 80, noNaN: true }),
        (rotation, flipH, flipV, crop, turned, bleed, n, w, h) => {
          const img = portrait({ rotation, flipH, flipV, crop }, VERSIONS.slice(0, n))
          const tiles = Array.from({ length: n }, (_, k) => R(10 + k * (w + 8), 10, w, h))
          const [page] = buildPageModels(
            layoutOf([[placement('p', tiles, { turned })]], { w: 420, h: 594 }),
            bleed
              ? setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })
              : setupWith(),
            [img],
            () => guides,
          )
          byOracle(page, img)
        },
      ),
      { numRuns: 60 },
    )
  })

  it('every printed study version of an image carries the same guides', () => {
    const img = portrait({ rotation: 270, flipV: true }, VERSIONS)
    const tiles = [R(10, 10, 60, 40), R(76, 10, 60, 40), R(10, 56, 60, 40), R(76, 56, 60, 40)]
    const [page] = buildPageModels(
      layoutOf([[placement('p', tiles, { turned: true })]]),
      setupWith(),
      [img],
      () => guides,
    )
    expect(page?.tiles.map((t) => t.version)).toEqual(VERSIONS)
    expect(page?.lines.map((l) => l.types)).toEqual(VERSIONS.map(() => ['edges', 'face', 'pose']))
    byOracle(page, img)
    const [first, ...rest] = page?.lines ?? []
    if (!first) throw new Error('no lines')
    rest.forEach((l) => {
      expectClose(relative(l), relative(first))
    })
  })

  it('asks for each image’s guides and draws them only on that image’s tiles', () => {
    const a = portrait()
    const b = { ...linesDescriptor('b', EVERY_GUIDE), study: { ...DEFAULT_STUDY } }
    const seen: string[] = []
    const [page] = buildPageModels(
      layoutOf([[placement('p', [R(10, 10, 60, 90)]), placement('b', [R(80, 10, 60, 40)])]]),
      setupWith(),
      [a, b],
      (img) => {
        seen.push(img.id)
        return img.id === a.id ? guides : NO_GUIDES
      },
    )
    expect(new Set(seen)).toEqual(new Set(['p', 'b']))
    expect(page?.lines.map((l) => l.tileIndex)).toEqual([0])
  })

  it('guides change nothing but the lines: tiles, render keys, marks and groups (property)', () => {
    fc.assert(
      fc.property(arbCase, fc.boolean(), (c, bleed) => {
        const images = c.images.map((img) => ({
          ...img,
          lines: patchLines(img.lines, EVERY_GUIDE),
        }))
        const layout = layoutOf([c.placements], { w: 420, h: 594 })
        const setup = bleed
          ? setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })
          : setupWith()
        const plain = buildPageModels(layout, setup, images)
        const guided = buildPageModels(layout, setup, images, () => guides)
        expect(withoutLines(guided)).toEqual(withoutLines(plain))
        expect(guided.flatMap((p) => p.tiles.map((t) => tileRenderKey(t)))).toEqual(
          plain.flatMap((p) => p.tiles.map((t) => tileRenderKey(t))),
        )
        expect(buildPageModels(layout, setup, images, () => guides)).toEqual(guided)
      }),
      { numRuns: 40 },
    )
  })
})
