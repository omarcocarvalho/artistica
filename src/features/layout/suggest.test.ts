import { describe, expect, it } from 'vitest'
import { suggestedPerPage } from './suggest'

describe('suggestedPerPage', () => {
  it('counts 90×60 mm references in a grid on A4 with the default setup', () => {
    // content 190×277, gutter 6: 2 across × 4 down landscape = 8
    expect(suggestedPerPage({ w: 190, h: 277 }, 6)).toBe(8)
  })
  it('is the same for both orientations', () => {
    expect(suggestedPerPage({ w: 277, h: 190 }, 6)).toBe(8)
  })
  it('counts Letter, A3, A5 and A6 (default setup content boxes)', () => {
    expect(suggestedPerPage({ w: 195.9, h: 259.4 }, 6)).toBe(8)
    expect(suggestedPerPage({ w: 277, h: 400 }, 6)).toBe(16) // 4 × 4 portrait beats 2 × 6 landscape
    expect(suggestedPerPage({ w: 128, h: 190 }, 6)).toBe(4)
    expect(suggestedPerPage({ w: 85, h: 128 }, 6)).toBe(1)
  })
  it('is at least 1 when the page is smaller than one reference', () => {
    expect(suggestedPerPage({ w: 30, h: 30 }, 6)).toBe(1)
  })
  it('is 0 when nothing fits', () => {
    expect(suggestedPerPage({ w: -5, h: 30 }, 6)).toBe(0)
  })
})
