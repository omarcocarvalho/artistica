import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Rotation } from '../../../shared/model/image'
import { descriptor, id, layoutOf, placement, setupWith } from '../test-support/fixtures'
import { buildPageModels, combineRotation, resolveCrop } from './build-page-models'
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
      [descriptor('a')],
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
