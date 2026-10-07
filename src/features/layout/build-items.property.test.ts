import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITS,
  type ImageDescriptor,
  type ImageId,
  type SizeMode,
} from '../../shared/model/image'
import { gutterMm, normalizePageSetup, type PageSetup } from '../../shared/model/page-setup'
import { DEFAULT_STUDY, STUDY_VERSIONS, studyKey, tileStudyFor } from '../../shared/model/study'
import { buildLayoutItems } from './build-items'
import { computeLayout } from './compute-layout'
import { nth } from './nth'
import { pageSetupArb } from './test-support/arbitraries'
import { expectLayoutInvariants, separation, TOL } from './test-support/invariants'
import type { LayoutResult, Placement } from './types'

interface Photo {
  readonly hash: string
  readonly pxW: number
  readonly pxH: number
  readonly copies: number
  readonly size: SizeMode
  readonly versions: readonly (typeof STUDY_VERSIONS)[number][]
  readonly valueCount?: number
}

const sizeArb: fc.Arbitrary<SizeMode> = fc.oneof(
  { weight: 3, arbitrary: fc.constant({ kind: 'auto' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('fixed' as const),
      axis: fc.constantFrom('width' as const, 'height' as const),
      mm: fc.integer({ min: 30, max: 250 }),
    }),
  },
)

const photosArb: fc.Arbitrary<Photo[]> = fc
  .array(
    fc.record({
      pxW: fc.integer({ min: 200, max: 6000 }),
      pxH: fc.integer({ min: 200, max: 6000 }),
      copies: fc.oneof(
        { weight: 3, arbitrary: fc.constant(1) },
        { weight: 1, arbitrary: fc.constant(2) },
      ),
      size: sizeArb,
      versions: fc.subarray([...STUDY_VERSIONS], { minLength: 1 }),
    }),
    { minLength: 1, maxLength: 6 },
  )
  .map((rows) => rows.map((r, i) => ({ ...r, hash: `bytes-${String(i)}` })))

function descriptors(photos: readonly Photo[], idPrefix: string): ImageDescriptor[] {
  return photos.map((p, i) => ({
    id: `${idPrefix}-${String(i)}` as ImageId,
    contentHash: p.hash,
    pxW: p.pxW,
    pxH: p.pxH,
    edits: { ...DEFAULT_EDITS, copies: p.copies, size: p.size },
    study: {
      ...DEFAULT_STUDY,
      versions: p.versions,
      values: { ...DEFAULT_STUDY.values, count: p.valueCount ?? DEFAULT_STUDY.values.count },
    },
  }))
}

const printedStudies = (image: ImageDescriptor): string =>
  image.study.versions.map((v) => v + studyKey(tileStudyFor(v, image.study))).join(',')

/** Placements keyed by what prints (bytes, studies, copy), so sessions with different ids compare equal. */
function arrangement(images: readonly ImageDescriptor[], result: LayoutResult) {
  const printOf = new Map(
    images.map((i) => [i.id as string, `${i.contentHash}|${printedStudies(i)}`]),
  )
  return result.pages.flatMap((page, pageIndex) =>
    page.placements.map((p) => ({
      print: printOf.get(p.imageId),
      copy: p.key.slice(p.key.indexOf('#')),
      page: pageIndex,
      block: p.block,
      tiles: p.tiles,
      turned: p.turned,
    })),
  )
}

function expectTilesInLine(p: Placement, gutter: number): void {
  for (let i = 1; i < p.tiles.length; i++) {
    const prev = nth(p.tiles, i - 1)
    const cur = nth(p.tiles, i)
    expect(Math.abs(separation(prev, cur) - gutter)).toBeLessThanOrEqual(TOL * Math.max(1, gutter))
    expect(Math.abs(cur.w - prev.w)).toBeLessThanOrEqual(TOL * Math.max(1, prev.w))
    expect(Math.abs(cur.h - prev.h)).toBeLessThanOrEqual(TOL * Math.max(1, prev.h))
  }
  const reading = [...p.tiles].sort((a, b) => a.y - b.y || a.x - b.x)
  const sameY = reading.every((t) => Math.abs(t.y - nth(reading, 0).y) <= TOL)
  const sameX = reading.every((t) => Math.abs(t.x - nth(reading, 0).x) <= TOL)
  expect(p.tiles.length === 1 || sameY !== sameX).toBe(true)
  for (let i = 1; i < reading.length; i++) {
    const prev = nth(reading, i - 1)
    const cur = nth(reading, i)
    expect(sameY ? cur.x >= prev.x + prev.w - TOL : cur.y >= prev.y + prev.h - TOL).toBe(true)
  }
}

const HEAVY = { timeout: 11_000 }

describe('study groups from loaded images (properties)', () => {
  it('prints every copy as one intact group of its versions, on one page', HEAVY, () => {
    fc.assert(
      fc.property(pageSetupArb, photosArb, (setup: PageSetup, photos) => {
        const images = descriptors(photos, 'id')
        const items = buildLayoutItems(images)
        const result = computeLayout(setup, items)
        expectLayoutInvariants(setup, items, result)
        if (result.pages.length === 0) return
        const g = gutterMm(normalizePageSetup(setup).setup)
        const pagesOf = new Map<string, number[]>()
        result.pages.forEach((page, pageIndex) => {
          for (const p of page.placements) {
            pagesOf.set(p.key, [...(pagesOf.get(p.key) ?? []), pageIndex])
            expectTilesInLine(p, g)
          }
        })
        images.forEach((image, i) => {
          const photo = nth(photos, i)
          const groups = result.pages.flatMap((page) =>
            page.placements.filter((p) => p.imageId === image.id),
          )
          expect(groups).toHaveLength(photo.copies)
          for (const p of groups) {
            expect(p.tiles).toHaveLength(photo.versions.length)
            expect(pagesOf.get(p.key)).toHaveLength(1)
          }
        })
      }),
      { numRuns: 150 },
    )
  })

  it('is the same for the same photos in any order and session', HEAVY, () => {
    fc.assert(
      fc.property(
        pageSetupArb,
        photosArb.chain((photos) =>
          fc.tuple(fc.constant(photos), fc.shuffledSubarray(photos, { minLength: photos.length })),
        ),
        (setup, [photos, shuffled]) => {
          const first = descriptors(photos, 'aaa')
          const again = computeLayout(setup, buildLayoutItems(first))
          expect(computeLayout(setup, buildLayoutItems(first))).toEqual(again)
          const other = descriptors(shuffled, 'zzz')
          expect(arrangement(other, computeLayout(setup, buildLayoutItems(other)))).toEqual(
            arrangement(first, again),
          )
        },
      ),
      { numRuns: 80 },
    )
  })

  it('is the same for duplicate photos with different study settings in any order', HEAVY, () => {
    const duplicatesArb = fc
      .record({
        pxW: fc.integer({ min: 200, max: 6000 }),
        pxH: fc.integer({ min: 200, max: 6000 }),
        variants: fc.uniqueArray(
          fc.record({
            copies: fc.constantFrom(1, 2),
            versions: fc.subarray([...STUDY_VERSIONS], { minLength: 1 }),
            valueCount: fc.constantFrom(3, 5),
          }),
          {
            minLength: 2,
            maxLength: 3,
            selector: (v) =>
              v.versions
                .map((x) => (x === 'values' || x === 'blurValues' ? x + String(v.valueCount) : x))
                .join(),
          },
        ),
      })
      .map(({ pxW, pxH, variants }): Photo[] =>
        variants.map((v) => ({ ...v, hash: 'same-bytes', pxW, pxH, size: { kind: 'auto' } })),
      )
    fc.assert(
      fc.property(
        pageSetupArb,
        fc
          .tuple(duplicatesArb, photosArb)
          .map(([duplicates, others]) => [...duplicates, ...others])
          .chain((photos) =>
            fc.tuple(
              fc.constant(photos),
              fc.shuffledSubarray(photos, { minLength: photos.length }),
            ),
          ),
        (setup, [photos, shuffled]) => {
          const first = descriptors(photos, 'aaa')
          const other = descriptors(shuffled, 'zzz')
          expect(arrangement(other, computeLayout(setup, buildLayoutItems(other)))).toEqual(
            arrangement(first, computeLayout(setup, buildLayoutItems(first))),
          )
        },
      ),
      { numRuns: 150 },
    )
  })

  it('changes nothing but the tile count when versions change', () => {
    fc.assert(
      fc.property(photosArb, (photos) => {
        const studied = buildLayoutItems(descriptors(photos, 'id'))
        const originals = buildLayoutItems(
          descriptors(
            photos.map((p) => ({ ...p, versions: DEFAULT_STUDY.versions })),
            'id',
          ),
        )
        expect(originals.every((it) => it.tiles === 1)).toBe(true)
        expect(studied.map((it) => ({ ...it, tiles: 1 }))).toEqual(originals)
      }),
      { numRuns: 200 },
    )
  })
})
