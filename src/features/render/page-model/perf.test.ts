import { describe, expect, it } from 'vitest'
import { MAX_GRID } from '../../../shared/model/lines'
import type { Placement } from '../../layout/types'
import {
  layoutOf,
  linesDescriptor,
  placement,
  setupWith,
  studyDescriptor,
} from '../test-support/fixtures'
import { buildPageModels } from './build-page-models'

/** Spec §3 target is 20 ms in node; CI runners are slower and shared, so CI allows 5×. */
const CI_BOUND_MS = 100

const PER_PAGE = 4
const images = Array.from({ length: 50 }, (_, i) =>
  linesDescriptor(
    `p${String(i)}`,
    {
      grid: { on: true, cols: MAX_GRID, rows: MAX_GRID },
      thirds: true,
      armature: true,
      golden: true,
      spiral: { on: true, corner: 'bottomRight' },
      centre: true,
    },
    studyDescriptor(`p${String(i)}`, ['original', 'blurred', 'values', 'blurValues']),
  ),
)

/** A4: four groups of four 44 × 30 mm tiles per page, every other group turned. */
const pages: Placement[][] = []
images.forEach((img, i) => {
  const slot = i % PER_PAGE
  if (slot === 0) pages.push([])
  const y = 14 + slot * 68
  const tiles = [0, 1, 2, 3].map((k) => ({ x: 14 + k * 46, y, w: 44, h: 30 }))
  pages.at(-1)?.push(placement(img.id, tiles, { turned: i % 2 === 1 }))
})
const layout = layoutOf(pages)
const setup = setupWith({ bleed: { enabled: true, mm: 3 }, gutter: { enabled: true, mm: 6 } })

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? Number.NaN
}

describe('buildPageModels performance with lines', () => {
  it(`50 images × 4 versions, every type on, 20 × 20 grid: median < ${String(CI_BOUND_MS)} ms`, () => {
    const warm = buildPageModels(layout, setup, images)
    expect(warm.flatMap((p) => p.lines)).toHaveLength(200)
    const runs = Array.from({ length: 5 }, () => {
      const t0 = performance.now()
      buildPageModels(layout, setup, images)
      return performance.now() - t0
    })
    const ms = median(runs)
    console.info(`[page-model perf] 200 tiles with lines: median ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(CI_BOUND_MS)
  })
})
