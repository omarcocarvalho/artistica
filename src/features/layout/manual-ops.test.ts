import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { layoutFromManual, type ManualLayout } from './manual'
import { moveBlock, moveToPage, nudge, resizeBlock, swapBlocks, type Corner } from './manual-ops'
import { item } from './test-support/fixtures'
import { block, blockOf, deepFreeze, manualOf } from './test-support/manual'
import type { LayoutItemInput } from './types'

// Content box (10, 10, 190 × 277), gutter 6.
const A4_PORTRAIT = { ...DEFAULT_PAGE_SETUP, orientation: 'portrait' as const }
const items: LayoutItemInput[] = deepFreeze([
  item('a', 1),
  item('b', 1),
  item('c', 1),
  item('wide', 1.5),
  item('tall', 2 / 3),
  item('fixed', 1, 1000, { kind: 'fixed', axis: 'width', mm: 40 }),
])

function ok(r: ReturnType<typeof moveBlock>): ManualLayout {
  if (!r.ok) throw new Error(`refused: ${r.reason}`)
  return r.manual
}

describe('moveBlock', () => {
  const start = manualOf([block('a#0', 10, 10, 50), block('b#0', 100, 100, 50)])

  it('moves only that block', () => {
    const out = ok(moveBlock(start, 'a#0', 0, 20, 200, items))
    expect(blockOf(out, 'a#0')).toEqual({ ...blockOf(start, 'a#0'), x: 20, y: 200 })
    expect(blockOf(out, 'b#0')).toEqual(blockOf(start, 'b#0'))
    expect(out.pageCount).toBe(1)
  })

  it('refuses an overlap', () => {
    expect(moveBlock(start, 'a#0', 0, 120, 120, items)).toEqual({ ok: false, reason: 'overlap' })
  })

  it('refuses a block inside the gutter of another', () => {
    expect(moveBlock(start, 'a#0', 0, 45, 100, items)).toEqual({ ok: false, reason: 'overlap' })
  })

  it('refuses a spot past the margins', () => {
    expect(moveBlock(start, 'a#0', 0, 5, 10, items)).toEqual({ ok: false, reason: 'outside' })
    expect(moveBlock(start, 'a#0', 0, 10, 240, items)).toEqual({ ok: false, reason: 'outside' })
  })

  it('refuses a page that does not exist', () => {
    expect(moveBlock(start, 'a#0', 1, 10, 10, items)).toEqual({ ok: false, reason: 'outside' })
  })

  it('keeps blocks sorted by page, y, x', () => {
    const out = ok(moveBlock(start, 'b#0', 0, 10, 10 + 50 + 6, items))
    expect(out.blocks.map((b) => b.blockId)).toEqual(['a#0', 'b#0'])
    const back = ok(moveBlock(out, 'a#0', 0, 10, 200, items))
    expect(back.blocks.map((b) => b.blockId)).toEqual(['b#0', 'a#0'])
  })

  it('moves to another page and removes the page it leaves empty (M5-R16)', () => {
    const two = manualOf([block('a#0', 10, 10, 50), block('b#0', 10, 10, 50, 1)], 2)
    const out = ok(moveBlock(two, 'a#0', 1, 100, 100, items))
    expect(out.pageCount).toBe(1)
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 100, y: 100 })
    expect(blockOf(out, 'b#0').page).toBe(0)
  })

  it('throws on an unknown block', () => {
    expect(() => moveBlock(start, 'nope#0', 0, 10, 10, items)).toThrow(RangeError)
  })

  it('throws on a block whose photo is gone', () => {
    const rest = items.filter((it) => it.imageId !== 'a')
    expect(() => moveBlock(start, 'a#0', 0, 10, 10, rest)).toThrow(RangeError)
  })
})

describe('nudge', () => {
  it('moves by whole millimetres', () => {
    const m = manualOf([block('a#0', 100, 100, 50)])
    expect(blockOf(ok(nudge(m, 'a#0', 1, 0, items)), 'a#0')).toMatchObject({ x: 101, y: 100 })
    expect(blockOf(ok(nudge(m, 'a#0', 0, -3, items)), 'a#0')).toMatchObject({ x: 100, y: 97 })
    expect(blockOf(ok(nudge(m, 'a#0', 1.4, 0, items)), 'a#0')).toMatchObject({ x: 101 })
  })

  it('stops flush with a neighbour, a gutter apart', () => {
    // a ends at 60; b starts at 66.4: 0.4 mm of room before the gutter.
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 66.4, 10, 50)])
    const out = ok(nudge(m, 'a#0', 1, 0, items))
    expect(blockOf(out, 'a#0').x).toBeCloseTo(10.4, 9)
    expect(nudge(out, 'a#0', 1, 0, items)).toEqual({ ok: false, reason: 'blocked' })
  })

  it('never jumps over another photo', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 80, 10, 50)])
    const out = ok(nudge(m, 'a#0', 100, 0, items))
    expect(blockOf(out, 'a#0').x).toBeCloseTo(80 - 6 - 50, 9)
  })

  it('stops at the margin', () => {
    const m = manualOf([block('a#0', 10.6, 10, 50)])
    expect(blockOf(ok(nudge(m, 'a#0', -1, 0, items)), 'a#0').x).toBeCloseTo(10, 9)
    expect(nudge(manualOf([block('a#0', 10, 10, 50)]), 'a#0', -1, 0, items)).toEqual({
      ok: false,
      reason: 'blocked',
    })
  })

  it('slides along a neighbour it touches', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 10, 66, 50)])
    expect(blockOf(ok(nudge(m, 'a#0', 1, 0, items)), 'a#0').x).toBe(11)
  })

  it('moves away from a neighbour it is flush with', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 66, 10, 50)])
    expect(blockOf(ok(nudge(m, 'b#0', 1, 0, items)), 'b#0').x).toBe(67)
    expect(blockOf(ok(nudge(m, 'a#0', 0, 1, items)), 'a#0').y).toBe(11)
  })

  it('stops flush with the bottom and right margins', () => {
    // Bottom margin at 287, right margin at 200.
    const m = manualOf([block('a#0', 149.5, 236.6, 50)])
    expect(blockOf(ok(nudge(m, 'a#0', 0, 1, items)), 'a#0').y).toBeCloseTo(237, 9)
    expect(blockOf(ok(nudge(m, 'a#0', 1, 0, items)), 'a#0').x).toBeCloseTo(150, 9)
    const low = manualOf([block('a#0', 100, 236.6, 50)])
    expect(blockOf(ok(nudge(low, 'a#0', 0, 5, items)), 'a#0').y).toBeCloseTo(237, 9)
  })

  it('moves diagonally until the first contact', () => {
    const m = manualOf([block('a#0', 100, 100, 50)])
    const out = ok(nudge(m, 'a#0', 200, 200, items))
    // The right margin (200) is hit first: x 150, y 150 at the same fraction of the way.
    expect(blockOf(out, 'a#0').x).toBeCloseTo(150, 9)
    expect(blockOf(out, 'a#0').y).toBeCloseTo(150, 9)
  })

  it('refuses a zero nudge', () => {
    const m = manualOf([block('a#0', 100, 100, 50)])
    expect(nudge(m, 'a#0', 0, 0, items)).toEqual({ ok: false, reason: 'blocked' })
  })
})

describe('resizeBlock', () => {
  const m = manualOf([block('a#0', 100, 100, 50)])

  it.each<[Corner, number, number]>([
    ['tl', 100, 100],
    ['tr', 90, 100],
    ['bl', 100, 90],
    ['br', 90, 90],
  ])('keeps the %s corner put', (anchor, x, y) => {
    const out = blockOf(ok(resizeBlock(m, 'a#0', 60, anchor, items)), 'a#0')
    expect(out.tileW).toBe(60)
    expect(out.x).toBeCloseTo(x, 9)
    expect(out.y).toBeCloseTo(y, 9)
  })

  it('keeps the aspect: a 3:2 tile resized to 90 mm wide is 60 mm tall', () => {
    const w = manualOf([block('wide#0', 10, 10, 60)])
    const out = ok(resizeBlock(w, 'wide#0', 90, 'tl', items))
    const tile = layoutFromManual(out, items, A4_PORTRAIT).pages[0]?.placements[0]?.tiles[0]
    expect(tile).toEqual({ x: 10, y: 10, w: 90, h: 60 })
  })

  it('clamps to the minimum', () => {
    expect(blockOf(ok(resizeBlock(m, 'a#0', 5, 'tl', items)), 'a#0').tileW).toBe(20)
    const small = manualOf([block('a#0', 100, 100, 20)])
    expect(resizeBlock(small, 'a#0', 10, 'tl', items)).toEqual({ ok: false, reason: 'min' })
  })

  it('grows up to a neighbour and stops a gutter away', () => {
    const two = manualOf([block('a#0', 10, 10, 50), block('b#0', 80, 10, 50)])
    const out = blockOf(ok(resizeBlock(two, 'a#0', 100, 'tl', items)), 'a#0')
    expect(out.tileW).toBeCloseTo(80 - 6 - 10, 6)
    expect(out.tileW).toBeLessThanOrEqual(64 + 1e-9)
    const full = manualOf([block('a#0', 10, 10, 64), block('b#0', 80, 10, 50)])
    expect(resizeBlock(full, 'a#0', 70, 'tl', items)).toEqual({ ok: false, reason: 'blocked' })
  })

  it('grows up to the margin', () => {
    const out = blockOf(ok(resizeBlock(m, 'a#0', 500, 'tl', items)), 'a#0')
    expect(out.tileW).toBeCloseTo(100, 6)
  })

  it('may go past the photo’s 300 DPI width (M5-R12)', () => {
    const soft = [item('a', 1, 30)]
    expect(blockOf(ok(resizeBlock(m, 'a#0', 80, 'tl', soft)), 'a#0').tileW).toBe(80)
  })

  it('refuses a fixed-size photo (M5-R12)', () => {
    const f = manualOf([block('fixed#0', 10, 10, 40)])
    expect(resizeBlock(f, 'fixed#0', 60, 'tl', items)).toEqual({ ok: false, reason: 'fixed' })
  })
})

describe('swapBlocks (M5-R11)', () => {
  it('fits each block in the other’s box, top-left anchored, at its larger turn', () => {
    // wide: 1.5:1, 90 × 60 at (10, 10). tall: 2:3, 40 × 60 at (110, 10), page 1.
    const m = manualOf([block('wide#0', 10, 10, 90), block('tall#0', 110, 10, 40, 1)], 2)
    const out = ok(swapBlocks(m, 'wide#0', 'tall#0', items))
    // wide in a 40 × 60 box: unturned 40 wide, turned 60 wide (40 × 60 printed) → turned.
    expect(blockOf(out, 'wide#0')).toMatchObject({ page: 1, x: 110, y: 10, turned: true })
    expect(blockOf(out, 'wide#0').tileW).toBeCloseTo(60, 9)
    // tall in a 90 × 60 box: unturned 40 wide, turned 60 wide (90 × 60 printed) → turned.
    expect(blockOf(out, 'tall#0')).toMatchObject({ page: 0, x: 10, y: 10, turned: true })
    expect(blockOf(out, 'tall#0').tileW).toBeCloseTo(60, 9)
  })

  it('keeps the current turn on a tie', () => {
    const m = manualOf([{ ...block('a#0', 10, 10, 50), turned: true }, block('b#0', 100, 10, 70)])
    const out = ok(swapBlocks(m, 'a#0', 'b#0', items))
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 100, tileW: 70, turned: true })
    expect(blockOf(out, 'b#0')).toMatchObject({ x: 10, tileW: 50, turned: false })
  })

  it('keeps a fixed size and swaps when it fits the other box', () => {
    const m = manualOf([block('fixed#0', 10, 10, 40), block('a#0', 100, 100, 70)])
    const out = ok(swapBlocks(m, 'fixed#0', 'a#0', items))
    expect(blockOf(out, 'fixed#0')).toMatchObject({ x: 100, y: 100, tileW: 40 })
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 10, y: 10, tileW: 40 })
  })

  it('turns a fixed size when only its turn fits the other box', () => {
    // A 3:2 fixed photo, 60 × 40, into the 40 × 60 box of a 2:3 photo 40 mm wide.
    const fixedWide = item('fw', 1.5, 1000, { kind: 'fixed', axis: 'width', mm: 60 })
    const m = manualOf([block('fw#0', 10, 10, 60), block('tall#0', 100, 100, 40)])
    const out = ok(swapBlocks(m, 'fw#0', 'tall#0', [...items, fixedWide]))
    expect(blockOf(out, 'fw#0')).toMatchObject({ x: 100, y: 100, tileW: 60, turned: true })
  })

  it('throws when a block is swapped with itself', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 100, 100, 50)])
    expect(() => swapBlocks(m, 'a#0', 'a#0', items)).toThrow(RangeError)
  })

  it('refuses a fixed size that does not fit the other box', () => {
    const m = manualOf([block('fixed#0', 10, 10, 40), block('a#0', 100, 100, 30)])
    expect(swapBlocks(m, 'fixed#0', 'a#0', items)).toEqual({ ok: false, reason: 'does-not-fit' })
  })

  it('refuses a swap that would shrink a photo under the minimum', () => {
    // A 4-tile row block (4 × 30 + 18 = 138 × 30) into a 25 mm square: tiles of (25 − 18) / 4 mm.
    const groups = [...items, item('g', 1, 1000, { kind: 'auto' }, 4)]
    const m = manualOf([block('g#0', 10, 10, 30), block('a#0', 10, 100, 25)])
    expect(swapBlocks(m, 'g#0', 'a#0', groups)).toEqual({ ok: false, reason: 'does-not-fit' })
  })
})

describe('moveToPage (M5-R13)', () => {
  it('places the block where findSpot finds room on that page', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 10, 10, 50, 1)], 2)
    const out = ok(moveToPage(m, 'a#0', 1, items))
    const a = blockOf(out, 'a#0')
    expect(out.pageCount).toBe(1)
    expect(a.page).toBe(0)
    expect(a.tileW).toBe(50)
    // Next to b, a gutter apart, or under it.
    expect([a.x, a.y]).not.toEqual([10, 10])
    expect(a.x === 66 || a.y === 66).toBe(true)
  })

  it('makes a new last page for page === pageCount', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 100, 100, 50)])
    const out = ok(moveToPage(m, 'a#0', 1, items))
    expect(out.pageCount).toBe(2)
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 1, x: 10, y: 10, tileW: 50 })
  })

  it('keeps the size, and turns the block when findSpot turns it', () => {
    // 3:2 tile 60 mm wide, turned: 40 × 60 printed. On an empty page bssf prefers it 60 × 40.
    const m = manualOf([
      { ...block('wide#0', 10, 10, 60), turned: true },
      block('a#0', 100, 100, 50),
    ])
    const out = ok(moveToPage(m, 'wide#0', 1, items))
    expect(blockOf(out, 'wide#0')).toMatchObject({ page: 1, tileW: 60, turned: false })
    const placed = layoutFromManual(out, items, A4_PORTRAIT).pages[1]?.placements[0]
    expect(placed?.block).toEqual({ x: 10, y: 10, w: 60, h: 40 })
  })

  it('renumbers pages after the move leaves one empty', () => {
    const m = manualOf(
      [block('a#0', 10, 10, 50), block('b#0', 10, 10, 50, 1), block('c#0', 10, 10, 50, 2)],
      3,
    )
    const out = ok(moveToPage(m, 'b#0', 2, items))
    expect(out.pageCount).toBe(2)
    expect(blockOf(out, 'a#0').page).toBe(0)
    expect(blockOf(out, 'b#0').page).toBe(1)
    expect(blockOf(out, 'c#0').page).toBe(1)
  })

  it('places a block as wide as the content box, flush with both margins', () => {
    const m = manualOf([block('a#0', 10, 10, 190), block('b#0', 10, 10, 50, 1)], 2)
    const out = ok(moveToPage(m, 'b#0', 2, items))
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 10, y: 10, tileW: 190 })
    const full = ok(moveToPage(out, 'a#0', 2, items))
    expect(blockOf(full, 'a#0')).toMatchObject({ page: 1, x: 10, y: 10, tileW: 190 })
  })

  it('refuses a page with no room', () => {
    const m = manualOf([block('a#0', 10, 10, 100), block('b#0', 10, 10, 190, 1)], 2)
    expect(moveToPage(m, 'a#0', 1, items)).toEqual({ ok: false, reason: 'does-not-fit' })
  })

  it('refuses a page past the new last page', () => {
    const m = manualOf([block('a#0', 10, 10, 50)])
    expect(moveToPage(m, 'a#0', 2, items)).toEqual({ ok: false, reason: 'outside' })
  })
})

describe('purity', () => {
  it('never mutates the input (it is deep-frozen) and refuses with the input intact', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 100, 100, 50)])
    const before = JSON.stringify(m)
    moveBlock(m, 'a#0', 0, 20, 20, items)
    moveBlock(m, 'a#0', 0, 100, 100, items)
    nudge(m, 'a#0', 5, 5, items)
    resizeBlock(m, 'a#0', 30, 'br', items)
    swapBlocks(m, 'a#0', 'b#0', items)
    moveToPage(m, 'a#0', 1, items)
    expect(JSON.stringify(m)).toBe(before)
  })
})
