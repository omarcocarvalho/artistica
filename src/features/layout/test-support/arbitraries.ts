import fc from 'fast-check'
import type { ImageId, SizeMode } from '../../../shared/model/image'
import { normalizePageSetup, type PageSetup } from '../../../shared/model/page-setup'
import { PAPER_IDS } from '../../../shared/model/paper'
import type { LayoutItemInput } from '../types'

const mm = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true })

/** Any page setup the settings store could hold (normalised, like the store does). */
export const pageSetupArb: fc.Arbitrary<PageSetup> = fc
  .record({
    paper: fc.constantFrom(...PAPER_IDS),
    a: mm(50, 600),
    b: mm(50, 600),
    orientation: fc.constantFrom('auto' as const, 'portrait' as const, 'landscape' as const),
    safeAreaMm: mm(3, 20),
    gutterOn: fc.boolean(),
    gutterMm: mm(0, 15),
    cropMarks: fc.boolean(),
    bleedOn: fc.boolean(),
    bleedMm: mm(0, 5),
  })
  .map(
    (r) =>
      normalizePageSetup({
        paper: r.paper,
        customSize: { w: Math.min(r.a, r.b), h: Math.max(r.a, r.b) },
        orientation: r.orientation,
        safeAreaMm: r.safeAreaMm,
        gutter: { enabled: r.gutterOn, mm: r.gutterMm },
        cropMarks: r.cropMarks,
        bleed: { enabled: r.bleedOn, mm: r.bleedMm },
      }).setup,
  )

const sizeModeArb: fc.Arbitrary<SizeMode> = fc.oneof(
  { weight: 3, arbitrary: fc.constant({ kind: 'auto' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('fixed' as const),
      axis: fc.constantFrom('width' as const, 'height' as const),
      mm: mm(10, 500),
    }),
  },
)

/** Layout items with unique keys; tiles up to 3 so M2 groups are exercised too. */
export function itemsArb(maxItems: number, maxTiles = 3): fc.Arbitrary<LayoutItemInput[]> {
  return fc
    .array(
      fc.record({
        aspect: mm(0.2, 5),
        maxPrintWidthMm: mm(10, 450),
        size: sizeModeArb,
        tiles: fc.integer({ min: 1, max: maxTiles }),
      }),
      { maxLength: maxItems },
    )
    .map((rows) =>
      rows.map((r, i) => ({
        ...r,
        key: `img${String(i)}#0`,
        imageId: `img${String(i)}` as ImageId,
      })),
    )
}
