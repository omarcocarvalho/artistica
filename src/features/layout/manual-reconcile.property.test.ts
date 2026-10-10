import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ImageId, SizeMode } from '../../shared/model/image'
import type { PageSetup } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import { isValidPlacement, layoutFromManual, manualFromLayout, type ManualLayout } from './manual'
import { moveToPage, nudge, resizeBlock } from './manual-ops'
import { nth } from './nth'
import { itemsArb, pageSetupArb } from './test-support/arbitraries'
import { separation, TOL } from './test-support/invariants'
import { deepFreeze } from './test-support/manual'
import type { LayoutItemInput, LayoutResult } from './types'

type Change =
  | { kind: 'keep' }
  | { kind: 'drop' }
  | { kind: 'aspect'; aspect: number }
  | { kind: 'tiles'; tiles: number }
  | { kind: 'size'; size: SizeMode }

const changeArb: fc.Arbitrary<Change> = fc.oneof(
  { weight: 4, arbitrary: fc.constant({ kind: 'keep' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'drop' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('aspect' as const),
      aspect: fc.double({ min: 0.2, max: 5, noNaN: true }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('tiles' as const),
      tiles: fc.integer({ min: 1, max: 4 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('size' as const),
      size: fc.oneof(
        fc.constant<SizeMode>({ kind: 'auto' }),
        fc.record({
          kind: fc.constant('fixed' as const),
          axis: fc.constantFrom('width' as const, 'height' as const),
          mm: fc.double({ min: 10, max: 300, noNaN: true }),
        }),
      ),
    }),
  },
)

const setupChangeArb = fc.record({
  safeAreaMm: fc.option(fc.double({ min: 3, max: 20, noNaN: true }), { nil: undefined }),
  gutterMm: fc.option(fc.double({ min: 0, max: 15, noNaN: true }), { nil: undefined }),
})

/** Arranged from the auto layout, then a few edits so blocks sit off the packer's grid. */
function arrangedStart(setup: PageSetup, items: readonly LayoutItemInput[]): ManualLayout {
  let m = manualFromLayout(computeLayout(setup, items), items, setup)
  const first = m.blocks[0]
  if (first !== undefined) {
    for (const r of [
      nudge(m, first.blockId, 7, 3, items),
      resizeBlock(m, first.blockId, first.tileW * 0.7, 'br', items),
      moveToPage(m, first.blockId, m.pageCount, items),
    ]) {
      if (r.ok) m = r.manual
    }
  }
  return deepFreeze(m)
}

function changedItems(
  items: readonly LayoutItemInput[],
  changes: readonly Change[],
  added: readonly LayoutItemInput[],
): LayoutItemInput[] {
  const out: LayoutItemInput[] = []
  items.forEach((it, i) => {
    const c = changes[i % Math.max(1, changes.length)] ?? { kind: 'keep' }
    if (c.kind === 'drop') return
    if (c.kind === 'aspect') out.push({ ...it, aspect: c.aspect })
    else if (c.kind === 'tiles') out.push({ ...it, tiles: c.tiles })
    else if (c.kind === 'size') out.push({ ...it, size: c.size })
    else out.push(it)
  })
  return [
    ...out,
    ...added.map((it, i) => ({
      ...it,
      key: `new${String(i)}#0`,
      imageId: `new${String(i)}` as ImageId,
    })),
  ]
}

function withoutManual(r: LayoutResult): LayoutResult {
  const rest = { ...r }
  delete rest.manual
  return rest
}

const scenario = fc.record({
  setup: pageSetupArb,
  items: itemsArb(8),
  changes: fc.array(changeArb, { maxLength: 8 }),
  added: itemsArb(4),
  setupChange: setupChangeArb,
})

type Scenario = typeof scenario extends fc.Arbitrary<infer T> ? T : never

function run(s: Scenario): {
  setup: PageSetup
  items: LayoutItemInput[]
  start: ManualLayout
} {
  const start = arrangedStart(s.setup, s.items)
  const setup: PageSetup = {
    ...s.setup,
    safeAreaMm: s.setupChange.safeAreaMm ?? s.setup.safeAreaMm,
    gutter: { ...s.setup.gutter, mm: s.setupChange.gutterMm ?? s.setup.gutter.mm },
  }
  return { setup, items: changedItems(s.items, s.changes, s.added), start }
}

describe('reconcileManual (property)', () => {
  it(
    'gives a valid layout holding every photo once, or the auto layout when dropped',
    { timeout: 60_000 },
    () => {
      fc.assert(
        fc.property(scenario, (s) => {
          const { setup, items, start } = run(s)
          const r = computeLayout(setup, deepFreeze(items), start)
          const outcome = r.manual
          if (outcome === undefined) throw new Error('no manual outcome')
          if (outcome.kind === 'dropped') {
            expect(withoutManual(r)).toEqual(computeLayout(setup, items))
            return
          }
          const m = outcome.manual
          expect(m).toEqual(manualFromLayout(withoutManual(r), items, setup))
          expect(withoutManual(r)).toEqual(layoutFromManual(m, items, setup))
          for (const b of m.blocks) expect(isValidPlacement(m, b, items)).toBe(true)
          const placed = r.pages.flatMap((p) => p.placements.map((pl) => pl.key)).sort()
          expect(placed).toEqual(items.map((it) => it.key).sort())
          expect(r.pages).toHaveLength(m.pageCount)
          for (const page of r.pages) {
            expect(page.placements.length).toBeGreaterThan(0)
            const ps = page.placements
            for (let i = 0; i < ps.length; i++)
              for (let j = i + 1; j < ps.length; j++)
                expect(separation(nth(ps, i).block, nth(ps, j).block)).toBeGreaterThanOrEqual(
                  m.gutter - TOL,
                )
          }
        }),
        { numRuns: 200 },
      )
    },
  )

  it('is deterministic in any item order', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(scenario, fc.integer(), (s, seed) => {
        const { setup, items, start } = run(s)
        const shuffled = [...items]
        let x = seed >>> 0
        for (let i = shuffled.length - 1; i > 0; i--) {
          x = (Math.imul(x, 1664525) + 1013904223) >>> 0
          const j = x % (i + 1)
          const a = nth(shuffled, i)
          shuffled[i] = nth(shuffled, j)
          shuffled[j] = a
        }
        expect(computeLayout(setup, shuffled, start)).toEqual(computeLayout(setup, items, start))
      }),
      { numRuns: 150 },
    )
  })
})
