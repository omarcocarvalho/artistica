import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../../shared/model/page-setup'
import type { PaperId } from '../../../shared/model/paper'
import type { LayoutItemInput } from '../types'
import { item, mulberry32, realisticItems } from './fixtures'

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

const papers: PaperId[] = ['A4', 'A5', 'A3', 'Letter', 'A6']

/** The inputs of the golden snapshot (`golden.test.ts`). */
export const GOLDEN_CASES: [string, PageSetup, LayoutItemInput[]][] = []
papers.forEach((paper, p) => {
  for (const n of [1, 4, 9, 15, 30]) {
    GOLDEN_CASES.push([
      `${paper} realistic n=${String(n)}`,
      { ...DEFAULT_PAGE_SETUP, paper },
      realisticItems(n, 100 + p * 10 + n),
    ])
  }
})
GOLDEN_CASES.push([
  'A4 portrait, gutter off, 12 realistic',
  { ...DEFAULT_PAGE_SETUP, orientation: 'portrait', gutter: { enabled: false, mm: 0 } },
  realisticItems(12, 7),
])
GOLDEN_CASES.push([
  'A4 landscape, bleed 3, 12 realistic',
  { ...DEFAULT_PAGE_SETUP, orientation: 'landscape', bleed: { enabled: true, mm: 3 } },
  realisticItems(12, 8),
])
GOLDEN_CASES.push([
  'Tabloid, 20 groups',
  { ...DEFAULT_PAGE_SETUP, paper: 'Tabloid' },
  groups(20, 3),
])
GOLDEN_CASES.push([
  'Custom 600, 30 groups',
  { ...DEFAULT_PAGE_SETUP, paper: 'Custom', customSize: { w: 400, h: 600 } },
  groups(30, 4),
])
GOLDEN_CASES.push([
  'A5 auto picks landscape, 15 realistic',
  { ...DEFAULT_PAGE_SETUP, paper: 'A5' },
  realisticItems(15, 9),
])
GOLDEN_CASES.push([
  'A4, 7 identical 3:2',
  DEFAULT_PAGE_SETUP,
  Array.from({ length: 7 }, (_, i) => item(`p${String(i)}`, 1.5)),
])
