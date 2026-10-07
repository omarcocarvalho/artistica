import { describe, expect, it, vi } from 'vitest'
import { planTilePixels } from '../pixels/tile-plan'
import { fakeFactory, type FakeCanvas } from '../test-support/fake-canvas'
import { drawTile } from '../test-support/fixtures'
import { createExportWorkerApi } from './worker-api'

vi.mock('../../studies/apply-study', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../studies/apply-study')>()),
  applyStudyToContext: vi.fn(() => {
    throw new Error('no ImageData')
  }),
}))

describe('createExportWorkerApi with studies', () => {
  it('closes the bitmap and releases the canvas when the study throws', async () => {
    const made: FakeCanvas[] = []
    const encodeJpeg = vi.fn()
    const encodePng = vi.fn()
    const api = createExportWorkerApi({
      supported: () => true,
      createCanvas: fakeFactory(made),
      encodeJpeg,
      encodePng,
    })
    await api.init()
    let closed = false
    const bitmap = {
      width: 300,
      height: 150,
      close: () => {
        closed = true
      },
    } as unknown as ImageBitmap
    const plan = planTilePixels(
      drawTile({ trim: { x: 0, y: 0, w: 10, h: 5 }, crop: { x: 0, y: 0, w: 300, h: 150 } }),
    )
    await expect(
      api.encodeTile('k', plan, bitmap, { blurPct: 40, values: null }, 'jpeg'),
    ).rejects.toThrow('no ImageData')
    expect(closed).toBe(true)
    expect(made.length).toBeGreaterThan(0)
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
    expect(encodeJpeg).not.toHaveBeenCalled()
    expect(encodePng).not.toHaveBeenCalled()
  })
})
