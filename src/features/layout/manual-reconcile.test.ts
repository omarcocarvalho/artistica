import { describe, expect, it } from 'vitest'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import {
  isValidPlacement,
  layoutFromManual,
  manualFromLayout,
  type ManualBlock,
  type ManualLayout,
} from './manual'
import { packAround, reconcileManual } from './manual-reconcile'
import { item, realisticItems } from './test-support/fixtures'
import { block, blockOf, deepFreeze, manualOf, withoutScaledToFit } from './test-support/manual'
import type { LayoutItemInput, LayoutResult, ManualOutcome } from './types'

// Content box (10, 10, 190 × 277), gutter 6.
const A4_PORTRAIT: PageSetup = { ...DEFAULT_PAGE_SETUP, orientation: 'portrait' }

const shaped = (b: ManualBlock, aspect: number, tiles = 1): ManualBlock => ({
  ...b,
  shape: { aspect, tiles },
})

const fixed = (mm: number) => ({ kind: 'fixed' as const, axis: 'width' as const, mm })

function split(r: LayoutResult): { rest: LayoutResult; outcome: ManualOutcome } {
  const { manual, ...rest } = r
  if (manual === undefined) throw new Error('no manual outcome')
  return { rest, outcome: manual }
}

function arranged(r: LayoutResult, kind: 'kept' | 'adjusted'): ManualLayout {
  const { outcome } = split(r)
  expect(outcome.kind).toBe(kind)
  if (outcome.kind === 'dropped') throw new Error(`dropped: ${outcome.reason}`)
  return outcome.manual
}

function expectAllValid(m: ManualLayout, items: readonly LayoutItemInput[]): void {
  for (const b of m.blocks) expect(isValidPlacement(m, b, items)).toBe(true)
}

describe('reconcileManual: nothing changed', () => {
  const items = deepFreeze([item('a', 1), item('b', 1)])
  const m = manualOf([shaped(block('a#0', 10, 10, 50), 1), shaped(block('b#0', 100, 100, 50), 1)])

  it('keeps the arrangement and prints it as arranged', () => {
    const { rest, outcome } = split(computeLayout(A4_PORTRAIT, items, m))
    expect(outcome.kind).toBe('kept')
    expect(rest).toEqual(layoutFromManual(m, items, A4_PORTRAIT))
  })

  it('returns manualFromLayout(result) as the outcome', () => {
    const { rest, outcome } = split(computeLayout(A4_PORTRAIT, items, m))
    if (outcome.kind === 'dropped') throw new Error('dropped')
    expect(outcome.manual).toEqual(manualFromLayout(rest, items, A4_PORTRAIT))
    expect(outcome.manual.blocks.map((b) => b.shape)).toEqual([
      { aspect: 1, tiles: 1 },
      { aspect: 1, tiles: 1 },
    ])
  })

  it('keeps an arrangement taken from the auto layout exactly as the auto layout', () => {
    const realistic = realisticItems(12, 3)
    const auto = computeLayout(DEFAULT_PAGE_SETUP, realistic)
    const start = manualFromLayout(auto, realistic, DEFAULT_PAGE_SETUP)
    const { rest, outcome } = split(computeLayout(DEFAULT_PAGE_SETUP, realistic, start))
    expect(outcome.kind).toBe('kept')
    expect(rest).toEqual(withoutScaledToFit(auto))
  })

  it('does not mutate its inputs', () => {
    const frozen = deepFreeze(m)
    expect(() => computeLayout(A4_PORTRAIT, items, frozen)).not.toThrow()
  })
})

describe('reconcileManual: a photo or copy removed (M5-R14)', () => {
  it('drops its block and leaves the gap: no other block moves', () => {
    const m = manualOf([
      shaped(block('a#0', 10, 10, 50), 1),
      shaped(block('b#0', 100, 10, 50), 1),
      shaped(block('c#0', 10, 100, 50), 1),
    ])
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 1), item('c', 1)], m), 'adjusted')
    expect(out.blocks.map((b) => b.blockId)).toEqual(['a#0', 'c#0'])
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 10, y: 10, tileW: 50 })
    expect(blockOf(out, 'c#0')).toMatchObject({ page: 0, x: 10, y: 100, tileW: 50 })
  })

  it('removes a page left empty and renumbers the rest (M5-R16)', () => {
    const m = manualOf(
      [
        shaped(block('a#0', 10, 10, 50), 1),
        shaped(block('b#0', 10, 10, 50, 1), 1),
        shaped(block('c#0', 30, 40, 50, 2), 1),
      ],
      3,
    )
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 1), item('c', 1)], m), 'adjusted')
    expect(out.pageCount).toBe(2)
    expect(blockOf(out, 'c#0')).toMatchObject({ page: 1, x: 30, y: 40 })
  })
})

describe('reconcileManual: a photo or copy added (M5-R14)', () => {
  it('packs it at its auto size into the free space; arranged blocks do not move', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 1), item('n', 1)], m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 10, y: 10, tileW: 50 })
    expect(blockOf(out, 'n#0')).toMatchObject({ page: 0, x: 10, y: 66, tileW: 190, turned: false })
    expect(out.pageCount).toBe(1)
  })

  it('scales it down to the largest size the free space holds', () => {
    // Free: 34 mm on the right, 190 × 121 mm below.
    const m = manualOf([shaped(block('a#0', 10, 10, 150), 1)])
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 1), item('n', 1)], m), 'adjusted')
    expect(blockOf(out, 'n#0')).toMatchObject({ page: 0, x: 10, y: 166, turned: false })
    expect(blockOf(out, 'n#0').tileW).toBeCloseTo(121, 9)
  })

  it('never scales it under the minimum: it goes on a new page at its auto size', () => {
    // a is 190 × 256: 15 mm are left below it, under MIN_MANUAL_SHORT_MM.
    const aspect = 190 / 256
    const m = manualOf([shaped(block('a#0', 10, 10, 190), aspect)])
    const items = [item('a', aspect), item('n', 1)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(out.pageCount).toBe(2)
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 10, y: 10, tileW: 190 })
    expect(blockOf(out, 'n#0')).toMatchObject({ page: 1, x: 10, y: 10, tileW: 190 })
  })

  it('tries the existing pages first, in order', () => {
    const full = 190 / 277
    const m = manualOf(
      [shaped(block('a#0', 10, 10, 190), full), shaped(block('b#0', 10, 10, 50, 1), 1)],
      2,
    )
    const items = [item('a', full), item('b', 1), item('n', 1)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(out.pageCount).toBe(2)
    expect(blockOf(out, 'n#0')).toMatchObject({ page: 1, x: 10, y: 66, tileW: 190 })
  })

  it('never grows it past its auto size, even with room to spare', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    const items = [item('a', 1), item('n', 1, 100)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'n#0')).toMatchObject({ page: 0, tileW: 100 })
  })

  it('packs a new copy of an arranged photo', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    const copy: LayoutItemInput = { ...item('a', 1), key: 'a#1' }
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 1), copy], m), 'adjusted')
    expect(out.blocks.map((b) => b.blockId).sort()).toEqual(['a#0', 'a#1'])
    expect(blockOf(out, 'a#1')).toMatchObject({ page: 0, x: 10, y: 66, tileW: 190 })
  })

  it('keeps a fixed size: placed at that size where it fits best (bssf)', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    const items = [item('a', 1), item('n', 1, 1000, fixed(40))]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'n#0')).toMatchObject({ page: 0, x: 66, y: 10, tileW: 40 })
  })

  it('puts a fixed size that fits nowhere on a new page, never shrunk', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 150), 1)])
    const items = [item('a', 1), item('n', 1, 1000, fixed(130))]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'n#0')).toMatchObject({ page: 1, x: 10, y: 10, tileW: 130 })
  })

  it('packs the largest photo first, so a small one does not take its space', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 150), 1)])
    const items = [item('a', 1), item('n', 1), item('p', 2, 1000, fixed(100))]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'n#0')).toMatchObject({ x: 10, y: 166 })
    expect(blockOf(out, 'n#0').tileW).toBeCloseTo(121, 9)
    expect(blockOf(out, 'p#0')).toMatchObject({ x: 137, y: 166, tileW: 100, turned: true })
  })

  it('gives packAround the same answer in any order of the photos to pack', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 150), 1)])
    const toPack = [item('n', 1.5), item('o', 0.7), item('p', 1, 1000, fixed(30))]
    const all = [item('a', 1), ...toPack]
    const forward = packAround(m, toPack, all)
    expect(packAround(m, [...toPack].reverse(), [...all].reverse())).toEqual(forward)
    expect(forward.blocks).toHaveLength(4)
    expect(blockOf(forward, 'o#0').shape).toEqual({ aspect: 0.7, tiles: 1 })
    expectAllValid(forward, all)
  })

  it('returns the layout unchanged when nothing needs packing', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 150), 1)])
    expect(packAround(m, [], [item('a', 1)])).toBe(m)
  })
})

describe('reconcileManual: a shape change (crop, rotation, study versions)', () => {
  it('refits the block inside its old box at the larger turn, top-left anchored', () => {
    // Old box 60 × 120 (aspect 0.5). Now 2:1: 60 wide unturned, 120 wide turned.
    const m = manualOf([shaped(block('a#0', 20, 30, 60), 0.5)])
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 2)], m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 20, y: 30, tileW: 120, turned: true })
  })

  it('refits a new number of study versions inside the old box', () => {
    const m = manualOf([shaped(block('a#0', 20, 30, 100), 1)])
    const out = arranged(
      computeLayout(A4_PORTRAIT, [item('a', 1, 1000, { kind: 'auto' }, 2)], m),
      'adjusted',
    )
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 20, y: 30, tileW: 47, turned: false })
    expect(blockOf(out, 'a#0').shape).toEqual({ aspect: 1, tiles: 2 })
  })

  it('packs it again when the refit would go under the minimum', () => {
    // Four tiles in a 40 mm box would be 5.5 mm wide.
    const m = manualOf([shaped(block('a#0', 20, 30, 40), 1), shaped(block('b#0', 100, 100, 50), 1)])
    const items = [item('a', 1, 1000, { kind: 'auto' }, 4), item('b', 1)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 10, y: 10, turned: true })
    expect(blockOf(out, 'a#0').tileW).toBeCloseTo(64.75, 9)
    expect(blockOf(out, 'b#0')).toMatchObject({ x: 100, y: 100, tileW: 50 })
  })

  it('keeps a fixed size when it still fits the old box', () => {
    const m = manualOf([shaped(block('a#0', 20, 30, 40), 1)])
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 2, 1000, fixed(40))], m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 20, y: 30, tileW: 40, turned: false })
  })

  it('takes a new fixed size and a new shape together inside the old box', () => {
    const m = manualOf([shaped(block('a#0', 20, 30, 40), 1)])
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 2, 1000, fixed(30))], m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 20, y: 30, tileW: 30 })
  })

  it('records the new shape of a refitted block', () => {
    const m = manualOf([shaped(block('a#0', 20, 30, 60), 0.5)])
    const outcome = reconcileManual(A4_PORTRAIT, [item('a', 2)], m)
    if (outcome.kind === 'dropped') throw new Error('dropped')
    expect(blockOf(outcome.manual, 'a#0').shape).toEqual({ aspect: 2, tiles: 1 })
  })

  it('packs a fixed size again when it no longer fits the old box', () => {
    // 40 × 80 fits a 40 × 40 box at neither turn.
    const m = manualOf([shaped(block('a#0', 20, 30, 40), 1), shaped(block('b#0', 100, 100, 50), 1)])
    const items = [item('a', 0.5, 1000, fixed(40)), item('b', 1)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 10, y: 10, tileW: 40, turned: false })
  })

  it('packs a block with no recorded shape again when its new shape no longer fits', () => {
    const m = manualOf([block('a#0', 10, 10, 50), shaped(block('b#0', 10, 70, 50), 1)])
    const items = [item('a', 0.5), item('b', 1)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'b#0')).toMatchObject({ x: 10, y: 70, tileW: 50 })
    expect(blockOf(out, 'a#0')).not.toMatchObject({ x: 10, y: 10 })
    expectAllValid(out, items)
  })

  it('keeps a block with no recorded shape when its photo is unchanged', () => {
    const m = manualOf([block('a#0', 10, 10, 50), block('b#0', 10, 70, 50)])
    const out = arranged(computeLayout(A4_PORTRAIT, [item('a', 1), item('b', 1)], m), 'kept')
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 10, y: 10, tileW: 50 })
    expect(blockOf(out, 'a#0').shape).toEqual({ aspect: 1, tiles: 1 })
  })
})

describe('reconcileManual: a fixed size changed in the edit sheet', () => {
  const m = manualOf([shaped(block('a#0', 20, 30, 40), 1), shaped(block('b#0', 100, 100, 50), 1)])

  it('takes the new size at its corner when that is valid', () => {
    const items = [item('a', 1, 1000, fixed(60)), item('b', 1)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 20, y: 30, tileW: 60, turned: false })
  })

  it('is packed again when the new size at its corner would overlap', () => {
    const items = [item('a', 1, 1000, fixed(80)), item('b', 1)]
    const out = arranged(computeLayout(A4_PORTRAIT, items, m), 'adjusted')
    expect(blockOf(out, 'a#0')).toMatchObject({ page: 0, x: 10, y: 10, tileW: 80 })
    expect(blockOf(out, 'b#0')).toMatchObject({ x: 100, y: 100, tileW: 50 })
  })

  it('treats an auto photo given a fixed size the same way', () => {
    const auto = manualOf([shaped(block('a#0', 20, 30, 50), 1)])
    const out = arranged(
      computeLayout(A4_PORTRAIT, [item('a', 1, 1000, fixed(30))], auto),
      'adjusted',
    )
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 20, y: 30, tileW: 30 })
  })

  it('packs a block again when a fixed size turned auto leaves it under the minimum', () => {
    const small = manualOf([
      shaped(block('a#0', 20, 30, 15), 1),
      shaped(block('b#0', 100, 100, 50), 1),
    ])
    const out = arranged(
      computeLayout(A4_PORTRAIT, [item('a', 1), item('b', 1)], small),
      'adjusted',
    )
    expect(blockOf(out, 'a#0').tileW).toBeGreaterThanOrEqual(20)
    expect(blockOf(out, 'b#0')).toMatchObject({ x: 100, y: 100, tileW: 50 })
  })
})

describe('reconcileManual: paper, custom size or orientation changed', () => {
  const items = [item('a', 1), item('b', 1.5)]
  const m = manualOf([shaped(block('a#0', 10, 10, 50), 1), shaped(block('b#0', 100, 100, 60), 1.5)])

  it.each<[string, PageSetup]>([
    ['another paper', { ...A4_PORTRAIT, paper: 'A5' }],
    ['the other orientation', { ...A4_PORTRAIT, orientation: 'landscape' }],
    ['another custom size', { ...A4_PORTRAIT, paper: 'Custom', customSize: { w: 200, h: 297 } }],
  ])('drops the arrangement for %s and returns the auto layout', (_, setup) => {
    const { rest, outcome } = split(computeLayout(setup, items, m))
    expect(outcome).toEqual({ kind: 'dropped', reason: 'paper' })
    expect(rest).toEqual(computeLayout(setup, items))
  })

  it('keeps it when the page size is the same (a custom size equal to A4)', () => {
    const setup: PageSetup = { ...A4_PORTRAIT, paper: 'Custom', customSize: { w: 210, h: 297 } }
    arranged(computeLayout(setup, items, m), 'kept')
  })

  it('keeps the arrangement orientation when the setting is auto', () => {
    const landscape: ManualLayout = deepFreeze({
      ...manualOf([shaped(block('a#0', 10, 10, 50), 1)]),
      orientation: 'landscape',
      pageSize: { w: 297, h: 210 },
      content: { x: 10, y: 10, w: 277, h: 190 },
    })
    const r = computeLayout(DEFAULT_PAGE_SETUP, [item('a', 1)], landscape)
    expect(r.orientation).toBe('landscape')
    expect(r.pageSize).toEqual({ w: 297, h: 210 })
    expect(arranged(r, 'kept').orientation).toBe('landscape')
  })
})

describe('reconcileManual: safe area, gutter, crop marks or bleed changed', () => {
  const items = [item('a', 1), item('b', 1)]

  it('keeps the arrangement when every block is still valid', () => {
    const m = manualOf([shaped(block('a#0', 20, 20, 50), 1), shaped(block('b#0', 100, 100, 50), 1)])
    const setup: PageSetup = { ...A4_PORTRAIT, safeAreaMm: 7 }
    const out = arranged(computeLayout(setup, items, m), 'kept')
    expect(out.content).toEqual({ x: 12, y: 12, w: 186, h: 273 })
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 20, y: 20, tileW: 50 })
  })

  it('drops it when a block falls outside the new margins', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1), shaped(block('b#0', 100, 100, 50), 1)])
    const setup: PageSetup = { ...A4_PORTRAIT, safeAreaMm: 7 }
    const { rest, outcome } = split(computeLayout(setup, items, m))
    expect(outcome).toEqual({ kind: 'dropped', reason: 'no-longer-fits' })
    expect(rest).toEqual(computeLayout(setup, items))
  })

  it('drops it when a wider gutter makes two blocks too close', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1), shaped(block('b#0', 67, 10, 50), 1)])
    const setup: PageSetup = { ...A4_PORTRAIT, gutter: { enabled: true, mm: 8 } }
    expect(split(computeLayout(setup, items, m)).outcome).toEqual({
      kind: 'dropped',
      reason: 'no-longer-fits',
    })
  })

  it('keeps it when a wider gutter still fits', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1), shaped(block('b#0', 70, 10, 50), 1)])
    const setup: PageSetup = { ...A4_PORTRAIT, gutter: { enabled: true, mm: 8 } }
    expect(arranged(computeLayout(setup, items, m), 'kept').gutter).toBe(8)
  })

  it('refits a shape change inside the old box measured with the old gutter', () => {
    // Old box: two 50 mm tiles and a 6 mm gutter, 106 × 50. Three tiles and an 8 mm gutter: 30 mm.
    const m = manualOf([shaped(block('a#0', 20, 20, 50), 1, 2)])
    const setup: PageSetup = { ...A4_PORTRAIT, gutter: { enabled: true, mm: 8 } }
    const out = arranged(
      computeLayout(setup, [item('a', 1, 1000, { kind: 'auto' }, 3)], m),
      'adjusted',
    )
    expect(blockOf(out, 'a#0')).toMatchObject({ x: 20, y: 20, turned: false })
    expect(blockOf(out, 'a#0').tileW).toBeCloseTo(30, 9)
  })

  it('does not drop the arrangement for a block that is only under the minimum', () => {
    // a was a 15 mm fixed size and is auto now: it is packed again, the rest is kept.
    const m = manualOf([shaped(block('a#0', 20, 20, 15), 1), shaped(block('b#0', 100, 100, 50), 1)])
    const setup: PageSetup = { ...A4_PORTRAIT, safeAreaMm: 7 }
    const out = arranged(computeLayout(setup, items, m), 'adjusted')
    expect(blockOf(out, 'b#0')).toMatchObject({ x: 100, y: 100, tileW: 50 })
    expect(blockOf(out, 'a#0').tileW).toBeGreaterThanOrEqual(20)
  })

  it('judges the arrangement as it was: a shape-changed block by its old box', () => {
    // Old box 60 × 120 ends at y = 280, past the new margin at 277; the square refit (60 × 60) would not.
    const m = manualOf([shaped(block('a#0', 20, 160, 60), 0.5)])
    const setup: PageSetup = { ...A4_PORTRAIT, safeAreaMm: 15 }
    expect(split(computeLayout(setup, [item('a', 1)], m)).outcome).toEqual({
      kind: 'dropped',
      reason: 'no-longer-fits',
    })
  })
})

describe('reconcileManual: nothing left, or no room', () => {
  it('drops the arrangement without a reason to tell when no photo is left', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    const { rest, outcome } = split(computeLayout(A4_PORTRAIT, [], m))
    expect(outcome).toEqual({ kind: 'dropped', reason: 'empty' })
    expect(rest).toEqual(computeLayout(A4_PORTRAIT, []))
  })

  it('drops it when a photo cannot fit an empty page any more', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    const items = [item('a', 1), item('n', 1, 1000, { kind: 'auto' }, 50)]
    const { rest, outcome } = split(computeLayout(A4_PORTRAIT, items, m))
    expect(outcome).toEqual({ kind: 'dropped', reason: 'no-longer-fits' })
    expect(rest.pages).toEqual([])
  })

  it('refuses two photo copies with the same block id', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    const twins: LayoutItemInput[] = [
      { ...item('a', 1), key: 'h1~0#0', imageId: 'a' as ImageId },
      { ...item('a', 1), key: 'h2~0#0', imageId: 'a' as ImageId },
    ]
    expect(() => computeLayout(A4_PORTRAIT, twins, m)).toThrow(RangeError)
  })

  it('still validates the items on the manual path', () => {
    const m = manualOf([shaped(block('a#0', 10, 10, 50), 1)])
    expect(() => computeLayout(A4_PORTRAIT, [item('a', 1), item('a', 1)], m)).toThrow(
      'duplicate layout key a#0',
    )
  })
})
