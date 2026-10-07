import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TileStudy } from '../../../shared/model/study'
import { drawTile } from '../test-support/fixtures'
import { fakeFactory, type FakeCanvas } from '../test-support/fake-canvas'
import { renderTile } from './render-tile'
import { planTilePixels } from './tile-plan'

const step = vi.hoisted(() => ({
  calls: [] as { area: readonly number[]; study: unknown }[],
  impl: undefined as undefined | (() => void),
}))

vi.mock('../../studies/apply-study', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../studies/apply-study')>()
  return {
    ...actual,
    applyStudyToContext: vi.fn(
      (
        ctx: Parameters<typeof actual.applyStudyToContext>[0],
        plan: Parameters<typeof actual.applyStudyToContext>[1],
        study: TileStudy,
      ) => {
        step.calls.push({ area: [plan.bleedPx, plan.outW, plan.outH], study })
        if (step.impl) {
          step.impl()
          return
        }
        // Marker: paint the image area magenta, so the bleed ring shows which step ran first.
        const img = ctx.createImageData(plan.outW, plan.outH)
        for (let i = 0; i < img.data.length; i += 4) img.data.set([255, 0, 255, 255], i)
        ctx.putImageData(img, plan.bleedPx, plan.bleedPx)
      },
    ),
  }
})

const VALUES: TileStudy = { blurPct: null, values: { count: 5, hue: 55, neutral: false } }
const MAGENTA = [255, 0, 255, 255]
const small = drawTile({
  trim: { x: 0, y: 0, w: 10, h: 5 },
  crop: { x: 0, y: 0, w: 300, h: 150 },
  bleedMm: 1,
})
const source = {} as CanvasImageSource

beforeEach(() => {
  step.calls = []
  step.impl = undefined
})

describe('renderTile with a study (M2-R5)', () => {
  it('runs the study once, on the image area, before the bleed is extended', () => {
    const plan = planTilePixels(small)
    expect(plan.bleedPx).toBeGreaterThan(0)
    const out = renderTile(source, plan, fakeFactory(), VALUES)
    expect(step.calls).toEqual([{ area: [plan.bleedPx, plan.outW, plan.outH], study: VALUES }])
    expect(out.pixel(0, 0)).toEqual(MAGENTA)
    expect(out.pixel(plan.canvasW - 1, 0)).toEqual(MAGENTA)
    expect(out.pixel(plan.canvasW - 1, plan.canvasH - 1)).toEqual(MAGENTA)
  })

  it('does not run a study step for the original (study null or omitted)', () => {
    const plan = planTilePixels(small)
    const omitted = renderTile(source, plan, fakeFactory())
    renderTile(source, plan, fakeFactory(), null)
    expect(step.calls).toEqual([])
    expect(omitted.pixel(0, 0)).toEqual([255, 255, 255, 255])
  })

  it('releases the output canvas and every temp canvas when the study step throws', () => {
    step.impl = () => {
      throw new Error('no ImageData')
    }
    const made: FakeCanvas[] = []
    const big = drawTile({
      trim: { x: 0, y: 0, w: 10, h: 5 },
      crop: { x: 0, y: 0, w: 3000, h: 1500 },
    })
    expect(() => renderTile(source, planTilePixels(big), fakeFactory(made), VALUES)).toThrow(
      'no ImageData',
    )
    expect(made.length).toBeGreaterThan(1)
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })
})
