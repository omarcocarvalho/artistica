import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { traceChains } from './trace'

/** An edge map from rows of '#' (edge) and '.' (not). */
function edgeMap(rows: readonly string[]): { e: Uint8Array; w: number; h: number } {
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const e = new Uint8Array(w * h)
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) e[y * w + x] = row[x] === '#' ? 1 : 0
  })
  return { e, w, h }
}

const xy = (chain: Int32Array, w: number): [number, number][] =>
  Array.from(chain, (i) => [i % w, Math.floor(i / w)])

const isClosed = (c: Int32Array): boolean => c.length > 1 && c[0] === c[c.length - 1]

const adjacent = (a: number, b: number, w: number): boolean => {
  const dx = Math.abs((a % w) - (b % w))
  const dy = Math.abs(Math.floor(a / w) - Math.floor(b / w))
  return a !== b && dx <= 1 && dy <= 1
}

/** Every edge pixel in exactly one chain, once (a closed chain repeats its start at the end). */
function expectExactCover(chains: Int32Array[], e: Uint8Array, w: number): void {
  const seen = new Uint8Array(e.length)
  for (const c of chains) {
    expect(c.length).toBeGreaterThan(0)
    const n = isClosed(c) ? c.length - 1 : c.length
    for (let k = 0; k < n; k++) {
      const i = c[k] ?? -1
      expect(e[i], `pixel ${String(i)} is an edge`).toBe(1)
      expect(seen[i], `pixel ${String(i)} once`).toBe(0)
      seen[i] = 1
    }
    for (let k = 1; k < c.length; k++) {
      expect(adjacent(c[k - 1] ?? -1, c[k] ?? -1, w), 'consecutive pixels touch').toBe(true)
    }
  }
  expect(seen).toEqual(e)
}

describe('traceChains (M4-R15)', () => {
  it('a ring traces to one closed chain', () => {
    const { e, w, h } = edgeMap(['......', '.####.', '.#..#.', '.#..#.', '.####.', '......'])
    const chains = traceChains(e, w, h)
    expect(chains).toHaveLength(1)
    expect(xy(chains[0] ?? new Int32Array(), w)).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
      [3, 4],
      [2, 4],
      [1, 4],
      [1, 3],
      [1, 2],
      [1, 1],
    ])
  })

  it('a diamond ring of diagonal steps traces to one closed chain', () => {
    const { e, w, h } = edgeMap([
      '...#...',
      '..#.#..',
      '.#...#.',
      '#.....#',
      '.#...#.',
      '..#.#..',
      '...#...',
    ])
    const chains = traceChains(e, w, h)
    expect(chains).toHaveLength(1)
    const c = chains[0] ?? new Int32Array()
    expect(isClosed(c)).toBe(true)
    expect(c.length).toBe(13)
    expectExactCover(chains, e, w)
  })

  it('a T junction traces to chains that cover every pixel once', () => {
    const { e, w, h } = edgeMap(['.......', '#######', '...#...', '...#...', '...#...'])
    const chains = traceChains(e, w, h)
    expect(chains.map((c) => xy(c, w))).toEqual([
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
        [4, 1],
        [5, 1],
        [6, 1],
      ],
      [
        [3, 4],
        [3, 3],
        [3, 2],
      ],
    ])
    expectExactCover(chains, e, w)
  })

  it('chains start at the first unvisited endpoint in scan order, then at the first unvisited pixel of a loop', () => {
    const { e, w, h } = edgeMap([
      '###.....',
      '#.#.....',
      '###.....',
      '........',
      '......#.',
      '.....#..',
      '..###...',
      '.......#',
    ])
    const chains = traceChains(e, w, h)
    expect(chains.map((c) => xy(c, w))).toEqual([
      [
        [6, 4],
        [5, 5],
        [4, 6],
        [3, 6],
        [2, 6],
      ],
      [[7, 7]],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
        [2, 2],
        [1, 2],
        [0, 2],
        [0, 1],
        [0, 0],
      ],
    ])
  })

  it('a loop of corner steps waits for the endpoints', () => {
    const { e, w, h } = edgeMap(['.#.....', '#.#....', '.#.....', '.......', '...###.'])
    expect(traceChains(e, w, h).map((c) => xy(c, w))).toEqual([
      [
        [3, 4],
        [4, 4],
        [5, 4],
      ],
      [
        [1, 0],
        [2, 1],
        [1, 2],
        [0, 1],
        [1, 0],
      ],
    ])
  })

  it('an empty map gives no chains and a single pixel gives a one-point chain', () => {
    expect(traceChains(new Uint8Array(12), 4, 3)).toEqual([])
    const one = new Uint8Array(12)
    one[5] = 1
    expect(traceChains(one, 4, 3).map((c) => Array.from(c))).toEqual([[5]])
  })

  it('every edge pixel is in exactly one chain', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 14 }),
        fc.integer({ min: 1, max: 14 }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 5, max: 70 }),
        (w, h, seed, pct) => {
          let s = seed
          const e = new Uint8Array(w * h)
          for (let i = 0; i < e.length; i++) {
            s = (Math.imul(s, 1103515245) + 12345) >>> 0
            e[i] = (s >>> 8) % 100 < pct ? 1 : 0
          }
          const chains = traceChains(e, w, h)
          expectExactCover(chains, e, w)
          for (const c of chains) if (isClosed(c)) expect(c.length).toBeGreaterThan(3)
          expect(traceChains(e, w, h)).toEqual(chains)
        },
      ),
      { numRuns: 300 },
    )
  })
})
