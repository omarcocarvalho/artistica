import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import {
  blockIdOf,
  isValidPlacement,
  layoutFromManual,
  manualFromLayout,
  MIN_MANUAL_SHORT_MM,
  type ManualBlock,
} from './manual'
import { itemsArb, pageSetupArb } from './test-support/arbitraries'
import { item, realisticItems } from './test-support/fixtures'
import { block, deepFreeze, manualOf } from './test-support/manual'
import type { LayoutItemInput } from './types'

const A4_PORTRAIT: PageSetup = { ...DEFAULT_PAGE_SETUP, orientation: 'portrait' }

describe('blockIdOf', () => {
  it.each([
    ['abc~0#2', 'img-1', 'img-1#2'],
    ['h~3#0', 'img-2', 'img-2#0'],
    ['h~0#12', 'img-3', 'img-3#12'],
  ])('key %s of image %s is block %s', (key, imageId, expected) => {
    expect(blockIdOf({ ...item('x', 1), key, imageId: imageId as ImageId })).toBe(expected)
  })

  it('keeps two same-hash photos apart: the image id differs', () => {
    const a = { ...item('x', 1), key: 'h~0#0', imageId: 'a' as ImageId }
    const b = { ...item('x', 1), key: 'h~1#0', imageId: 'b' as ImageId }
    expect(blockIdOf(a)).not.toBe(blockIdOf(b))
  })
})

describe('manualFromLayout and layoutFromManual', () => {
  const cases: [string, PageSetup, LayoutItemInput[]][] = [
    ['realistic, A4 auto', DEFAULT_PAGE_SETUP, realisticItems(12, 3)],
    [
      'realistic, Letter landscape',
      { ...DEFAULT_PAGE_SETUP, paper: 'Letter', orientation: 'landscape' },
      realisticItems(7, 9),
    ],
    [
      'groups of study versions',
      A4_PORTRAIT,
      [
        item('a', 1.5, 1000, { kind: 'auto' }, 3),
        item('b', 2 / 3, 1000, { kind: 'auto' }, 2),
        item('c', 1, 40),
      ],
    ],
    [
      'a fixed size scaled to fit',
      A4_PORTRAIT,
      [item('big', 1, 1000, { kind: 'fixed', axis: 'width', mm: 900 }), item('s', 1.5)],
    ],
  ]

  it.each(cases)('round-trips the auto layout (%s)', (_, setup, items) => {
    const result = computeLayout(setup, items)
    const manual = manualFromLayout(deepFreeze(result), deepFreeze(items), setup)
    expect(layoutFromManual(deepFreeze(manual), items, setup)).toEqual(result)
  })

  it('leaves out placements and blocks whose photo is gone', () => {
    const items = [item('a', 1), item('b', 1.5)]
    const result = computeLayout(A4_PORTRAIT, items)
    const rest = items.filter((it) => it.imageId !== 'b')
    const manual = manualFromLayout(result, rest, A4_PORTRAIT)
    expect(manual.blocks.map((b) => b.blockId)).toEqual(['a#0'])
    const full = manualFromLayout(result, items, A4_PORTRAIT)
    const out = layoutFromManual(full, rest, A4_PORTRAIT)
    expect(out.pages.flatMap((p) => p.placements.map((pl) => pl.key))).toEqual([items[0]?.key])
  })

  it('carries the turned flag and the unturned tile width', () => {
    const setup = A4_PORTRAIT
    const items = [item('wide', 3), item('wide2', 3)]
    const result = computeLayout(setup, items)
    const manual = manualFromLayout(result, items, setup)
    const placements = result.pages.flatMap((p) => p.placements)
    expect(placements.some((p) => p.turned)).toBe(true)
    for (const p of placements) {
      const b = manual.blocks.find((x) => x.blockId === `${p.imageId}#0`)
      const t = p.tiles[0]
      expect(b?.turned).toBe(p.turned)
      expect(b?.tileW).toBe(p.turned ? t?.h : t?.w)
    }
  })

  it('records the page, the content box, the gutter and sorted blocks', () => {
    const items = realisticItems(20, 5)
    const result = computeLayout(A4_PORTRAIT, items)
    const manual = manualFromLayout(result, items, A4_PORTRAIT)
    expect(manual.orientation).toBe('portrait')
    expect(manual.pageSize).toEqual({ w: 210, h: 297 })
    expect(manual.content).toEqual({ x: 10, y: 10, w: 190, h: 277 })
    expect(manual.gutter).toBe(6)
    expect(manual.pageCount).toBe(result.pages.length)
    expect(manual.blocks).toHaveLength(20)
    const sorted = [...manual.blocks].sort(
      (a, b) => a.page - b.page || a.y - b.y || a.x - b.x || (a.blockId < b.blockId ? -1 : 1),
    )
    expect(manual.blocks).toEqual(sorted)
  })

  it('flags low-dpi from the tile width alone, and scaled-to-fit only on a fixed size larger than the content box', () => {
    const items = [
      item('soft', 1, 30),
      item('fixed', 1, 1000, { kind: 'fixed', axis: 'width', mm: 900 }),
      item('fits', 1, 1000, { kind: 'fixed', axis: 'width', mm: 40 }),
      item('auto', 1, 1000),
      item('both', 1, 50, { kind: 'fixed', axis: 'height', mm: 300 }),
    ]
    const manual = manualOf([
      block('soft#0', 10, 10, 50),
      block('fixed#0', 10, 70, 100),
      block('fits#0', 120, 10, 40),
      block('auto#0', 120, 70, 190),
      block('both#0', 10, 180, 100),
    ])
    const out = layoutFromManual(manual, items, A4_PORTRAIT)
    const byId = new Map(out.pages.flatMap((p) => p.placements).map((p) => [p.imageId, p]))
    expect(byId.get('soft' as ImageId)?.warnings).toEqual(['low-dpi'])
    expect(byId.get('fixed' as ImageId)?.warnings).toEqual(['scaled-to-fit'])
    expect(byId.get('fits' as ImageId)?.warnings).toEqual([])
    expect(byId.get('auto' as ImageId)?.warnings).toEqual([])
    expect(byId.get('both' as ImageId)?.warnings).toEqual(['low-dpi', 'scaled-to-fit'])
  })

  it('sorts placements as the engine does, whatever order the blocks come in', () => {
    const items = [item('a', 1), item('b', 1), item('c', 1)]
    const manual = manualOf([
      block('c#0', 10, 100, 30),
      block('b#0', 50, 10, 30),
      block('a#0', 10, 10, 30),
    ])
    const out = layoutFromManual(manual, items, A4_PORTRAIT)
    expect(out.pages[0]?.placements.map((p) => p.key)).toEqual(['a#0', 'b#0', 'c#0'])
  })

  it('round-trips any auto layout (property)', { timeout: 15_000 }, () => {
    fc.assert(
      fc.property(pageSetupArb, itemsArb(10), (setup, items) => {
        const result = computeLayout(setup, items)
        const manual = manualFromLayout(result, items, setup)
        expect(layoutFromManual(manual, items, setup)).toEqual(result)
      }),
      { numRuns: 100 },
    )
  })

  it('makes a valid manual layout from any auto layout (property)', { timeout: 15_000 }, () => {
    fc.assert(
      fc.property(pageSetupArb, itemsArb(10), (setup, items) => {
        const manual = manualFromLayout(computeLayout(setup, items), items, setup)
        for (const b of manual.blocks) expect(isValidPlacement(manual, b, items)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

describe('isValidPlacement (M5-R9)', () => {
  // Content box (10, 10, 190 × 277), gutter 6; the other photo is a 50 mm square at (100, 100).
  const other = block('b#0', 100, 100, 50)
  const items = [item('a', 1), item('b', 1)]
  const at = (x: number, y: number, tileW = 50, page = 0): ManualBlock =>
    block('a#0', x, y, tileW, page)

  it.each<[string, ManualBlock, boolean]>([
    ['right of it, exactly the gutter apart', at(156, 100, 40), true],
    ['right of it, 0.01 mm closer', at(155.99, 100, 40), false],
    ['left of it, exactly the gutter apart', at(44, 100), true],
    ['left of it, 0.01 mm closer', at(44.01, 100), false],
    ['below it, exactly the gutter apart', at(100, 156), true],
    ['below it, 0.01 mm closer', at(100, 155.99), false],
    ['above it, exactly the gutter apart', at(100, 44), true],
    ['above it, 0.01 mm closer', at(100, 44.01), false],
    ['diagonal, within the gutter on x but apart on y', at(46, 156), true],
    ['flush with the content box top-left', at(10, 10), true],
    ['0.01 mm past the left margin', at(9.99, 10), false],
    ['flush with the content box bottom-right', at(150, 237), true],
    ['0.01 mm past the right margin', at(150.01, 10), false],
    ['0.01 mm past the bottom margin', at(10, 237.01), false],
    ['on top of it, but on another page', at(100, 100, 50, 1), true],
    ['on a page that does not exist', at(10, 10, 50, 2), false],
    ['at the 20 mm minimum', at(10, 10, 20), true],
    ['just under the 20 mm minimum', at(10, 10, 19.99), false],
  ])('%s → %s', (_, candidate, valid) => {
    const manual = manualOf([other], 2)
    expect(isValidPlacement(manual, candidate, items)).toBe(valid)
  })

  it('ignores the block itself when it is already in the layout', () => {
    const manual = manualOf([at(10, 10), other])
    expect(isValidPlacement(manual, at(12, 10), items)).toBe(true)
  })

  it('measures the minimum on the tile short side, not its width', () => {
    const wide = [item('a', 2)]
    const manual = manualOf([])
    expect(isValidPlacement(manual, at(10, 10, 40), wide)).toBe(true) // 40 × 20
    expect(isValidPlacement(manual, at(10, 10, 39.9), wide)).toBe(false)
  })

  it('holds a fixed-size photo to its own size, not the minimum', () => {
    const fixed = [item('a', 1, 1000, { kind: 'fixed', axis: 'width', mm: 10 })]
    expect(isValidPlacement(manualOf([]), at(10, 10, 10), fixed)).toBe(true)
  })

  it('lowers the minimum to the largest size the block can take', () => {
    // Four 1:1 tiles in a 60 mm square box, either turn: at most (60 − 18) / 4 = 10.5 mm each.
    const narrow = { ...manualOf([]), content: { x: 10, y: 10, w: 60, h: 60 } }
    const four = [item('a', 1, 1000, { kind: 'auto' }, 4)]
    expect(isValidPlacement(narrow, at(10, 10, 10.5), four)).toBe(true)
    expect(isValidPlacement(narrow, at(10, 10, 10.4), four)).toBe(false)
  })

  it('rejects a block with no matching photo', () => {
    expect(isValidPlacement(manualOf([]), block('ghost#0', 10, 10, 50), items)).toBe(false)
  })

  it('checks study-version groups by their whole block', () => {
    // Three 1:1 tiles in a row: 3 × 30 + 2 × 6 = 102 mm wide.
    const group = [item('a', 1, 1000, { kind: 'auto' }, 3), item('b', 1)]
    const manual = manualOf([other])
    expect(isValidPlacement(manual, at(10, 160, 30), group)).toBe(true)
    expect(isValidPlacement(manual, at(10, 100, 30), group)).toBe(false) // 10 + 102 + 6 > 100
  })

  it('exports the 20 mm minimum', () => {
    expect(MIN_MANUAL_SHORT_MM).toBe(20)
  })
})
