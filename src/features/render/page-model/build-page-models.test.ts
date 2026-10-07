import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Rotation } from '../../../shared/model/image'
import { DEFAULT_STUDY } from '../../../shared/model/study'
import type { RectMm } from '../../layout/types'
import {
  descriptor,
  id,
  layoutOf,
  placement,
  setupWith,
  studyDescriptor,
} from '../test-support/fixtures'
import { buildPageModels, combineRotation, readingOrder, resolveCrop } from './build-page-models'
import { expandRect, segmentIntersectsRect } from './rect'

describe('resolveCrop', () => {
  it('uses the full image when crop is null', () => {
    expect(resolveCrop(descriptor('a', 400, 300))).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })
  it('keeps a valid crop', () => {
    const crop = { x: 10, y: 20, w: 100, h: 50 }
    expect(resolveCrop(descriptor('a', 400, 300, { crop }))).toEqual(crop)
  })
  it('keeps fractional crops unrounded', () => {
    const crop = { x: 10.25, y: 20.5, w: 100.75, h: 50.125 }
    expect(resolveCrop(descriptor('a', 400, 300, { crop }))).toEqual(crop)
  })
  it('clamps a crop that spills outside the image', () => {
    expect(
      resolveCrop(descriptor('a', 400, 300, { crop: { x: -5, y: 250, w: 500, h: 100 } })),
    ).toEqual({
      x: 0,
      y: 250,
      w: 400,
      h: 50,
    })
  })
})

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

  it('snapshot of a 3-version turned group with bleed and crop marks', () => {
    const p = placement('a', [R(108, 14, 44, 66), R(58, 14, 44, 66), R(8, 14, 44, 66)], {
      turned: true,
      block: R(8, 14, 144, 66),
    })
    const [page] = buildPageModels(
      layoutOf([[p]]),
      setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } }),
      [three],
    )
    expect(page).toMatchSnapshot()
  })
})

describe('readingOrder', () => {
  it('sorts by y then x, treating y within 1e-6 mm as one row', () => {
    const a = R(50, 20 + 1e-9)
    const b = R(10, 20)
    const c = R(10, 90)
    expect(readingOrder([c, a, b])).toEqual([b, a, c])
  })

  it('does not mutate its input', () => {
    const input = [R(50, 20), R(10, 20)]
    readingOrder(input)
    expect(input).toEqual([R(50, 20), R(10, 20)])
  })
})
