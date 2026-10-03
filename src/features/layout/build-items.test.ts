import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITS,
  MAX_COPIES,
  type ImageDescriptor,
  type ImageId,
} from '../../shared/model/image'
import { buildLayoutItems } from './build-items'

const img = (
  id: string,
  pxW: number,
  pxH: number,
  edits: Partial<ImageDescriptor['edits']> = {},
): ImageDescriptor => ({
  id: id as ImageId,
  pxW,
  pxH,
  edits: { ...DEFAULT_EDITS, ...edits },
})

describe('buildLayoutItems', () => {
  it('returns no items for no images', () => {
    expect(buildLayoutItems([])).toEqual([])
  })

  it('computes aspect and the 300-DPI width cap from the printed pixel size', () => {
    const [item] = buildLayoutItems([img('a', 3000, 2000)])
    expect(item).toEqual({
      key: 'a#0',
      imageId: 'a',
      aspect: 1.5,
      maxPrintWidthMm: 254, // 3000 px / 300 DPI × 25.4
      size: { kind: 'auto' },
      tiles: 1,
    })
  })

  it('uses the crop, then the rotation', () => {
    const [item] = buildLayoutItems([
      img('a', 4000, 3000, { crop: { x: 0, y: 0, w: 1200, h: 3000 }, rotation: 90 }),
    ])
    // cropped 1200×3000, turned 90° → printed 3000×1200
    expect(item?.aspect).toBe(2.5)
    expect(item?.maxPrintWidthMm).toBeCloseTo(254, 10)
  })

  it('expands copies into separate items with stable keys, in input order', () => {
    const items = buildLayoutItems([img('a', 100, 100, { copies: 3 }), img('b', 100, 50)])
    expect(items.map((i) => i.key)).toEqual(['a#0', 'a#1', 'a#2', 'b#0'])
  })

  it('clamps copies to 1..MAX_COPIES and floors fractions', () => {
    expect(buildLayoutItems([img('a', 10, 10, { copies: 0 })])).toHaveLength(1)
    expect(buildLayoutItems([img('a', 10, 10, { copies: 2.7 })])).toHaveLength(2)
    expect(buildLayoutItems([img('a', 10, 10, { copies: 999 })])).toHaveLength(MAX_COPIES)
    expect(buildLayoutItems([img('a', 10, 10, { copies: Number.NaN })])).toHaveLength(1)
  })

  it('passes the size mode through', () => {
    const size = { kind: 'fixed', axis: 'height', mm: 80 } as const
    expect(buildLayoutItems([img('a', 10, 10, { size })])[0]?.size).toEqual(size)
  })

  it('skips images without pixels', () => {
    expect(buildLayoutItems([img('a', 0, 10), img('b', 10, Number.NaN)])).toEqual([])
  })
})
