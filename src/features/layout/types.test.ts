import { describe, expectTypeOf, it } from 'vitest'
import type { ImageId, SizeMode } from '../../shared/model/image'
import type { SizeMm } from '../../shared/model/paper'
import type { Mm } from '../../shared/model/units'
import type { LayoutItemInput, LayoutResult, Placement, PlacementWarning, RectMm } from './index'

describe('layout contract types', () => {
  it('LayoutItemInput has the contract fields', () => {
    expectTypeOf<LayoutItemInput['key']>().toEqualTypeOf<string>()
    expectTypeOf<LayoutItemInput['imageId']>().toEqualTypeOf<ImageId>()
    expectTypeOf<LayoutItemInput['aspect']>().toEqualTypeOf<number>()
    expectTypeOf<LayoutItemInput['maxPrintWidthMm']>().toEqualTypeOf<Mm>()
    expectTypeOf<LayoutItemInput['size']>().toEqualTypeOf<SizeMode>()
    expectTypeOf<LayoutItemInput['tiles']>().toEqualTypeOf<number>()
  })

  it('Placement and RectMm have the contract fields', () => {
    expectTypeOf<RectMm>().toEqualTypeOf<{
      readonly x: Mm
      readonly y: Mm
      readonly w: Mm
      readonly h: Mm
    }>()
    expectTypeOf<Placement['block']>().toEqualTypeOf<RectMm>()
    expectTypeOf<Placement['tiles']>().toEqualTypeOf<readonly RectMm[]>()
    expectTypeOf<Placement['turned']>().toEqualTypeOf<boolean>()
    expectTypeOf<Placement['warnings']>().toEqualTypeOf<readonly PlacementWarning[]>()
    expectTypeOf<PlacementWarning>().toEqualTypeOf<'low-dpi' | 'scaled-to-fit'>()
  })

  it('LayoutResult has the contract fields', () => {
    expectTypeOf<LayoutResult['orientation']>().toEqualTypeOf<'portrait' | 'landscape'>()
    expectTypeOf<LayoutResult['pageSize']>().toEqualTypeOf<SizeMm>()
    expectTypeOf<LayoutResult['pages']>().toEqualTypeOf<
      readonly { readonly placements: readonly Placement[] }[]
    >()
    expectTypeOf<LayoutResult['suggestedPerPage']>().toEqualTypeOf<number>()
  })
})
