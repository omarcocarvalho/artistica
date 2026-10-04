import { describe, expect, it } from 'vitest'
import type { ImageId } from '../shared/model/image'
import type { PageModel } from '../features/render'
import { describePage } from './describe-page'

const a = 'a' as ImageId
const b = 'b' as ImageId
const model = {
  index: 0,
  size: { w: 210, h: 297 },
  safeArea: { x: 5, y: 5, w: 200, h: 287 },
  cropMarks: [],
  tiles: [
    { imageId: a, trim: { x: 10, y: 10, w: 100.04, h: 60.06 } },
    { imageId: b, trim: { x: 10, y: 80, w: 50, h: 50 } },
  ],
} as unknown as PageModel

describe('describePage', () => {
  it('lists each tile with its image name and size rounded to 0.1 mm, in model order', () => {
    expect(
      describePage(
        model,
        new Map([
          [a, 'anna.jpg'],
          [b, 'pears.heic'],
        ]),
      ),
    ).toEqual([
      { imageId: a, name: 'anna.jpg', widthMm: 100, heightMm: 60.1 },
      { imageId: b, name: 'pears.heic', widthMm: 50, heightMm: 50 },
    ])
  })
  it('falls back to the id when a name is unknown', () => {
    expect(describePage(model, new Map())[0]?.name).toBe('a')
  })
})
