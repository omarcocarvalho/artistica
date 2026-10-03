import { describe, expect, it } from 'vitest'
import { CUSTOM_PAPER_LIMITS, PAPER_IDS, PAPER_SIZES } from './paper'

describe('paper', () => {
  it('has the exact portrait sizes', () => {
    expect(PAPER_SIZES.A3).toEqual({ w: 297, h: 420 })
    expect(PAPER_SIZES.A4).toEqual({ w: 210, h: 297 })
    expect(PAPER_SIZES.A5).toEqual({ w: 148, h: 210 })
    expect(PAPER_SIZES.A6).toEqual({ w: 105, h: 148 })
    expect(PAPER_SIZES.Letter).toEqual({ w: 215.9, h: 279.4 })
    expect(PAPER_SIZES.Legal).toEqual({ w: 215.9, h: 355.6 })
    expect(PAPER_SIZES.Tabloid).toEqual({ w: 279.4, h: 431.8 })
  })

  it('lists papers in UI order, Custom last', () => {
    expect(PAPER_IDS).toEqual(['A4', 'Letter', 'A3', 'A5', 'A6', 'Legal', 'Tabloid', 'Custom'])
  })

  it('has a size for every non-custom id, all portrait', () => {
    for (const id of PAPER_IDS) {
      if (id === 'Custom') continue
      const size = PAPER_SIZES[id]
      expect(size.w).toBeLessThan(size.h)
    }
  })

  it('limits custom sizes to 50..1200 mm', () => {
    expect(CUSTOM_PAPER_LIMITS).toEqual({ minMm: 50, maxMm: 1200 })
  })
})
