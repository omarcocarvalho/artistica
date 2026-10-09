import { describe, expect, it } from 'vitest'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import type { PageModel } from '../features/render'
import { describePage } from './describe-page'

const a = 'a' as ImageId
const b = 'b' as ImageId
const model = {
  index: 0,
  size: { w: 210, h: 297 },
  safeArea: { x: 5, y: 5, w: 200, h: 287 },
  cropMarks: [],
  lines: [],
  tiles: [
    { imageId: a, version: 'original', trim: { x: 10, y: 10, w: 100.04, h: 60.06 } },
    { imageId: b, version: 'blurred', trim: { x: 10, y: 80, w: 50, h: 50 } },
  ],
} as unknown as PageModel

describe('describePage', () => {
  it('lists each tile with its image name and size rounded to 0.1 mm, in model order', () => {
    expect(
      describePage(
        model,
        new Map([
          [a, 'anna.jpg'],
          [b, 'pears.heic'],
        ]),
      ),
    ).toEqual([
      {
        imageId: a,
        name: 'anna.jpg',
        version: 'original',
        widthMm: 100,
        heightMm: 60.1,
        lines: [],
      },
      { imageId: b, name: 'pears.heic', version: 'blurred', widthMm: 50, heightMm: 50, lines: [] },
    ])
  })
  it('falls back to the id when a name is unknown', () => {
    expect(describePage(model, new Map())[0]?.name).toBe('a')
  })
  it('names the line types each tile prints, found by tile index (M3-R20)', () => {
    const withLines = {
      ...model,
      tiles: [
        ...model.tiles,
        { imageId: a, version: 'values', trim: { x: 70, y: 80, w: 50, h: 50 } },
      ],
      lines: [
        { tileIndex: 2, types: ['grid', 'centre'] },
        { tileIndex: 0, types: ['thirds'] },
      ],
    } as unknown as PageModel
    expect(describePage(withLines, new Map()).map((d) => d.lines)).toEqual([
      ['thirds'],
      [],
      ['grid', 'centre'],
    ])
  })
  it('lists switched-on guide types after the composition types, found or not (M4-R22)', () => {
    const withGuides = {
      ...model,
      lines: [
        { tileIndex: 0, types: ['thirds', 'edges'] },
        { tileIndex: 1, types: ['centre', 'face'] },
      ],
    } as unknown as PageModel
    const lines = new Map([
      [a, { ...DEFAULT_LINES, thirds: true, edges: { on: true, detailPct: 50 }, pose: true }],
      [b, { ...DEFAULT_LINES, centre: true, face: true }],
    ])
    expect(describePage(withGuides, new Map(), lines).map((d) => d.lines)).toEqual([
      ['thirds', 'edges', 'pose'],
      ['centre', 'face'],
    ])
  })
  it('names a guide that found nothing on a tile with no line entry at all', () => {
    const lines = new Map([
      [b, { ...DEFAULT_LINES, face: true, edges: { on: true, detailPct: 9 } }],
    ])
    expect(describePage(model, new Map(), lines).map((d) => d.lines)).toEqual([
      [],
      ['edges', 'face'],
    ])
  })
  it('never names a guide type the image has switched off, even if the model drew it', () => {
    const stale = {
      ...model,
      lines: [{ tileIndex: 0, types: ['grid', 'face'] }],
    } as unknown as PageModel
    const lines = new Map([[a, { ...DEFAULT_LINES, grid: { on: true, cols: 4, rows: 5 } }]])
    expect(describePage(stale, new Map(), lines)[0]?.lines).toEqual(['grid'])
  })
})
