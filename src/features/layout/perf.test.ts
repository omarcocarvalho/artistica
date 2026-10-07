import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import { item, mulberry32, realisticItems } from './test-support/fixtures'
import type { LayoutItemInput } from './types'

/** Spec §3 budget is 500 ms on a desktop; CI runners are slower and shared, so CI allows 4×. */
const CI_BOUND_MS = 2000

function timeIt(setup: PageSetup, items: readonly LayoutItemInput[]): number {
  computeLayout(setup, items) // warm-up (JIT)
  const t0 = performance.now()
  computeLayout(setup, items)
  return performance.now() - t0
}

const key = (i: number): string => `p${String(i).padStart(2, '0')}`

/**
 * Dense worst case: `nAuto` growing photos among many small fixed-size ones, all on ONE page.
 * Every search target packs ~50 boxes onto one crowded page (the slowest MaxRects case), and the
 * growing photos keep the search going through the ladder and the bisection.
 */
function denseFixedItems(nAuto: number, seed: number): LayoutItemInput[] {
  const rnd = mulberry32(seed)
  const aspects = [1.5, 2 / 3, 1, 0.5, 2]
  return Array.from({ length: 50 }, (_, i) =>
    i < nAuto
      ? item(key(i), aspects[i % 3] ?? 1)
      : item(key(i), aspects[Math.floor(rnd() * aspects.length)] ?? 1, 1000, {
          kind: 'fixed',
          axis: 'width',
          mm: 10 + rnd() * 10,
        }),
  )
}

/** Dense worst case: 50 random-aspect groups (1–`maxTiles` tiles) on one large page; the full ladder runs. */
function denseGroupItems(seed: number, maxTiles = 3): LayoutItemInput[] {
  const rnd = mulberry32(seed)
  return Array.from({ length: 50 }, (_, i) =>
    item(key(i), 0.3 + rnd() * 3, 1200, { kind: 'auto' }, 1 + Math.floor(rnd() * maxTiles)),
  )
}

/** 50 photos, each printing all four study versions (the largest groups the UI can make). */
function fourVersionItems(seed: number): LayoutItemInput[] {
  const rnd = mulberry32(seed)
  const aspects = [1.5, 2 / 3, 1, 4 / 3, 3 / 4]
  return Array.from({ length: 50 }, (_, i) =>
    item(
      key(i),
      aspects[Math.floor(rnd() * aspects.length)] ?? 1,
      300 + rnd() * 700,
      { kind: 'auto' },
      4,
    ),
  )
}

describe('computeLayout performance (50 items)', () => {
  const cases: [string, PageSetup, LayoutItemInput[]][] = [
    ['A4 auto, mixed photos', DEFAULT_PAGE_SETUP, realisticItems(50, 1)],
    [
      'Letter auto, mixed photos',
      { ...DEFAULT_PAGE_SETUP, paper: 'Letter' },
      realisticItems(50, 2),
    ],
    [
      'A6 auto, mixed photos (many pages)',
      { ...DEFAULT_PAGE_SETUP, paper: 'A6' },
      realisticItems(50, 3),
    ],
    [
      'A3 auto, 50 identical 3:2',
      { ...DEFAULT_PAGE_SETUP, paper: 'A3' },
      Array.from({ length: 50 }, (_, i) => item(key(i), 1.5)),
    ],
    ['A4 auto, dense: 46 small fixed + 4 growing', DEFAULT_PAGE_SETUP, denseFixedItems(4, 410)],
    [
      'Tabloid auto, dense: 46 small fixed + 4 growing',
      { ...DEFAULT_PAGE_SETUP, paper: 'Tabloid' },
      denseFixedItems(4, 410),
    ],
    [
      'Custom 1000 mm auto, dense: 50 random groups on one page',
      { ...DEFAULT_PAGE_SETUP, paper: 'Custom', customSize: { w: 1000, h: 1000 } },
      denseGroupItems(2),
    ],
    [
      'Custom 1000 mm auto, dense: 50 random groups of 1–4 tiles on one page',
      { ...DEFAULT_PAGE_SETUP, paper: 'Custom', customSize: { w: 1000, h: 1000 } },
      denseGroupItems(22, 4),
    ],
    ['A4 auto, 50 photos × 4 versions', DEFAULT_PAGE_SETUP, fourVersionItems(7)],
    [
      'A3 auto, 50 photos × 4 versions',
      { ...DEFAULT_PAGE_SETUP, paper: 'A3' },
      fourVersionItems(8),
    ],
  ]
  for (const [name, setup, items] of cases) {
    it(`${name} < ${String(CI_BOUND_MS)} ms`, () => {
      const ms = timeIt(setup, items)
      console.info(`[layout perf] ${name}: ${ms.toFixed(1)} ms`)
      expect(ms).toBeLessThan(CI_BOUND_MS)
    })
  }
})
