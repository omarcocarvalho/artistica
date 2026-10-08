import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MIN_STRONG_MAG2,
  binomialBlur,
  cannyEdges,
  edgeThresholds,
  gradientStep,
  toGrey,
} from './canny'
import { edgeParams } from './detail'
import {
  countOnes,
  disc,
  gradient,
  insideDisc,
  noise,
  rgba,
  square,
  transposeMap,
  transposeRgba,
} from './test-support/synthetic'

const DETAILS = [1, 20, 34, 50, 67, 99, 100]

const edgesOf = (img: Uint8ClampedArray, w: number, h: number, detail: number): Uint8Array =>
  cannyEdges(toGrey(img, w, h), edgeParams(detail))

const pixels = (e: Uint8Array, w: number): [number, number][] => {
  const out: [number, number][] = []
  e.forEach((v, i) => {
    if (v) out.push([i % w, Math.floor(i / w)])
  })
  return out
}

const at = (e: Uint8Array, w: number, h: number, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < w && y < h && e[y * w + x] === 1

const neighbours8 = (e: Uint8Array, w: number, h: number, x: number, y: number): number => {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(e, w, h, x + dx, y + dy)) n++
  }
  return n
}

/** Number of 8-connected components of the edge pixels. */
function components(e: Uint8Array, w: number, h: number): number {
  const seen = new Uint8Array(e.length)
  let count = 0
  for (let i = 0; i < e.length; i++) {
    if (!e[i] || seen[i]) continue
    count++
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const j = stack.pop() ?? 0
      const x = j % w
      const y = Math.floor(j / w)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = (y + dy) * w + x + dx
          if (at(e, w, h, x + dx, y + dy) && !seen[k]) {
            seen[k] = 1
            stack.push(k)
          }
        }
      }
    }
  }
  return count
}

const has2x2Block = (e: Uint8Array, w: number, h: number): boolean =>
  pixels(e, w).some(
    ([x, y]) => at(e, w, h, x + 1, y) && at(e, w, h, x, y + 1) && at(e, w, h, x + 1, y + 1),
  )

describe('toGrey (M4-R15)', () => {
  it('toGrey uses (77R + 150G + 29B) >> 8 and ignores alpha', () => {
    const px: [number, number, number, number][] = [
      [255, 0, 0, 255],
      [0, 255, 0, 0],
      [0, 0, 255, 17],
      [255, 255, 255, 255],
      [10, 200, 90, 128],
      [0, 0, 0, 0],
    ]
    const g = toGrey(new Uint8ClampedArray(px.flat()), 3, 2)
    expect(g.w).toBe(3)
    expect(g.h).toBe(2)
    expect(Array.from(g.data)).toEqual(px.map(([r, gr, b]) => (77 * r + 150 * gr + 29 * b) >> 8))
    expect(Array.from(g.data)).toEqual([76, 149, 28, 255, 130, 0])
    const opaque = toGrey(new Uint8ClampedArray(px.flatMap(([r, gr, b]) => [r, gr, b, 255])), 3, 2)
    expect(opaque.data).toEqual(g.data)
  })
})

describe('binomialBlur (M4-R15)', () => {
  const K = [1, 4, 6, 4, 1]

  it('spreads a dot by the 1-4-6-4-1 outer product, divided by 256 and truncated', () => {
    const src = new Uint8Array(81)
    src[4 * 9 + 4] = 255
    const out = binomialBlur(src, 9, 9)
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const k = (K[x - 2] ?? 0) * (K[y - 2] ?? 0)
        expect(out[y * 9 + x], `(${String(x)}, ${String(y)})`).toBe((k * 255) >> 8)
      }
    }
    expect(out[4 * 9 + 4]).toBe(35)
  })

  it('clamps at the edges and keeps a flat image flat', () => {
    const src = new Uint8Array(25)
    src[0] = 255
    expect(binomialBlur(src, 5, 5)[0]).toBe((11 * 11 * 255) >> 8)
    for (const v of [0, 1, 128, 255]) {
      expect(Array.from(binomialBlur(new Uint8Array(12).fill(v), 4, 3))).toEqual(Array(12).fill(v))
    }
  })
})

describe('gradientStep (M4-R15)', () => {
  const step = (gx: number, gy: number) => {
    const code = gradientStep(gx, gy)
    return [(code % 3) - 1, Math.floor(code / 3) - 1]
  }

  it('splits the sectors at |gy| · 99 = |gx| · 41 and its mirror', () => {
    expect(step(99, 41)).toEqual([1, 0])
    expect(step(99, 42)).toEqual([1, 1])
    expect(step(-99, 41)).toEqual([-1, 0])
    expect(step(-99, -42)).toEqual([-1, -1])
    expect(step(41, 99)).toEqual([0, 1])
    expect(step(42, 99)).toEqual([1, 1])
    expect(step(41, -99)).toEqual([0, -1])
    expect(step(-42, 99)).toEqual([-1, 1])
    expect(step(5, 0)).toEqual([1, 0])
    expect(step(0, -5)).toEqual([0, -1])
    expect(step(7, -7)).toEqual([1, -1])
  })

  it('is symmetric under transpose', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1020, max: 1020 }),
        fc.integer({ min: -1020, max: 1020 }),
        (gx, gy) => {
          fc.pre(gx !== 0 || gy !== 0)
          const [dx, dy] = step(gx, gy)
          expect(step(gy, gx)).toEqual([dy, dx])
        },
      ),
    )
  })
})

describe('cannyEdges (M4-R15)', () => {
  it('a white square on black gives a closed 1-px ring on its border at every detail', () => {
    const [w, h, x0, y0, x1, y1] = [64, 56, 18, 14, 47, 39]
    const img = square(w, h, x0, y0, x1, y1)
    const band = (x: number, y: number) =>
      x >= x0 - 1 &&
      x <= x1 &&
      y >= y0 - 1 &&
      y <= y1 &&
      (x <= x0 || x >= x1 - 1 || y <= y0 || y >= y1 - 1)
    for (const d of DETAILS) {
      const e = edgesOf(img, w, h, d)
      const on = pixels(e, w)
      for (const [x, y] of on)
        expect(band(x, y), `detail ${String(d)}: (${String(x)}, ${String(y)})`).toBe(true)
      for (let x = x0 + 4; x < x1 - 4; x++) {
        expect(
          at(e, w, h, x, y0 - 1) || at(e, w, h, x, y0),
          `detail ${String(d)}: top ${String(x)}`,
        ).toBe(true)
        expect(
          at(e, w, h, x, y1 - 1) || at(e, w, h, x, y1),
          `detail ${String(d)}: bottom ${String(x)}`,
        ).toBe(true)
      }
      for (let y = y0 + 4; y < y1 - 4; y++) {
        expect(
          at(e, w, h, x0 - 1, y) || at(e, w, h, x0, y),
          `detail ${String(d)}: left ${String(y)}`,
        ).toBe(true)
        expect(
          at(e, w, h, x1 - 1, y) || at(e, w, h, x1, y),
          `detail ${String(d)}: right ${String(y)}`,
        ).toBe(true)
      }
      for (const [x, y] of on) expect(neighbours8(e, w, h, x, y)).toBeGreaterThanOrEqual(2)
      expect(components(e, w, h)).toBe(1)
      expect(has2x2Block(e, w, h)).toBe(false)
    }
  })

  it('a linear gradient gives no edges at any detail', () => {
    const [w, h] = [128, 96]
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359 }), fc.constantFrom(...DETAILS), (angle, d) => {
        expect(countOnes(edgesOf(gradient(w, h, angle), w, h, d))).toBe(0)
      }),
      { numRuns: 60 },
    )
    for (const angle of [0, 45, 90, 135, 180, 30, 300]) {
      for (const d of [1, 50, 100])
        expect(countOnes(edgesOf(gradient(w, h, angle), w, h, d))).toBe(0)
    }
  })

  it('a disc gives a ring within 1 px of its radius', () => {
    const [w, h, cx, cy, r] = [96, 88, 47.3, 44.6, 27]
    const img = disc(w, h, cx, cy, r)
    for (const d of DETAILS) {
      const e = edgesOf(img, w, h, d)
      const on = pixels(e, w)
      expect(on.length).toBeGreaterThan(4 * r)
      for (const [x, y] of on) {
        expect(
          Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r),
          `detail ${String(d)}: (${String(x)}, ${String(y)})`,
        ).toBeLessThanOrEqual(1)
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const boundary =
            insideDisc(x, y, cx, cy, r) &&
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].some(([dx = 0, dy = 0]) => !insideDisc(x + dx, y + dy, cx, cy, r))
          if (!boundary) continue
          const near = on.some(([ex, ey]) => Math.max(Math.abs(ex - x), Math.abs(ey - y)) <= 1)
          expect(near, `detail ${String(d)}: boundary (${String(x)}, ${String(y)})`).toBe(true)
        }
      }
      expect(components(e, w, h)).toBe(1)
    }
  })

  it('edges are one pixel wide after non-maximum suppression', () => {
    const [w, h] = [96, 88]
    for (const [cx, cy, r] of [
      [47.3, 44.6, 27],
      [40, 40, 12.5],
      [50.5, 43.5, 33.2],
    ] as const) {
      const img = disc(w, h, cx, cy, r)
      for (const d of DETAILS)
        expect(
          has2x2Block(edgesOf(img, w, h, d), w, h),
          `r ${String(r)}, detail ${String(d)}`,
        ).toBe(false)
    }
  })

  it('higher detail never gives fewer edge pixels', () => {
    const [w, h] = [48, 40]
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const grey = toGrey(noise(w, h, seed), w, h)
        let prev = cannyEdges(grey, edgeParams(1))
        for (let d = 2; d <= 100; d++) {
          const next = cannyEdges(grey, edgeParams(d))
          expect(
            countOnes(next),
            `seed ${String(seed)}, detail ${String(d)}`,
          ).toBeGreaterThanOrEqual(countOnes(prev))
          expect(
            prev.every((v, i) => !v || next[i] === 1),
            `seed ${String(seed)}, detail ${String(d)}: an edge pixel was lost`,
          ).toBe(true)
          prev = next
        }
      }),
      { numRuns: 60 },
    )
  })

  it('blurs blurPasses times before Sobel: specks smaller than the blur leave no edge', () => {
    const [w, h] = [40, 30]
    const img = rgba(w, h, (x, y) => (x % 10 === 5 && y % 10 === 5 ? [60, 60, 60] : [0, 0, 0]))
    const count = (blurPasses: number) =>
      countOnes(cannyEdges(toGrey(img, w, h), { blurPasses, keepShare: 0.2, minChainPx: 6 }))
    expect(count(0)).toBeGreaterThan(0)
    for (const passes of [1, 2, 3]) expect(count(passes)).toBe(0)
  })

  it('seeds edges from the strongest keepShare of the surviving pixels', () => {
    const [w, h] = [96, 32]
    const contrasts = [20, 60, 180]
    const img = rgba(w, h, (x, y) => {
      const i = Math.floor(x / 32)
      const inside = x % 32 >= 8 && x % 32 < 24 && y >= 8 && y < 24
      const v = inside ? (contrasts[i] ?? 0) : 0
      return [v, v, v]
    })
    const found = (keepShare: number) => {
      const e = cannyEdges(toGrey(img, w, h), { blurPasses: 0, keepShare, minChainPx: 6 })
      return contrasts.map(
        (_, i) => pixels(e, w).filter(([x]) => Math.floor(x / 32) === i).length > 0,
      )
    }
    expect(found(0.03)).toEqual([false, false, true])
    expect(found(0.2)).toEqual([false, false, true])
    expect(found(0.5)).toEqual([false, true, true])
    expect(found(1)).toEqual([true, true, true])
  })

  it('grows from strong pixels into touching survivors of at least 4/25 of the high magnitude²', () => {
    const [w, h] = [64, 32]
    const tail = (v: number) => {
      const img = rgba(w, h, (x, y) => {
        const c = y < 16 ? 0 : x < 32 ? 100 : v
        return [c, c, c]
      })
      const e = cannyEdges(toGrey(img, w, h), { blurPasses: 0, keepShare: 0.2, minChainPx: 6 })
      return pixels(e, w).filter(([x, y]) => x >= 40 && x < w - 2 && (y === 15 || y === 16)).length
    }
    expect(tail(45)).toBe(w - 2 - 40)
    expect(tail(40)).toBe(w - 2 - 40)
    expect(tail(39)).toBe(0)
    expect(tail(38)).toBe(0)
  })

  it('takes high from the strongest max(1, ⌊n · keepShare⌋) survivors, floored, and low = ⌊high · 4/25⌋', () => {
    const mags = [9000, 2000, 7000, 0, 5000, 3000, 99999, 4000, 6000, 8000, 1500]
    const keep = Uint8Array.from(mags, (m, i) => (i === 6 || m === 0 ? 0 : 1))
    const at = (keepShare: number) => edgeThresholds(Int32Array.from(mags), keep, keepShare)
    expect(at(0.2)).toEqual({ high: 9000, low: 1440, survivors: 9 })
    expect(at(0.25)).toEqual({ high: 8000, low: 1280, survivors: 9 })
    expect(at(0.5)).toEqual({ high: 6000, low: 960, survivors: 9 })
    expect(at(0.03).high).toBe(9000)
    expect(at(1).high).toBe(1500)
    const many = new Int32Array(1000).map((_, i) => 2000 + i)
    const all = new Uint8Array(1000).fill(1)
    expect(edgeThresholds(many, all, 0.0295).high).toBe(2000 + 1000 - 30)
    expect(edgeThresholds(Int32Array.from([10, 20]), Uint8Array.from([1, 1]), 1)).toEqual({
      high: MIN_STRONG_MAG2,
      low: Math.floor((MIN_STRONG_MAG2 * 4) / 25),
      survivors: 2,
    })
  })

  it('a step needs a Sobel magnitude of 32 to seed an edge: contrast 8 does, 7 does not', () => {
    const [w, h] = [24, 16]
    const step = (c: number) =>
      countOnes(
        cannyEdges(
          toGrey(
            rgba(w, h, (x) => (x < 12 ? [0, 0, 0] : [c, c, c])),
            w,
            h,
          ),
          {
            blurPasses: 0,
            keepShare: 1,
            minChainPx: 6,
          },
        ),
      )
    expect(step(8)).toBe(h)
    expect(step(7)).toBe(0)
  })

  it('keeps an edge on the outermost column: outside the image counts as magnitude 0', () => {
    const [w, h] = [12, 10]
    const e = cannyEdges(
      toGrey(
        rgba(w, h, (x) => (x === 0 ? [0, 0, 0] : [200, 200, 200])),
        w,
        h,
      ),
      {
        blurPasses: 0,
        keepShare: 1,
        minChainPx: 6,
      },
    )
    expect(pixels(e, w).every(([x]) => x === 0)).toBe(true)
    expect(countOnes(e)).toBe(h)
  })

  it('the same input gives the same output', () => {
    const [w, h] = [80, 60]
    const img = noise(w, h, 7)
    for (const d of [1, 50, 100])
      expect(edgesOf(img, w, h, d)).toEqual(edgesOf(img.slice(), w, h, d))
  })

  it('transposing the input transposes the output', () => {
    const cases: [Uint8ClampedArray, number, number][] = [
      [noise(52, 37, 11), 52, 37],
      [noise(41, 63, 12), 41, 63],
      [square(64, 56, 18, 14, 47, 39), 64, 56],
      [disc(96, 88, 47.3, 44.6, 27), 96, 88],
      [
        rgba(70, 50, (x, y) =>
          x * x + 3 * y * y < 2500 || (x > 40 && y < 20) ? [230, 40, 90] : [20, 60, 200],
        ),
        70,
        50,
      ],
    ]
    for (const [img, w, h] of cases) {
      const grey = toGrey(img, w, h)
      const greyT = toGrey(transposeRgba(img, w, h), h, w)
      for (const d of DETAILS) {
        for (const blurPasses of [0, 1, 2, 3]) {
          const params = { ...edgeParams(d), blurPasses }
          const e = cannyEdges(grey, params)
          expect(countOnes(e)).toBeGreaterThan(0)
          expect(
            cannyEdges(greyT, params),
            `detail ${String(d)}, blur ${String(blurPasses)}`,
          ).toEqual(transposeMap(e, w, h))
        }
      }
    }
  })

  it('does not change its input', () => {
    const [w, h] = [40, 30]
    const grey = toGrey(noise(w, h, 3), w, h)
    const before = grey.data.slice()
    cannyEdges(grey, edgeParams(1))
    expect(grey.data).toEqual(before)
  })

  it('a flat image gives no edges', () => {
    for (const v of [0, 128, 255]) {
      expect(
        countOnes(
          edgesOf(
            rgba(20, 16, () => [v, v, v]),
            20,
            16,
            100,
          ),
        ),
      ).toBe(0)
    }
    expect(countOnes(cannyEdges({ w: 0, h: 0, data: new Uint8Array(0) }, edgeParams(50)))).toBe(0)
  })

  it('the edge core uses no transcendental Math functions', () => {
    const banned =
      /Math\.(exp|expm1|log|log1p|log2|log10|pow|sqrt|cbrt|hypot|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|random)\b/
    for (const file of ['canny.ts', 'detail.ts']) {
      const src = readFileSync(join(import.meta.dirname, file), 'utf8')
      expect(src.length).toBeGreaterThan(0)
      expect(src, file).not.toMatch(banned)
    }
  })
})
