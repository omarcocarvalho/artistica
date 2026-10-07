import { describe, expect, it } from 'vitest'
import { planTilePixels, tileRenderKey } from '../pixels/tile-plan'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { studyRequestsFor, tileSlot } from './study-requests'

const blur = { blurPct: 40, values: null }
const values = { blurPct: null, values: { count: 5, hue: 55, neutral: false } }

const model = pageModel(
  [
    drawTile({ imageId: id('a'), trim: { x: 10, y: 10, w: 60, h: 80 } }),
    drawTile({
      imageId: id('a'),
      trim: { x: 76, y: 10, w: 60, h: 80 },
      version: 'blurred',
      study: blur,
    }),
    drawTile({
      imageId: id('a'),
      trim: { x: 142, y: 10, w: 60, h: 80 },
      version: 'values',
      study: values,
    }),
  ],
  { index: 2 },
)

describe('studyRequestsFor', () => {
  it('asks for study tiles only, in tile order, keyed like the PDF (version + study in the key)', () => {
    const reqs = studyRequestsFor(model, 96)
    expect(reqs.map((r) => r.slot)).toEqual(['a|blurred|2:1', 'a|values|2:2'])
    const tile = model.tiles[1]
    if (!tile) throw new Error('fixture')
    const plan = planTilePixels(tile, { dpi: 96 })
    expect(reqs[0]).toEqual({
      key: tileRenderKey(tile, plan),
      slot: 'a|blurred|2:1',
      plan,
      study: blur,
      imageId: id('a'),
    })
  })

  it('gives different keys to two versions of the same tile geometry', () => {
    const [b, v] = studyRequestsFor(model, 96)
    expect(b?.key).not.toBe(v?.key)
  })

  it('keeps the slot when only the study settings change, and changes the key', () => {
    const changed = pageModel(
      model.tiles.map((t) =>
        t.version === 'blurred' ? { ...t, study: { blurPct: 80, values: null } } : t,
      ),
      { index: 2 },
    )
    const [before] = studyRequestsFor(model, 96)
    const [after] = studyRequestsFor(changed, 96)
    expect(after?.slot).toBe(before?.slot)
    expect(after?.key).not.toBe(before?.key)
  })

  it('plans at the given dpi', () => {
    const [low] = studyRequestsFor(model, 48)
    const [high] = studyRequestsFor(model, 96)
    expect(high?.plan.outW).toBeGreaterThan(low?.plan.outW ?? Infinity)
    expect(high?.key).not.toBe(low?.key)
  })

  it('is empty for a page of originals', () => {
    expect(studyRequestsFor(pageModel([drawTile()]), 96)).toEqual([])
  })

  it('tileSlot names image, version and position', () => {
    expect(
      tileSlot(0, 3, drawTile({ imageId: id('x'), version: 'blurValues', study: values })),
    ).toBe('x|blurValues|0:3')
  })
})
