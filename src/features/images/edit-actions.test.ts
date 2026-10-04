import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITS } from '../../shared/model/image'
import { isValidCrop } from './crop'
import {
  resetCrop,
  rotate,
  setAspect,
  setCopies,
  setCrop,
  setFixedAxis,
  setFixedMm,
  setSizeKind,
  toggleFlip,
} from './edit-actions'
import { cropAspectRatio } from './edits'

const d = { pxW: 400, pxH: 300 }

describe('rotate / flip', () => {
  it('rotates clockwise and counter-clockwise, four turns return home', () => {
    let e = DEFAULT_EDITS
    for (let i = 0; i < 4; i++) e = rotate(e, d, 'cw')
    expect(e.rotation).toBe(0)
    expect(rotate(DEFAULT_EDITS, d, 'ccw').rotation).toBe(270)
  })
  it('toggles flips independently', () => {
    const e = toggleFlip(toggleFlip(DEFAULT_EDITS, d, 'h'), d, 'v')
    expect([e.flipH, e.flipV]).toEqual([true, true])
    expect(toggleFlip(e, d, 'h').flipH).toBe(false)
  })
  it('keeps a locked-aspect crop valid after rotating', () => {
    let e = setAspect(DEFAULT_EDITS, d, '1:1')
    e = rotate(setAspect(e, d, '4:3'), d, 'cw')
    const ratio = cropAspectRatio(e.cropAspect, d.pxW, d.pxH, e.rotation)
    expect(e.crop && isValidCrop(e.crop, d.pxW, d.pxH, ratio)).toBe(true)
  })
})

describe('crop', () => {
  it('a fixed aspect creates the largest centred crop; reset returns to the full image', () => {
    const e = setAspect(DEFAULT_EDITS, d, '1:1')
    expect(e.crop).toEqual({ x: 50, y: 0, w: 300, h: 300 })
    const r = resetCrop(e, d)
    expect(r.crop).toBeNull()
    expect(r.cropAspect).toBe('free')
  })
  it('setCrop keeps the chosen aspect and clamps to the image', () => {
    const e = setCrop(setAspect(DEFAULT_EDITS, d, '1:1'), d, { x: 380, y: 280, w: 100, h: 100 })
    expect(e.crop && e.crop.x + e.crop.w <= 400 && e.crop.y + e.crop.h <= 300).toBe(true)
  })
})

describe('copies and size', () => {
  it('clamps copies', () => {
    expect(setCopies(DEFAULT_EDITS, d, 0).copies).toBe(1)
    expect(setCopies(DEFAULT_EDITS, d, 500).copies).toBe(50)
  })
  it('switching to fixed picks a sensible default (<= 100 mm wide, <= the 300 DPI limit)', () => {
    const e = setSizeKind(DEFAULT_EDITS, { pxW: 480, pxH: 640 }, 'fixed')
    expect(e.size.kind).toBe('fixed')
    if (e.size.kind === 'fixed') expect(e.size.mm).toBeLessThanOrEqual(40)
    expect(setSizeKind(e, d, 'auto').size).toEqual({ kind: 'auto' })
  })
  it('switching the axis keeps the physical size; typing a size clamps it', () => {
    const portrait = { pxW: 3000, pxH: 4000 }
    let e = setFixedMm(setSizeKind(DEFAULT_EDITS, portrait, 'fixed'), portrait, 90)
    e = setFixedAxis(e, portrait, 'height')
    expect(e.size).toEqual({ kind: 'fixed', axis: 'height', mm: 120 })
    expect(setFixedMm(e, portrait, 5).size).toMatchObject({ mm: 10 })
  })
  it('setFixedAxis and setFixedMm do nothing in auto mode', () => {
    expect(setFixedAxis(DEFAULT_EDITS, d, 'height').size).toEqual({ kind: 'auto' })
    expect(setFixedMm(DEFAULT_EDITS, d, 50).size).toEqual({ kind: 'auto' })
  })
})
