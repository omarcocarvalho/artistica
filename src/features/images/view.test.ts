import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Rotation } from '../../shared/model/image'
import { HANDLES } from './crop'
import {
  displaySize,
  mapDeltaToSource,
  mapHandleToSource,
  mapPointToDisplay,
  mapRectToDisplay,
  mapRectToSource,
  rotateBy,
  viewMatrix,
  type ViewTransform,
} from './view'

const viewArb = fc.record({
  rotation: fc.constantFrom<Rotation>(0, 90, 180, 270),
  flipH: fc.boolean(),
  flipV: fc.boolean(),
})
const dim = fc.integer({ min: 1, max: 5000 })

describe('rotateBy', () => {
  it('composes: four quarter turns are the identity, and +90 then -90 cancels', () => {
    let r: Rotation = 90
    for (let i = 0; i < 4; i++) r = rotateBy(r, 90)
    expect(r).toBe(90)
    expect(rotateBy(rotateBy(180, 90), -90)).toBe(180)
    expect(rotateBy(0, -90)).toBe(270)
  })
})

describe('mapPointToDisplay', () => {
  const none = { rotation: 0, flipH: false, flipV: false } as const
  it('rotating 90 clockwise sends the top-left corner to the top-right', () => {
    expect(mapPointToDisplay({ x: 0, y: 0 }, { ...none, rotation: 90 }, 400, 300)).toEqual({
      x: 300,
      y: 0,
    })
  })
  it('flips apply after rotation, in the displayed frame', () => {
    expect(
      mapPointToDisplay({ x: 0, y: 0 }, { rotation: 90, flipH: true, flipV: false }, 400, 300),
    ).toEqual({ x: 0, y: 0 })
    expect(mapPointToDisplay({ x: 0, y: 0 }, { ...none, flipV: true }, 400, 300)).toEqual({
      x: 0,
      y: 300,
    })
  })
  it('displaySize swaps for quarter turns', () => {
    expect(displaySize(400, 300, 90)).toEqual({ w: 300, h: 400 })
    expect(displaySize(400, 300, 180)).toEqual({ w: 400, h: 300 })
  })
})

describe('round trips (property)', () => {
  it('rect: source -> display -> source is the identity, and area is preserved', () => {
    fc.assert(
      fc.property(viewArb, dim, dim, (v, W, H) => {
        const r = { x: W * 0.1, y: H * 0.2, w: W * 0.5, h: H * 0.4 }
        const d = mapRectToDisplay(r, v, W, H)
        const back = mapRectToSource(d, v, W, H)
        for (const k of ['x', 'y', 'w', 'h'] as const) expect(back[k]).toBeCloseTo(r[k], 6)
        expect(d.w * d.h).toBeCloseTo(r.w * r.h, 4)
        const ds = displaySize(W, H, v.rotation)
        expect(d.x).toBeGreaterThanOrEqual(-1e-9)
        expect(d.x + d.w).toBeLessThanOrEqual(ds.w + 1e-9)
        expect(d.y + d.h).toBeLessThanOrEqual(ds.h + 1e-9)
      }),
    )
  })

  it('a displayed delta maps back to the source delta that produces it', () => {
    fc.assert(
      fc.property(viewArb, dim, dim, (v, W, H) => {
        const p = { x: W * 0.3, y: H * 0.3 }
        const q = { x: p.x + W * 0.1, y: p.y + H * 0.05 }
        const dp = mapPointToDisplay(p, v, W, H)
        const dq = mapPointToDisplay(q, v, W, H)
        const s = mapDeltaToSource({ x: dq.x - dp.x, y: dq.y - dp.y }, v)
        expect(s.x).toBeCloseTo(q.x - p.x, 6)
        expect(s.y).toBeCloseTo(q.y - p.y, 6)
      }),
    )
  })

  it('handle mapping is a bijection on the eight handles', () => {
    fc.assert(
      fc.property(viewArb, (v) => {
        expect(new Set(HANDLES.map((h) => mapHandleToSource(h, v))).size).toBe(8)
      }),
    )
  })
})

describe('mapHandleToSource', () => {
  it('a displayed east handle on a 90-degree view is the source south handle', () => {
    // display X = H - y, so dragging right in the display moves up in the source: east -> north.
    const v: ViewTransform = { rotation: 90, flipH: false, flipV: false }
    expect(mapHandleToSource('e', v)).toBe('n')
    expect(mapHandleToSource('se', { rotation: 0, flipH: true, flipV: false })).toBe('sw')
  })
})

describe('viewMatrix', () => {
  it('maps source corners onto display corners', () => {
    fc.assert(
      fc.property(viewArb, dim, dim, (v, W, H) => {
        const [a, b, c, d, e, f] = viewMatrix(v, W, H)
        const p = mapPointToDisplay({ x: W, y: H }, v, W, H)
        expect(a * W + c * H + e).toBeCloseTo(p.x, 6)
        expect(b * W + d * H + f).toBeCloseTo(p.y, 6)
      }),
    )
  })
})
