import { describe, expect, it } from 'vitest'
import { item, mulberry32, realisticItems } from './fixtures'

describe('fixtures', () => {
  it('builds a single-tile item keyed id#0', () => {
    expect(item('a', 1.5)).toEqual({
      key: 'a#0',
      imageId: 'a',
      aspect: 1.5,
      maxPrintWidthMm: 1000,
      size: { kind: 'auto' },
      tiles: 1,
    })
  })

  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 50; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('realisticItems is deterministic per seed with unique keys and sane caps', () => {
    const items = realisticItems(30, 3)
    expect(items).toEqual(realisticItems(30, 3))
    expect(new Set(items.map((i) => i.key)).size).toBe(30)
    for (const i of items) {
      expect(i.maxPrintWidthMm).toBeGreaterThanOrEqual(40)
      expect(i.maxPrintWidthMm).toBeLessThan(431)
    }
  })
})
