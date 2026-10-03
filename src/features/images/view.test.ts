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
  mapPointToSource,
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
  it('a displayed east handle on a 90-degree view is the source north handle', () => {
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

describe('exact mappings on a non-square image (hand-derived)', () => {
  // W=400, H=300, source point (10, 20). Expected values come from rotating the
  // point clockwise (90: (H-y, x), 180: (W-x, H-y), 270: (y, W-x)), then flipping
  // in the displayed frame (display size is 300x400 for 90/270, else 400x300).
  const W = 400
  const H = 300
  type Row = [Rotation, boolean, boolean, { x: number; y: number }]
  const table: Row[] = [
    [0, false, false, { x: 10, y: 20 }],
    [0, true, false, { x: 390, y: 20 }],
    [0, false, true, { x: 10, y: 280 }],
    [0, true, true, { x: 390, y: 280 }],
    [90, false, false, { x: 280, y: 10 }],
    [90, true, false, { x: 20, y: 10 }],
    [90, false, true, { x: 280, y: 390 }],
    [90, true, true, { x: 20, y: 390 }],
    [180, false, false, { x: 390, y: 280 }],
    [180, true, false, { x: 10, y: 280 }],
    [180, false, true, { x: 390, y: 20 }],
    [180, true, true, { x: 10, y: 20 }],
    [270, false, false, { x: 20, y: 390 }],
    [270, true, false, { x: 280, y: 390 }],
    [270, false, true, { x: 20, y: 10 }],
    [270, true, true, { x: 280, y: 10 }],
  ]

  it.each(table)(
    'rotation %i flipH %s flipV %s: point to display and back',
    (rotation, flipH, flipV, display) => {
      const v: ViewTransform = { rotation, flipH, flipV }
      expect(mapPointToDisplay({ x: 10, y: 20 }, v, W, H)).toEqual(display)
      expect(mapPointToSource(display, v, W, H)).toEqual({ x: 10, y: 20 })
    },
  )

  // Source rect (10,20,100,50): corners (10,20) and (110,70).
  const rects: [Rotation, boolean, boolean, { x: number; y: number; w: number; h: number }][] = [
    [180, false, false, { x: 290, y: 230, w: 100, h: 50 }],
    [180, true, false, { x: 10, y: 230, w: 100, h: 50 }],
    [270, false, false, { x: 20, y: 290, w: 50, h: 100 }],
    [270, false, true, { x: 20, y: 10, w: 50, h: 100 }],
  ]
  it.each(rects)(
    'rotation %i flipH %s flipV %s: rect to display',
    (rotation, flipH, flipV, expected) => {
      const v: ViewTransform = { rotation, flipH, flipV }
      expect(mapRectToDisplay({ x: 10, y: 20, w: 100, h: 50 }, v, W, H)).toEqual(expected)
    },
  )

  // Displayed delta (3, 5): undo flips (negate), then undo the clockwise turn.
  const deltas: [Rotation, boolean, boolean, { x: number; y: number }][] = [
    [180, false, false, { x: -3, y: -5 }],
    [180, true, false, { x: 3, y: -5 }],
    [180, false, true, { x: -3, y: 5 }],
    [180, true, true, { x: 3, y: 5 }],
    [270, false, false, { x: -5, y: 3 }],
    [270, true, false, { x: -5, y: -3 }],
    [270, false, true, { x: 5, y: 3 }],
    [270, true, true, { x: 5, y: -3 }],
  ]
  it.each(deltas)(
    'rotation %i flipH %s flipV %s: delta to source',
    (rotation, flipH, flipV, expected) => {
      expect(mapDeltaToSource({ x: 3, y: 5 }, { rotation, flipH, flipV })).toEqual(expected)
    },
  )

  it('viewMatrix for 90 clockwise on 400x300 is [0, 1, -1, 0, 300, 0]', () => {
    expect(viewMatrix({ rotation: 90, flipH: false, flipV: false }, W, H)).toEqual([
      0, 1, -1, 0, 300, 0,
    ])
  })
})
