import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeLayout } from './compute-layout'
import { isValidPlacement, layoutFromManual, manualFromLayout, type ManualLayout } from './manual'
import {
  moveBlock,
  moveToPage,
  nudge,
  resizeBlock,
  swapBlocks,
  type Corner,
  type OpResult,
} from './manual-ops'
import { nth } from './nth'
import { itemsArb, pageSetupArb } from './test-support/arbitraries'
import { separation, TOL } from './test-support/invariants'
import { deepFreeze } from './test-support/manual'
import type { LayoutItemInput } from './types'

type Op =
  | { kind: 'move'; i: number; page: number; dx: number; dy: number }
  | { kind: 'nudge'; i: number; dx: number; dy: number }
  | { kind: 'resize'; i: number; f: number; anchor: Corner }
  | { kind: 'swap'; i: number; j: number }
  | { kind: 'toPage'; i: number; page: number }

const index = fc.nat({ max: 1000 })
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('move' as const),
    i: index,
    page: fc.integer({ min: -1, max: 3 }),
    dx: fc.double({ min: -150, max: 150, noNaN: true }),
    dy: fc.double({ min: -150, max: 150, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant('nudge' as const),
    i: index,
    dx: fc.integer({ min: -40, max: 40 }),
    dy: fc.integer({ min: -40, max: 40 }),
  }),
  fc.record({
    kind: fc.constant('resize' as const),
    i: index,
    f: fc.double({ min: 0.1, max: 4, noNaN: true }),
    anchor: fc.constantFrom<Corner>('tl', 'tr', 'bl', 'br'),
  }),
  fc.record({ kind: fc.constant('swap' as const), i: index, j: index }),
  fc.record({
    kind: fc.constant('toPage' as const),
    i: index,
    page: fc.integer({ min: 0, max: 4 }),
  }),
)

function run(m: ManualLayout, op: Op, items: readonly LayoutItemInput[]): OpResult | null {
  const n = m.blocks.length
  if (n === 0) return null
  const b = nth(m.blocks, op.i % n)
  switch (op.kind) {
    case 'move':
      return moveBlock(m, b.blockId, b.page + op.page, b.x + op.dx, b.y + op.dy, items)
    case 'nudge':
      return nudge(m, b.blockId, op.dx, op.dy, items)
    case 'resize':
      return resizeBlock(m, b.blockId, b.tileW * op.f, op.anchor, items)
    case 'swap': {
      const other = nth(m.blocks, op.j % n)
      if (other.blockId === b.blockId) return null
      return swapBlocks(m, b.blockId, other.blockId, items)
    }
    case 'toPage':
      return moveToPage(m, b.blockId, Math.min(op.page, m.pageCount), items)
  }
}

function expectValid(
  m: ManualLayout,
  ids: readonly string[],
  items: readonly LayoutItemInput[],
): void {
  expect(m.blocks.map((b) => b.blockId).sort()).toEqual([...ids].sort())
  for (const b of m.blocks) expect(isValidPlacement(m, b, items)).toBe(true)
  const pages = new Set(m.blocks.map((b) => b.page))
  expect([...pages].sort((a, b) => a - b)).toEqual(Array.from({ length: m.pageCount }, (_, i) => i))
  const sorted = [...m.blocks].sort(
    (a, b) => a.page - b.page || a.y - b.y || a.x - b.x || (a.blockId < b.blockId ? -1 : 1),
  )
  expect(m.blocks).toEqual(sorted)
}

describe('manual operations (property)', () => {
  it(
    'keep any valid manual layout valid, and refusals leave it untouched',
    { timeout: 30_000 },
    () => {
      fc.assert(
        fc.property(
          pageSetupArb,
          itemsArb(8),
          fc.array(opArb, { maxLength: 30 }),
          (setup, items, ops) => {
            const start = manualFromLayout(computeLayout(setup, items), items, setup)
            const ids = start.blocks.map((b) => b.blockId)
            let m = deepFreeze(start)
            for (const op of ops) {
              const before = JSON.stringify(m)
              const r = run(m, op, items)
              expect(JSON.stringify(m)).toBe(before)
              if (r?.ok) m = deepFreeze(r.manual)
              expectValid(m, ids, items)
            }
            // The final arrangement prints with every trim box a gutter apart.
            const out = layoutFromManual(m, items, setup)
            for (const page of out.pages) {
              expect(page.placements.length).toBeGreaterThan(0)
              const ps = page.placements
              for (let i = 0; i < ps.length; i++)
                for (let j = i + 1; j < ps.length; j++)
                  expect(separation(nth(ps, i).block, nth(ps, j).block)).toBeGreaterThanOrEqual(
                    m.gutter - TOL,
                  )
            }
          },
        ),
        { numRuns: 150 },
      )
    },
  )
})
