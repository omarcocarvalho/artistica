import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../shared/model/page-setup'
import type { PaperId } from '../../shared/model/paper'
import { computeLayout } from './compute-layout'
import { item, mulberry32, realisticItems } from './test-support/fixtures'
import type { LayoutItemInput, LayoutResult } from './types'

/** FNV-1a (32-bit) of a string, as 8 hex digits. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function summary(r: LayoutResult): string {
  const perPage = r.pages.map((p) => p.placements.length).join('+')
  return `${r.orientation} ${String(r.pages.length)}p [${perPage}] ${fnv1a(JSON.stringify(r))}`
}

function groups(n: number, seed: number): LayoutItemInput[] {
  const rnd = mulberry32(seed)
  return Array.from({ length: n }, (_, i) =>
    item(
      `g${String(i).padStart(2, '0')}`,
      0.3 + rnd() * 3,
      40 + rnd() * 800,
      { kind: 'auto' },
      1 + Math.floor(rnd() * 3),
    ),
  )
}

/**
 * Output stability: exact layouts for a fixed set of inputs. Any change to the search, the packer
 * or their tie-breaks that changes a chosen packing fails here. Update the snapshot only for an
 * intended layout change, and say so in the PR.
 */
describe('computeLayout golden outputs', () => {
  const papers: PaperId[] = ['A4', 'A5', 'A3', 'Letter', 'A6']
  const cases: [string, PageSetup, LayoutItemInput[]][] = []
  papers.forEach((paper, p) => {
    for (const n of [1, 4, 9, 15, 30]) {
      cases.push([
        `${paper} realistic n=${String(n)}`,
        { ...DEFAULT_PAGE_SETUP, paper },
        realisticItems(n, 100 + p * 10 + n),
      ])
    }
  })
  cases.push([
    'A4 portrait, gutter off, 12 realistic',
    { ...DEFAULT_PAGE_SETUP, orientation: 'portrait', gutter: { enabled: false, mm: 0 } },
    realisticItems(12, 7),
  ])
  cases.push([
    'A4 landscape, bleed 3, 12 realistic',
    { ...DEFAULT_PAGE_SETUP, orientation: 'landscape', bleed: { enabled: true, mm: 3 } },
    realisticItems(12, 8),
  ])
  cases.push(['Tabloid, 20 groups', { ...DEFAULT_PAGE_SETUP, paper: 'Tabloid' }, groups(20, 3)])
  cases.push([
    'Custom 600, 30 groups',
    { ...DEFAULT_PAGE_SETUP, paper: 'Custom', customSize: { w: 400, h: 600 } },
    groups(30, 4),
  ])
  cases.push([
    'A5 auto picks landscape, 15 realistic',
    { ...DEFAULT_PAGE_SETUP, paper: 'A5' },
    realisticItems(15, 9),
  ])
  cases.push([
    'A4, 7 identical 3:2',
    DEFAULT_PAGE_SETUP,
    Array.from({ length: 7 }, (_, i) => item(`p${String(i)}`, 1.5)),
  ])

  it('matches the recorded layouts', () => {
    expect(
      cases.map(([name, setup, items]) => `${name}: ${summary(computeLayout(setup, items))}`),
    ).toMatchSnapshot()
  })
})
