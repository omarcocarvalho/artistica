import { describe, expect, it, vi } from 'vitest'
import type { PixelCtx } from '../render/pixels/bleed'
import { DEFAULT_STUDY, tileStudyFor, type TileStudy } from '../../shared/model/study'
import { applyStudy, applyStudyToContext } from './apply-study'
import { blurSigmaPx, gaussianBlurRGBA } from './blur'
import { lightnessRange, posterizeRGBA } from './posterize'
import { valueRamp } from './ramp'
import { distinctColours, lightnessRampImage } from './test-support/lightness'
import { noise, rgba } from './test-support/pixels'

const VALUES = { count: 5, hue: 55, neutral: false }
const study = (blurPct: number | null, values: typeof VALUES | null): TileStudy => ({
  blurPct,
  values,
})

/** Hard vertical stripes: lots of edges for a blur to soften. */
const stripes = (w: number, h: number) =>
  rgba(w, h, (x) => (Math.floor(x / Math.max(1, w / 8)) % 2 === 0 ? [30, 30, 30] : [220, 210, 190]))

describe('applyStudy', () => {
  it('blurred only blurs', () => {
    const a = stripes(80, 40)
    const b = a.slice()
    applyStudy(a, 80, 40, study(40, null))
    gaussianBlurRGBA(b, 80, 40, blurSigmaPx(40, 80, 40))
    expect(a).toEqual(b)
    expect(a).not.toEqual(stripes(80, 40))
  })

  it('values only posterises', () => {
    const a = lightnessRampImage(300, 4)
    applyStudy(a, 300, 4, study(null, VALUES))
    expect(distinctColours(a).size).toBe(5)
  })

  it('blurs first, then posterises (spec §2.6)', () => {
    const w = 120
    const h = 40
    const a = stripes(w, h)
    applyStudy(a, w, h, study(60, VALUES))

    const expected = stripes(w, h)
    gaussianBlurRGBA(expected, w, h, blurSigmaPx(60, w, h))
    posterizeRGBA(expected, w, h, valueRamp(VALUES), lightnessRange(expected, w, h))
    expect(a).toEqual(expected)

    const wrong = stripes(w, h)
    posterizeRGBA(wrong, w, h, valueRamp(VALUES), lightnessRange(wrong, w, h))
    gaussianBlurRGBA(wrong, w, h, blurSigmaPx(60, w, h))
    expect(distinctColours(wrong).size).toBeGreaterThan(5)
    expect(distinctColours(a).size).toBeLessThanOrEqual(5)
  })

  it('gives the same number of values at two resolutions (preview vs print)', () => {
    for (const s of [study(null, VALUES), study(40, VALUES)]) {
      const small = lightnessRampImage(150, 100)
      const large = lightnessRampImage(1500, 1000)
      applyStudy(small, 150, 100, s)
      applyStudy(large, 1500, 1000, s)
      expect(distinctColours(small).size).toBe(distinctColours(large).size)
    }
  })

  it('blurs in proportion to the tile size (preview vs print)', () => {
    const flatShare = (w: number, h: number) => {
      const d = stripes(w, h)
      applyStudy(d, w, h, study(30, null))
      let flat = 0
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] ?? 0
        if (Math.abs(r - 30) <= 8 || Math.abs(r - 220) <= 8) flat++
      }
      return flat / (w * h)
    }
    expect(Math.abs(flatShare(160, 80) - flatShare(1600, 800))).toBeLessThan(0.03)
  })

  it('allocates nothing proportional to the pixels (M2-R10)', () => {
    const w = 1000
    const h = 1000
    for (const s of [study(1, VALUES), study(7.5, VALUES), study(40, VALUES), study(100, VALUES)]) {
      const d = noise(w, h, 11)
      const before = d
      const sizes = trackAllocations(() => {
        applyStudy(d, w, h, s)
      })
      expect(d).toBe(before)
      expect(sizes.length).toBeGreaterThan(0)
      expect(sizes.filter((bytes) => bytes >= 64 * 1024)).toEqual([])
    }
  })
})

describe('applyStudyToContext', () => {
  it('processes only the image area inside the bleed', () => {
    const bleed = 3
    const outW = 40
    const outH = 20
    const ctx = fakeCtx(outW + 2 * bleed, outH + 2 * bleed)
    ctx.fill((x, y) => {
      const ring = x < bleed || y < bleed || x >= outW + bleed || y >= outH + bleed
      return ring ? [1, 2, 3] : [x * 6, x * 6, x * 6]
    })
    applyStudyToContext(ctx, { bleedPx: bleed, outW, outH }, study(null, VALUES))
    expect(ctx.reads).toEqual([[bleed, bleed, outW, outH]])
    expect(ctx.writes).toEqual([[bleed, bleed]])
    expect(ctx.pixel(0, 0)).toEqual([1, 2, 3])
    expect(ctx.pixel(outW + 2 * bleed - 1, outH + 2 * bleed - 1)).toEqual([1, 2, 3])
    const inner = new Set<string>()
    for (let y = bleed; y < bleed + outH; y++)
      for (let x = bleed; x < bleed + outW; x++) inner.add(ctx.pixel(x, y).join(','))
    const ramp = valueRamp(VALUES).map((c) => [c.r, c.g, c.b].join(','))
    expect([...inner].every((c) => ramp.includes(c))).toBe(true)
    expect(inner.size).toBe(5)
  })

  it('blurs with σ from the printed area, not the canvas with its bleed (owner Q12)', () => {
    const bleed = 10
    const outW = 60
    const outH = 30
    const ctx = fakeCtx(outW + 2 * bleed, outH + 2 * bleed)
    const tile = stripes(outW, outH)
    const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, v))
    ctx.fill((x, y) => {
      const i = (clamp(y - bleed, outH) * outW + clamp(x - bleed, outW)) * 4
      return [tile[i] ?? 0, tile[i + 1] ?? 0, tile[i + 2] ?? 0]
    })
    applyStudyToContext(ctx, { bleedPx: bleed, outW, outH }, study(100, null))
    gaussianBlurRGBA(tile, outW, outH, blurSigmaPx(100, outW, outH))
    for (let y = 0; y < outH; y++)
      for (let x = 0; x < outW; x++) {
        const i = (y * outW + x) * 4
        expect(ctx.pixel(x + bleed, y + bleed)).toEqual([tile[i], tile[i + 1], tile[i + 2]])
      }
  })

  it('has a study to apply for every non-original version', () => {
    for (const v of ['blurred', 'values', 'blurValues'] as const) {
      const s = tileStudyFor(v, { ...DEFAULT_STUDY, versions: [v] })
      expect(s).not.toBeNull()
    }
  })
})

const TYPED = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
] as const

const bytesOf = (v: unknown): number =>
  ArrayBuffer.isView(v) ? v.byteLength : Array.isArray(v) ? v.length * 8 : 0

/**
 * Byte sizes of every typed array constructed, and of every array or typed array returned by
 * `slice`, `map`, `filter` or `Array.from`, while `fn` runs.
 */
function trackAllocations(fn: () => void): number[] {
  const sizes: number[] = []
  const typedProto = Object.getPrototypeOf(Uint8Array.prototype) as Uint8Array
  const copies = [
    vi.spyOn(typedProto, 'slice'),
    vi.spyOn(typedProto, 'map'),
    vi.spyOn(typedProto, 'filter'),
    vi.spyOn(Array, 'from'),
  ]
  try {
    for (const T of TYPED) {
      Object.defineProperty(globalThis, T.name, {
        configurable: true,
        value: new Proxy(T, {
          construct(target, args: unknown[]): object {
            const view = Reflect.construct(target, args) as object
            sizes.push(bytesOf(view))
            return view
          },
        }),
      })
    }
    fn()
  } finally {
    for (const spy of copies)
      for (const r of spy.mock.results) sizes.push(r.type === 'return' ? bytesOf(r.value) : 0)
    for (const spy of copies) spy.mockRestore()
    for (const T of TYPED)
      Object.defineProperty(globalThis, T.name, { configurable: true, value: T })
  }
  return sizes
}

type Rgb = [number, number, number]
interface FakeCtx extends PixelCtx {
  readonly reads: number[][]
  readonly writes: number[][]
  fill(f: (x: number, y: number) => Rgb): void
  pixel(x: number, y: number): Rgb
}

/** A tiny RGBA canvas with the three PixelCtx methods (node has no ImageData). */
function fakeCtx(w: number, h: number): FakeCtx {
  const buf = new Uint8ClampedArray(w * h * 4)
  const reads: number[][] = []
  const writes: number[][] = []
  const image = (iw: number, ih: number, data = new Uint8ClampedArray(iw * ih * 4)) =>
    ({ width: iw, height: ih, data, colorSpace: 'srgb' }) as unknown as ImageData
  return {
    reads,
    writes,
    fill(f) {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) buf.set([...f(x, y), 255], (y * w + x) * 4)
    },
    pixel(x, y) {
      const i = (y * w + x) * 4
      return [buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0]
    },
    getImageData(sx, sy, sw, sh) {
      reads.push([sx, sy, sw, sh])
      const out = new Uint8ClampedArray(sw * sh * 4)
      for (let y = 0; y < sh; y++)
        out.set(buf.subarray(((sy + y) * w + sx) * 4, ((sy + y) * w + sx + sw) * 4), y * sw * 4)
      return image(sw, sh, out)
    },
    createImageData(sw, sh) {
      return image(sw, sh)
    },
    putImageData(img, dx, dy) {
      writes.push([dx, dy])
      for (let y = 0; y < img.height; y++)
        buf.set(
          img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4),
          ((dy + y) * w + dx) * 4,
        )
    },
  }
}
