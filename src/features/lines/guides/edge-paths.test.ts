import { describe, expect, it } from 'vitest'
import type { ImageEdits } from '../../../shared/model/image'
import { descriptor } from '../../render/test-support/fixtures'
import { edgePaths } from './edge-paths'

const img = (edits: Partial<ImageEdits> = {}) => descriptor('a', 1000, 800, edits)

describe('edgePaths', () => {
  it('turns normalised polylines into M + L commands in source px', () => {
    const outline = {
      polylines: [
        [
          { x: 0.1, y: 0.25 },
          { x: 0.2, y: 0.5 },
          { x: 0.3, y: 0.75 },
        ],
      ],
    }
    expect(edgePaths(outline, img())).toEqual([
      { op: 'M', x: 100, y: 200 },
      { op: 'L', x: 200, y: 400 },
      { op: 'L', x: 300, y: 600 },
    ])
  })

  it('drops a polyline of one point', () => {
    const outline = {
      polylines: [
        [{ x: 0.5, y: 0.5 }],
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      ],
    }
    expect(edgePaths(outline, img())).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 1000, y: 800 },
    ])
  })

  it('drops a polyline wholly outside the crop and keeps one crossing its edge whole', () => {
    const crop = { x: 100, y: 80, w: 400, h: 320 }
    const outside = [
      { x: 0.01, y: 0.5 },
      { x: 0.09, y: 0.6 },
    ]
    const crossing = [
      { x: 0.05, y: 0.2 },
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.3 },
    ]
    expect(edgePaths({ polylines: [outside, crossing] }, img({ crop }))).toEqual([
      { op: 'M', x: 50, y: 160 },
      { op: 'L', x: 200, y: 160 },
      { op: 'L', x: 600, y: 240 },
    ])
  })

  it('drops a polyline whose box is outside the crop on one axis only', () => {
    const crop = { x: 100, y: 80, w: 400, h: 320 }
    const belowCrop = [
      { x: 0.2, y: 0.9 },
      { x: 0.3, y: 0.95 },
    ]
    expect(edgePaths({ polylines: [belowCrop] }, img({ crop }))).toEqual([])
  })

  it('keeps the input order', () => {
    const a = [
      { x: 0.5, y: 0.5 },
      { x: 0.6, y: 0.5 },
    ]
    const b = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.1 },
    ]
    expect(edgePaths({ polylines: [a, b] }, img()).map((c) => [c.op, c.x, c.y])).toEqual([
      ['M', 500, 400],
      ['L', 600, 400],
      ['M', 100, 80],
      ['L', 200, 80],
    ])
  })

  it('is empty for an empty outline', () => {
    expect(edgePaths({ polylines: [] }, img())).toEqual([])
  })
})
