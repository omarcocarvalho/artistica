import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Rotation } from '../../shared/model/image'
import { isValidCrop, largestCrop } from './crop'
import { CROP_STEPS, cropStepForKey, stepCrop, type CropStep } from './crop-step'
import type { ViewTransform } from './view'

const upright: ViewTransform = { rotation: 0, flipH: false, flipV: false }
const square = { x: 100, y: 100, w: 100, h: 100 }

describe('cropStepForKey', () => {
  it('maps arrows to moves and Shift + arrows to size steps', () => {
    expect(cropStepForKey('ArrowLeft', false)).toBe('left')
    expect(cropStepForKey('ArrowUp', false)).toBe('up')
    expect(cropStepForKey('ArrowDown', false)).toBe('down')
    expect(cropStepForKey('ArrowRight', false)).toBe('right')
    expect(cropStepForKey('ArrowLeft', true)).toBe('narrower')
    expect(cropStepForKey('ArrowRight', true)).toBe('wider')
    expect(cropStepForKey('ArrowUp', true)).toBe('shorter')
    expect(cropStepForKey('ArrowDown', true)).toBe('taller')
  })

  it('ignores every other key', () => {
    expect(cropStepForKey('a', false)).toBeNull()
    expect(cropStepForKey('Enter', true)).toBeNull()
    expect(cropStepForKey('PageUp', false)).toBeNull()
  })

  it('lists the eight steps in button order', () => {
    expect(CROP_STEPS).toEqual([
      'left',
      'up',
      'down',
      'right',
      'narrower',
      'wider',
      'shorter',
      'taller',
    ])
  })
})

describe('stepCrop', () => {
  // 400 x 300 image: keyboardStep = max(1, round(400 / 200)) = 2 px.
  const step = (s: CropStep, crop = square, ratio: number | null = null, view = upright) =>
    stepCrop(crop, s, { pxW: 400, pxH: 300, ratio, view })

  it.each<[CropStep, { x: number; y: number; w: number; h: number }]>([
    ['left', { x: 98, y: 100, w: 100, h: 100 }],
    ['right', { x: 102, y: 100, w: 100, h: 100 }],
    ['up', { x: 100, y: 98, w: 100, h: 100 }],
    ['down', { x: 100, y: 102, w: 100, h: 100 }],
    ['narrower', { x: 100, y: 100, w: 98, h: 100 }],
    ['wider', { x: 100, y: 100, w: 102, h: 100 }],
    ['shorter', { x: 100, y: 100, w: 100, h: 98 }],
    ['taller', { x: 100, y: 100, w: 100, h: 102 }],
  ])('%s is one keyboard step from the top-left corner (free shape)', (s, want) => {
    expect(step(s)).toEqual(want)
  })

  it('keeps a locked shape on every size step', () => {
    for (const s of ['narrower', 'wider', 'shorter', 'taller'] as const) {
      const r = step(s, square, 1)
      expect(r.w).toBeCloseTo(r.h, 9)
      expect(r.x).toBe(100)
      expect(r.y).toBe(100)
    }
    expect(step('wider', square, 1).w).toBeCloseTo(102, 9)
    expect(step('narrower', square, 1).w).toBeCloseTo(98, 9)
  })

  it('stops at the image edge: a move or growth past it leaves the crop where it is', () => {
    const corner = { x: 300, y: 200, w: 100, h: 100 }
    expect(step('right', corner)).toEqual(corner)
    expect(step('down', corner)).toEqual(corner)
    expect(step('wider', corner)).toEqual(corner)
    expect(step('taller', corner)).toEqual(corner)
    const origin = { x: 0, y: 0, w: 100, h: 100 }
    expect(step('left', origin)).toEqual(origin)
    expect(step('up', origin)).toEqual(origin)
  })

  it('stops at the smallest crop', () => {
    const tiny = { x: 10, y: 10, w: 16, h: 16 }
    expect(step('narrower', tiny)).toEqual(tiny)
    expect(step('shorter', tiny)).toEqual(tiny)
  })

  it('moves and sizes in the displayed frame (rotated 90°: display right = source up)', () => {
    const view: ViewTransform = { rotation: 90, flipH: false, flipV: false }
    expect(step('right', square, null, view)).toEqual({ x: 100, y: 98, w: 100, h: 100 })
    expect(step('down', square, null, view)).toEqual({ x: 102, y: 100, w: 100, h: 100 })
    // Display width is source height; the displayed top-left stays put.
    const wider = step('wider', square, null, view)
    expect(wider).toEqual({ x: 100, y: 98, w: 100, h: 102 })
  })

  it('follows a horizontal flip (display right = source left)', () => {
    const view: ViewTransform = { rotation: 0, flipH: true, flipV: false }
    expect(step('right', square, null, view)).toEqual({ x: 98, y: 100, w: 100, h: 100 })
    expect(step('wider', square, null, view)).toEqual({ x: 98, y: 100, w: 102, h: 100 })
  })

  const rotationArb = fc.constantFrom<Rotation>(0, 90, 180, 270)
  const viewArb = fc.record({ rotation: rotationArb, flipH: fc.boolean(), flipV: fc.boolean() })
  const ratioArb = fc.option(fc.constantFrom(1, 4 / 3, 3 / 4, 16 / 9, 9 / 16), { nil: null })
  const stepArb = fc.constantFrom(...CROP_STEPS)

  it('always returns a valid crop, and the same one for the same inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        ratioArb,
        viewArb,
        fc.array(stepArb, { maxLength: 30 }),
        (pxW, pxH, ratio, view, steps) => {
          let crop = largestCrop(pxW, pxH, ratio)
          for (const s of steps) {
            const next = stepCrop(crop, s, { pxW, pxH, ratio, view })
            expect(stepCrop(crop, s, { pxW, pxH, ratio, view })).toEqual(next)
            expect(isValidCrop(next, pxW, pxH, ratio)).toBe(true)
            crop = next
          }
        },
      ),
    )
  })
})
