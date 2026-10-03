import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arrangementFor, blockSize, maxFitTileWidth, tileRects, tileShortSide } from './geometry'

describe('arrangementFor', () => {
  it('puts portrait and square tiles in a row, landscape tiles in a column', () => {
    expect(arrangementFor(2 / 3)).toBe('row')
    expect(arrangementFor(1)).toBe('row')
    expect(arrangementFor(1.5)).toBe('column')
  })
})

describe('blockSize', () => {
  it('is the tile itself for one tile', () => {
    expect(blockSize(90, 1.5, 1, 6)).toEqual({ w: 90, h: 60 })
  })
  it('adds the gutter between tiles of a row', () => {
    expect(blockSize(40, 0.5, 3, 6)).toEqual({ w: 3 * 40 + 2 * 6, h: 80 })
  })
  it('adds the gutter between tiles of a column', () => {
    expect(blockSize(90, 1.5, 2, 6)).toEqual({ w: 90, h: 2 * 60 + 6 })
  })
})

describe('maxFitTileWidth', () => {
  it('fills the box unturned or turned, whichever allows the wider tile', () => {
    // 3:2 tile in 190×277: unturned w ≤ 190; turned (tile h along x) w ≤ 277 and w/1.5 ≤ 190.
    expect(maxFitTileWidth(1.5, 1, 6, { w: 190, h: 277 })).toBeCloseTo(277, 12)
    expect(maxFitTileWidth(1, 1, 6, { w: 190, h: 277 })).toBeCloseTo(190, 12)
  })
  it('accounts for gutters between group tiles', () => {
    // row of 3 portrait 1:2 tiles in 100×300: (100 − 12)/3 = 29.33 unturned; turned: x-extent is tile h
    expect(maxFitTileWidth(0.5, 3, 6, { w: 100, h: 300 })).toBeCloseTo(50, 12)
  })
  it('is ≤ 0 when gutters alone do not fit', () => {
    expect(maxFitTileWidth(1, 5, 30, { w: 100, h: 100 })).toBeLessThanOrEqual(0)
  })
  it('gives a block that fits the box (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.2, max: 5, noNaN: true }),
        fc.integer({ min: 1, max: 4 }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 20, max: 1200, noNaN: true }),
        fc.double({ min: 20, max: 1200, noNaN: true }),
        (aspect, tiles, gutter, w, h) => {
          const fit = maxFitTileWidth(aspect, tiles, gutter, { w, h })
          fc.pre(fit > 0)
          const b = blockSize(fit, aspect, tiles, gutter)
          const unturned = b.w <= w + 1e-9 && b.h <= h + 1e-9
          const turned = b.h <= w + 1e-9 && b.w <= h + 1e-9
          expect(unturned || turned).toBe(true)
        },
      ),
    )
  })
})

describe('tileShortSide', () => {
  it('is the height of landscape tiles and the width of portrait tiles', () => {
    expect(tileShortSide(90, 1.5)).toBe(60)
    expect(tileShortSide(60, 2 / 3)).toBe(60)
  })
})

describe('tileRects', () => {
  it('lays a row left to right, gutter apart', () => {
    expect(tileRects(10, 20, 40, 0.5, 2, 6, false)).toEqual([
      { x: 10, y: 20, w: 40, h: 80 },
      { x: 56, y: 20, w: 40, h: 80 },
    ])
  })
  it('lays a column top to bottom, gutter apart', () => {
    expect(tileRects(10, 20, 90, 1.5, 2, 6, false)).toEqual([
      { x: 10, y: 20, w: 90, h: 60 },
      { x: 10, y: 86, w: 90, h: 60 },
    ])
  })
  it('turns a row clockwise into a column: tile 0 on top, printed tiles swapped', () => {
    expect(tileRects(10, 20, 40, 0.5, 2, 6, true)).toEqual([
      { x: 10, y: 20, w: 80, h: 40 },
      { x: 10, y: 66, w: 80, h: 40 },
    ])
  })
  it('turns a column clockwise into a row: tile 0 on the right', () => {
    expect(tileRects(10, 20, 90, 1.5, 2, 6, true)).toEqual([
      { x: 76, y: 20, w: 60, h: 90 },
      { x: 10, y: 20, w: 60, h: 90 },
    ])
  })
  it('turns a single tile by swapping its sides', () => {
    expect(tileRects(0, 0, 90, 1.5, 1, 6, true)).toEqual([{ x: 0, y: 0, w: 60, h: 90 }])
  })
})
