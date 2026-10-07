import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITS,
  MAX_COPIES,
  type ImageDescriptor,
  type ImageId,
} from '../../shared/model/image'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { buildLayoutItems } from './build-items'
import { computeLayout } from './compute-layout'

const img = (
  id: string,
  pxW: number,
  pxH: number,
  edits: Partial<ImageDescriptor['edits']> = {},
  contentHash = `h-${id}`,
): ImageDescriptor => ({
  id: id as ImageId,
  contentHash,
  pxW,
  pxH,
  edits: { ...DEFAULT_EDITS, ...edits },
  study: DEFAULT_STUDY,
})

/** Placements as (content hash, page, block), so sessions with different random ids compare equal. */
function arrangement(images: readonly ImageDescriptor[]) {
  const hashOf = new Map(images.map((i) => [i.id as string, i.contentHash]))
  const result = computeLayout(DEFAULT_PAGE_SETUP, buildLayoutItems(images))
  return result.pages.flatMap((p, page) =>
    p.placements.map((pl) => ({ hash: hashOf.get(pl.imageId), page, block: pl.block })),
  )
}

describe('buildLayoutItems', () => {
  it('returns no items for no images', () => {
    expect(buildLayoutItems([])).toEqual([])
  })

  it('computes aspect and the 300-DPI width cap from the printed pixel size', () => {
    const [item] = buildLayoutItems([img('a', 3000, 2000)])
    expect(item).toEqual({
      key: 'h-a~0#0',
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
    expect(items.map((i) => i.key)).toEqual(['h-a~0#0', 'h-a~0#1', 'h-a~0#2', 'h-b~0#0'])
    expect(items.map((i) => i.imageId)).toEqual(['a', 'a', 'a', 'b'])
  })

  it('keys by content hash, not by image id', () => {
    const items = buildLayoutItems([img('zzz', 10, 10, {}, 'aaa'), img('aaa', 10, 10, {}, 'zzz')])
    expect(items.map((i) => [i.key, i.imageId])).toEqual([
      ['aaa~0#0', 'zzz'],
      ['zzz~0#0', 'aaa'],
    ])
  })

  it('gives images with the same bytes distinct keys, numbered in input order', () => {
    const items = buildLayoutItems([
      img('x', 10, 10, { copies: 2 }, 'same'),
      img('y', 10, 10, {}, 'other'),
      img('z', 10, 10, {}, 'same'),
    ])
    expect(items.map((i) => i.key)).toEqual(['same~0#0', 'same~0#1', 'other~0#0', 'same~1#0'])
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length)
    expect(() => computeLayout(DEFAULT_PAGE_SETUP, items)).not.toThrow()
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

describe('layout of loaded images', () => {
  // Two equal-size images with different bytes: only the tie-break decides which goes first.
  const session = (idA: string, idB: string) => [
    img(idA, 3000, 2000, {}, 'bytes-a'),
    img(idB, 3000, 2000, {}, 'bytes-b'),
  ]

  it('is the same across sessions whose random ids sort the other way', () => {
    const first = arrangement(session('1111', '9999'))
    const second = arrangement(session('9999', '1111'))
    expect(first.map((p) => p.hash)).toEqual(['bytes-a', 'bytes-b'])
    expect(second).toEqual(first)
  })

  it('is the same when the images are added in the other order', () => {
    const [a, b] = session('1111', '9999') as [ImageDescriptor, ImageDescriptor]
    const fresh = session('5555', '2222') as [ImageDescriptor, ImageDescriptor]
    expect(arrangement([fresh[1], fresh[0]])).toEqual(arrangement([a, b]))
  })
})
