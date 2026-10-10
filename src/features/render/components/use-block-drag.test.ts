import { describe, expect, it } from 'vitest'
import {
  DRAG_THRESHOLD_PX,
  SNAP_MM,
  movedEnough,
  resizedTileW,
  snapRect,
  swapTargetAt,
} from './use-block-drag'

const content = { x: 10, y: 10, w: 190, h: 277 }
const gutter = 5

describe('movedEnough', () => {
  it.each([
    ['below the threshold', 3, 0, false],
    ['diagonal under it', 2.8, 2.8, false],
    ['at the threshold', DRAG_THRESHOLD_PX, 0, true],
    ['diagonal past it', 3, 3, true],
  ])('%s', (_label, dx, dy, expected) => {
    expect(movedEnough(dx, dy)).toBe(expected)
  })
})

describe('snapRect', () => {
  const others = [{ x: 100, y: 50, w: 40, h: 30 }]

  it('snaps the left edge to the content box within 2 mm', () => {
    expect(snapRect({ x: 11.9, y: 120, w: 30, h: 30 }, content, gutter, others).x).toBe(10)
  })

  it('does not snap beyond 2 mm', () => {
    expect(snapRect({ x: 12.1, y: 120, w: 30, h: 30 }, content, gutter, others).x).toBe(12.1)
  })

  it('snaps the right and bottom edges to the content box', () => {
    const r = snapRect({ x: 168.5, y: 255.5, w: 30, h: 30 }, content, gutter, others)
    expect(r).toEqual({ x: 170, y: 257, w: 30, h: 30 })
  })

  it("snaps a left edge to a neighbour's right edge plus the gutter", () => {
    expect(snapRect({ x: 146, y: 55, w: 20, h: 20 }, content, gutter, others).x).toBe(145)
  })

  it("snaps a right edge to a neighbour's left edge minus the gutter", () => {
    expect(snapRect({ x: 76.5, y: 55, w: 20, h: 20 }, content, gutter, others).x).toBe(75)
  })

  it("snaps a top edge under a neighbour's bottom edge plus the gutter", () => {
    expect(snapRect({ x: 100, y: 86.2, w: 20, h: 20 }, content, gutter, others).y).toBe(85)
  })

  it("snaps a bottom edge above a neighbour's top edge minus the gutter", () => {
    expect(snapRect({ x: 100, y: 23.5, w: 20, h: 20 }, content, gutter, others).y).toBe(25)
  })

  it("does not snap to a neighbour's edge without the gutter", () => {
    expect(snapRect({ x: 141, y: 55, w: 20, h: 20 }, content, gutter, others).x).toBe(141)
  })

  it('picks the nearest candidate', () => {
    const near = [{ x: 30, y: 200, w: 10, h: 10 }]
    expect(snapRect({ x: 11.5, y: 100, w: 14, h: 14 }, content, gutter, near).x).toBe(11)
  })

  it('keeps the size', () => {
    const r = snapRect({ x: 11, y: 11, w: 33, h: 44 }, content, gutter, [])
    expect([r.w, r.h]).toEqual([33, 44])
  })

  it('snaps at exactly SNAP_MM', () => {
    expect(snapRect({ x: 10 + SNAP_MM, y: 120, w: 30, h: 30 }, content, gutter, []).x).toBe(10)
  })
})

describe('resizedTileW', () => {
  const rect = { x: 20, y: 20, w: 100, h: 50 }

  it('grows from the bottom-right handle with the top-left fixed', () => {
    expect(resizedTileW(rect, 40, 'br', { x: 220, y: 120 })).toBeCloseTo(80)
  })

  it('shrinks from the top-left handle with the bottom-right fixed', () => {
    expect(resizedTileW(rect, 40, 'tl', { x: 70, y: 45 })).toBeCloseTo(20)
  })

  it('follows the projection onto the diagonal', () => {
    expect(resizedTileW(rect, 40, 'br', { x: 220, y: 70 })).toBeCloseTo(
      (40 * (200 * 100 + 50 * 50)) / (100 * 100 + 50 * 50),
    )
  })

  it('never goes negative when the pointer crosses the anchor', () => {
    expect(resizedTileW(rect, 40, 'br', { x: 0, y: 0 })).toBe(0)
  })

  it('uses the opposite corner as the anchor for tr and bl', () => {
    expect(resizedTileW(rect, 40, 'tr', { x: 220, y: -30 })).toBeCloseTo(80)
    expect(resizedTileW(rect, 40, 'bl', { x: -80, y: 120 })).toBeCloseTo(80)
  })
})

describe('swapTargetAt', () => {
  const blocks = [
    { id: 'a', page: 0, rect: { x: 10, y: 10, w: 50, h: 50 } },
    { id: 'b', page: 0, rect: { x: 100, y: 10, w: 50, h: 50 } },
    { id: 'c', page: 1, rect: { x: 100, y: 10, w: 50, h: 50 } },
  ]

  it("finds the block whose centre the ghost covers, on the ghost's page", () => {
    expect(swapTargetAt(blocks, 'a', 0, { x: 110, y: 20, w: 50, h: 50 })).toBe('b')
    expect(swapTargetAt(blocks, 'a', 1, { x: 110, y: 20, w: 50, h: 50 })).toBe('c')
  })

  it('ignores the dragged block and blocks whose centre is not covered', () => {
    expect(swapTargetAt(blocks, 'a', 0, { x: 15, y: 15, w: 50, h: 50 })).toBeNull()
    expect(swapTargetAt(blocks, 'a', 0, { x: 126, y: 10, w: 50, h: 50 })).toBeNull()
  })

  it('checks the centre against the ghost height, not its width', () => {
    expect(swapTargetAt(blocks, 'a', 0, { x: 110, y: 0, w: 50, h: 30 })).toBeNull()
    expect(swapTargetAt(blocks, 'a', 0, { x: 110, y: 30, w: 20, h: 40 })).toBe('b')
  })
})
