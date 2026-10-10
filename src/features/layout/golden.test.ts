import { describe, expect, it } from 'vitest'
import { computeLayout } from './compute-layout'
import { GOLDEN_CASES } from './test-support/golden-cases'
import type { LayoutResult } from './types'

/** FNV-1a (32-bit) of a string, as 8 hex digits. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function summary(r: LayoutResult): string {
  const perPage = r.pages.map((p) => p.placements.length).join('+')
  return `${r.orientation} ${String(r.pages.length)}p [${perPage}] ${fnv1a(JSON.stringify(r))}`
}

/**
 * Output stability: exact layouts for a fixed set of inputs. Any change to the search, the packer
 * or their tie-breaks that changes a chosen packing fails here. Update the snapshot only for an
 * intended layout change, and say so in the PR.
 */
describe('computeLayout golden outputs', () => {
  it('matches the recorded layouts', () => {
    expect(
      GOLDEN_CASES.map(
        ([name, setup, items]) => `${name}: ${summary(computeLayout(setup, items))}`,
      ),
    ).toMatchSnapshot()
  })
})
