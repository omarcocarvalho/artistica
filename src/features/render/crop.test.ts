import { describe, expect, it } from 'vitest'
import { resolveCrop } from './crop'
import { descriptor } from './test-support/fixtures'

describe('resolveCrop', () => {
  it('uses the full image when crop is null', () => {
    expect(resolveCrop(descriptor('a', 400, 300))).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })
  it('keeps a valid crop', () => {
    const crop = { x: 10, y: 20, w: 100, h: 50 }
    expect(resolveCrop(descriptor('a', 400, 300, { crop }))).toEqual(crop)
  })
  it('keeps fractional crops unrounded', () => {
    const crop = { x: 10.25, y: 20.5, w: 100.75, h: 50.125 }
    expect(resolveCrop(descriptor('a', 400, 300, { crop }))).toEqual(crop)
  })
  it('clamps a crop that spills outside the image', () => {
    expect(
      resolveCrop(descriptor('a', 400, 300, { crop: { x: -5, y: 250, w: 500, h: 100 } })),
    ).toEqual({
      x: 0,
      y: 250,
      w: 400,
      h: 50,
    })
  })
})
