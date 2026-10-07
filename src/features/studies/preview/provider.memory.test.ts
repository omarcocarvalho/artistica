import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MM_PER_INCH } from '../../../shared/model/units'
import { planTilePixels } from '../../render/pixels/tile-plan'
import { previewDpi, previewScale } from '../../render/preview/preview-geometry'
import { drawTile, id } from '../../render/test-support/fixtures'
import { createStudyPreviewProvider } from './provider'
import { fakeDeps, STUDY } from './test-support/fakes'

/** Non-overlapping trims in a grid on a sheet: w × h cells, each tile strictly inside its cell. */
const arbPage = fc.record({
  cssWidth: fc.integer({ min: 200, max: 1400 }),
  dpr: fc.constantFrom(1, 2, 3),
  cols: fc.integer({ min: 1, max: 5 }),
  rows: fc.integer({ min: 1, max: 6 }),
  fill: fc.double({ min: 0.3, max: 1, noNaN: true }),
  bleed: fc.constantFrom(0, 3),
})

describe('provider memory bound', () => {
  it('wanted bytes never exceed the sheets’ area (plus one device pixel of rounding per tile side), and none is evicted', async () => {
    await fc.assert(
      fc.asyncProperty(arbPage, async ({ cssWidth, dpr, cols, rows, fill, bleed }) => {
        const size = { w: 210, h: 297 }
        const scale = previewScale(size, cssWidth, dpr)
        const dpi = previewDpi(scale)
        const cellW = size.w / cols
        const cellH = size.h / rows
        const f = fakeDeps(0)
        f.add('a')
        const p = createStudyPreviewProvider(f.deps)
        const requests = []
        let roundingPx = 0
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const w = (cellW - 2 * bleed) * fill
            const h = (cellH - 2 * bleed) * fill
            const tile = drawTile({
              imageId: id('a'),
              trim: { x: c * cellW + bleed, y: r * cellH + bleed, w, h },
              bleedMm: bleed,
              crop: { x: 0, y: 0, w: 6000, h: 6000 }, // large source: no "never upscale" shrink
            })
            const plan = planTilePixels(tile, { dpi })
            const k = `${String(r)}:${String(c)}`
            requests.push({ key: k, slot: k, plan, study: STUDY, imageId: id('a') })
            roundingPx += 2 * (plan.canvasW + plan.canvasH) + 4
          }
        p.want('page0', requests)
        const results = []
        for (let i = 0; i < requests.length; i++) {
          await f.settle()
          results.push(await f.finish(i))
        }
        const sheetBytes = scale.deviceW * scale.deviceH * 4
        expect(p.stats().wantedBytes).toBeLessThanOrEqual(sheetBytes + roundingPx * 4)
        expect(results.filter((r) => r.closed > 0)).toEqual([])
        expect(dpi).toBeLessThanOrEqual(scale.pxPerMm * MM_PER_INCH + 1e-9)
      }),
      { numRuns: 60 },
    )
  })
})
