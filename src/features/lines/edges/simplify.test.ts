import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { rdp } from './simplify'

const pairs = (flat: readonly number[]): [number, number][] => {
  const out: [number, number][] = []
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i] ?? NaN, flat[i + 1] ?? NaN])
  return out
}

const distToSegment = (
  [px, py]: [number, number],
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): number => {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2))
  return Math.hypot(px - ax - t * vx, py - ay - t * vy)
}

/** The indices of `kept` in `all`, matched in order (kept must be a subsequence). */
function keptIndices(all: [number, number][], kept: [number, number][]): number[] {
  const idx: number[] = []
  let j = 0
  for (const [x, y] of kept) {
    while (j < all.length && (all[j]?.[0] !== x || all[j]?.[1] !== y)) j++
    expect(j, 'kept points are a subsequence of the input').toBeLessThan(all.length)
    idx.push(j++)
  }
  return idx
}

const squareRing = (x0: number, y0: number, x1: number, y1: number): number[] => {
  const pts: number[] = []
  for (let x = x0; x < x1; x++) pts.push(x, y0)
  for (let y = y0; y < y1; y++) pts.push(x1, y)
  for (let x = x1; x > x0; x--) pts.push(x, y1)
  for (let y = y1; y > y0; y--) pts.push(x0, y)
  pts.push(x0, y0)
  return pts
}

/** A random 8-connected walk that never revisits a pixel, open or closed, as traced chains are. */
const walk = fc
  .tuple(
    fc.integer({ min: 0, max: 50 }),
    fc.integer({ min: 0, max: 50 }),
    fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 1, maxLength: 120 }),
    fc.boolean(),
  )
  .map(([x0, y0, steps, close]) => {
    const dirs = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ]
    const pts = [x0, y0]
    const seen = new Set([`${String(x0)},${String(y0)}`])
    let [x, y] = [x0, y0]
    for (const s of steps) {
      const [dx, dy] = dirs[s] ?? [0, 0]
      const key = `${String(x + (dx ?? 0))},${String(y + (dy ?? 0))}`
      if (seen.has(key)) continue
      seen.add(key)
      x += dx ?? 0
      y += dy ?? 0
      pts.push(x, y)
    }
    if (close && pts.length >= 6) pts.push(x0, y0)
    return pts
  })

const scattered = fc
  .uniqueArray(fc.tuple(fc.integer({ min: -60, max: 60 }), fc.integer({ min: -60, max: 60 })), {
    minLength: 1,
    maxLength: 60,
    selector: ([x, y]) => `${String(x)},${String(y)}`,
  })
  .map((ps) => ps.flat())

describe('rdp (M4-R16)', () => {
  it('rdp keeps the end points', () => {
    const pts = [0, 0, 3, 1, 5, 0, 7, 4, 9, 2]
    const out = rdp(pts, 1)
    expect(out.slice(0, 2)).toEqual([0, 0])
    expect(out.slice(-2)).toEqual([9, 2])
    expect(rdp([4, 7], 1)).toEqual([4, 7])
    expect(rdp([4, 7, 5, 8], 1)).toEqual([4, 7, 5, 8])
    expect(rdp([], 1)).toEqual([])
  })

  it('a straight run becomes two points', () => {
    const across = Array.from({ length: 11 }, (_, i) => [i, 3]).flat()
    expect(rdp(across, 1)).toEqual([0, 3, 10, 3])
    const diagonal = Array.from({ length: 9 }, (_, i) => [2 + i, 9 - i]).flat()
    expect(rdp(diagonal, 1)).toEqual([2, 9, 10, 1])
    const shallow = Array.from({ length: 21 }, (_, i) => [i, i >> 2]).flat()
    expect(rdp(shallow, 1)).toEqual([0, 0, 20, 5])
  })

  it('a square ring becomes its 4 corners plus the closing point', () => {
    expect(rdp(squareRing(2, 3, 11, 9), 1)).toEqual([2, 3, 11, 3, 11, 9, 2, 9, 2, 3])
  })

  it('drops a point exactly epsilon off the chord and keeps one farther', () => {
    expect(rdp([0, 0, 2, 1, 4, 0], 1)).toEqual([0, 0, 4, 0])
    expect(rdp([0, 0, 2, 2, 4, 0], 1)).toEqual([0, 0, 2, 2, 4, 0])
    expect(rdp([0, 0, 3, 5, 6, 0], 5)).toEqual([0, 0, 6, 0])
    expect(rdp([0, 0, 3, 6, 6, 0], 5)).toEqual([0, 0, 3, 6, 6, 0])
    expect(rdp([0, 0, 1, 1, 3, 1], 1)).toEqual([0, 0, 3, 1])
  })

  it('measures to the segment, not its line: a hairpin keeps its tip', () => {
    expect(rdp([0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 2], 1)).toEqual([0, 0, 0, 5, 0, 2])
    expect(rdp([3, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0], 1)).toEqual([
      3, 0, 0, 0, 5, 0,
    ])
  })

  it('of equally far points, keeps the first', () => {
    expect(rdp([0, 0, 1, 2, 2, 2, 3, 0], 1)).toEqual([0, 0, 1, 2, 3, 0])
  })

  it('keeps the farthest point of a closed loop from its start', () => {
    expect(rdp([0, 0, 1, 0, 2, 0, 1, 1, 0, 0], 1)).toEqual([0, 0, 2, 0, 0, 0])
  })

  it('every dropped point is within epsilon of the kept polyline', () => {
    fc.assert(
      fc.property(fc.oneof(walk, scattered), fc.integer({ min: 1, max: 4 }), (pts, eps) => {
        const all = pairs(pts)
        const kept = pairs(rdp(pts, eps))
        expect(kept[0]).toEqual(all[0])
        expect(kept[kept.length - 1]).toEqual(all[all.length - 1])
        const idx = keptIndices(all, kept)
        expect(idx[0]).toBe(0)
        expect(idx[idx.length - 1]).toBe(all.length - 1)
        for (let s = 1; s < idx.length; s++) {
          const a = idx[s - 1] ?? 0
          const b = idx[s] ?? 0
          for (let k = a + 1; k < b; k++) {
            const d = distToSegment(all[k] ?? [0, 0], all[a] ?? [0, 0], all[b] ?? [0, 0])
            expect(d).toBeLessThanOrEqual(eps + 1e-9)
          }
        }
      }),
      { numRuns: 400 },
    )
  })
})
