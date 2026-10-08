import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { cannyEdges, toGrey } from './canny'
import { edgeParams } from './detail'
import { EDGE_ANALYSIS_LONG_SIDE, MAX_EDGE_VERTICES, edgeOutline, outlineOfEdges } from './outline'
import { rdp } from './simplify'
import { noise, square, stillLife } from './test-support/synthetic'
import { traceChains } from './trace'

const HEAVY = { timeout: 11_000 }

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

const vertices = (polylines: readonly (readonly unknown[])[]): number =>
  polylines.reduce((s, p) => s + p.length, 0)

const pixelCount = (c: Int32Array): number =>
  c.length > 1 && c[0] === c[c.length - 1] ? c.length - 1 : c.length

/** Polyline `p` as pixel coordinates of a w × h image. */
const toPixels = (p: readonly { x: number; y: number }[], w: number, h: number): number[] =>
  p.flatMap(({ x, y }) => [Math.round(x * w - 0.5), Math.round(y * h - 0.5)])

describe('edge outline constants', () => {
  it('EDGE_ANALYSIS_LONG_SIDE is 1024 and MAX_EDGE_VERTICES is 4000', () => {
    expect(EDGE_ANALYSIS_LONG_SIDE).toBe(1024)
    expect(MAX_EDGE_VERTICES).toBe(4000)
  })
})

describe('outlineOfEdges (M4-R16)', () => {
  it('points are pixel centres normalised to the image: ((x + 0.5) / w, (y + 0.5) / h)', () => {
    const { e, w, h } = edgeMap(['.....', '.###.', '.....', '.....'])
    expect(outlineOfEdges(e, w, h, 1)).toEqual([
      [
        { x: 1.5 / 5, y: 1.5 / 4 },
        { x: 3.5 / 5, y: 1.5 / 4 },
      ],
    ])
  })

  it('chains shorter than minChainPx are dropped', () => {
    const { e, w, h } = edgeMap([
      '#####......',
      '...........',
      '####.......',
      '...........',
      '###...###..',
      '#.#...#.#..',
      '###...#.#..',
    ])
    const kept = (min: number) => outlineOfEdges(e, w, h, min).map((p) => toPixels(p, w, h))
    const ring = [0, 4, 2, 4, 2, 6, 0, 6, 0, 4]
    const arch = [6, 6, 6, 4, 8, 4, 8, 6]
    expect(kept(4)).toEqual([ring, arch, [0, 0, 4, 0], [0, 2, 3, 2]])
    expect(kept(5)).toEqual([ring, arch, [0, 0, 4, 0]])
    expect(kept(6)).toEqual([ring, arch])
    expect(kept(8)).toEqual([ring])
    expect(kept(9)).toEqual([])

    const dot = edgeMap(['...', '.#.', '...'])
    expect(outlineOfEdges(dot.e, dot.w, dot.h, 1)).toEqual([[{ x: 0.5, y: 0.5 }]])
    expect(outlineOfEdges(dot.e, dot.w, dot.h, 2)).toEqual([])
  })

  it('keeps chains longest first, ties by first point, while they fit the budget', () => {
    const { e, w, h } = edgeMap([
      '...#....#.',
      '..#....#..',
      '.#....#...',
      '#....#....',
      '..........',
      '###.......',
      '#.#.......',
      '###.......',
    ])
    const at = (budget: number) => outlineOfEdges(e, w, h, 1, budget).map((p) => toPixels(p, w, h))
    const ring = [0, 5, 2, 5, 2, 7, 0, 7, 0, 5]
    const first = [3, 0, 0, 3]
    const second = [8, 0, 5, 3]
    expect(at(100)).toEqual([ring, first, second])
    expect(at(9)).toEqual([ring, first, second])
    expect(at(8)).toEqual([ring, first])
    expect(at(4)).toEqual([first, second])
    expect(at(3)).toEqual([first])
    expect(at(1)).toEqual([])
  })

  it('ties go to the first point in scan order, not to the trace order', () => {
    const { e, w, h } = edgeMap(['###.....', '#.#.....', '###.....', '........', '########'])
    const out = outlineOfEdges(e, w, h, 1).map((p) => toPixels(p, w, h))
    expect(out).toEqual([
      [0, 0, 2, 0, 2, 2, 0, 2, 0, 0],
      [0, 4, 7, 4],
    ])
    expect(Array.from(traceChains(e, w, h)[0] ?? [])).toEqual([32, 33, 34, 35, 36, 37, 38, 39])
  })

  it(
    'the outline keeps at most MAX_EDGE_VERTICES points, longest chains first, ties by first point',
    HEAVY,
    () => {
      const [w, h] = [512, 384]
      const img = noise(w, h, 7)
      const out = edgeOutline(img, w, h, 100)
      expect(vertices(out)).toBeLessThanOrEqual(MAX_EDGE_VERTICES)
      expect(vertices(out)).toBeGreaterThan(MAX_EDGE_VERTICES - 50)

      const { minChainPx } = edgeParams(100)
      const chains = traceChains(cannyEdges(toGrey(img, w, h), edgeParams(100)), w, h)
        .filter((c) => pixelCount(c) >= minChainPx)
        .sort((a, b) => pixelCount(b) - pixelCount(a) || (a[0] ?? 0) - (b[0] ?? 0))
      const simplified = chains.map((c) =>
        rdp(
          Array.from(c).flatMap((i) => [i % w, Math.floor(i / w)]),
          1,
        ),
      )
      const total = simplified.reduce((s, p) => s + p.length / 2, 0)
      expect(total).toBeGreaterThan(MAX_EDGE_VERTICES)

      const expected: number[][] = []
      let used = 0
      for (const p of simplified) {
        if (used + p.length / 2 > MAX_EDGE_VERTICES) continue
        used += p.length / 2
        expected.push(p)
      }
      expect(out.map((p) => toPixels(p, w, h))).toEqual(expected)
      expect(new Set(chains.map((c) => pixelCount(c))).size).toBeLessThan(chains.length)
    },
  )
})

describe('edgeOutline (M4-R15, M4-R16)', () => {
  it('the chains cover exactly the edge pixels at every detail', HEAVY, () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 1, max: 100 }),
        (seed, w, h, detail) => {
          const edges = cannyEdges(toGrey(noise(w, h, seed), w, h), edgeParams(detail))
          const covered = new Uint8Array(w * h)
          for (const c of traceChains(edges, w, h)) {
            for (let k = 0; k < pixelCount(c); k++) {
              const i = c[k] ?? -1
              expect(covered[i]).toBe(0)
              covered[i] = 1
            }
          }
          expect(covered).toEqual(edges)
        },
      ),
      { numRuns: 150 },
    )
  })

  it("drops chains shorter than the detail's minChainPx", () => {
    const [w, h] = [24, 20]
    const small = square(w, h, 8, 8, 13, 13)
    const ringPx = pixelCount(
      traceChains(cannyEdges(toGrey(small, w, h), edgeParams(50)), w, h)[0] ?? new Int32Array(),
    )
    expect(ringPx).toBeGreaterThanOrEqual(edgeParams(100).minChainPx)
    expect(ringPx).toBeLessThan(edgeParams(50).minChainPx)
    expect(edgeOutline(small, w, h, 50)).toEqual([])
    expect(edgeOutline(small, w, h, 100)).toHaveLength(1)
  })

  it('on the still life, more detail gives more kept vertices', () => {
    const { rgba, w, h } = stillLife()
    const [low, mid, high] = [25, 50, 75].map((d) => vertices(edgeOutline(rgba, w, h, d)))
    expect(low).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(low ?? Infinity)
    expect(high).toBeGreaterThan(mid ?? Infinity)
  })

  it('the same input gives the same output', () => {
    const { rgba, w, h } = stillLife()
    expect(edgeOutline(rgba, w, h, 50)).toEqual(edgeOutline(rgba.slice(), w, h, 50))
  })

  it('edgeOutline of the synthetic still life at detail 50', () => {
    const { rgba, w, h } = stillLife()
    const out = edgeOutline(rgba, w, h, 50)
    const r = (v: number) => Math.round(v * 1e6) / 1e6
    expect({
      vertices: vertices(out),
      polylines: out.map((p) => p.map(({ x, y }) => [r(x), r(y)])),
    }).toMatchSnapshot()
  })

  it('the edge core uses no transcendental Math functions', () => {
    const banned =
      /Math\.(exp|expm1|log|log1p|log2|log10|pow|sqrt|cbrt|hypot|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|random)\b/
    for (const file of ['trace.ts', 'simplify.ts', 'outline.ts']) {
      const src = readFileSync(join(import.meta.dirname, file), 'utf8')
      expect(src.length).toBeGreaterThan(0)
      expect(src, file).not.toMatch(banned)
    }
  })
})
