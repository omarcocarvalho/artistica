import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  injectExifOrientation,
  orientationTransform,
  readJpegInfo,
  type ExifOrientation,
} from './exif'
import { ascii, skeletonJpeg } from './test-bytes'

const ORIENTATIONS: ExifOrientation[] = [1, 2, 3, 4, 5, 6, 7, 8]

describe('readJpegInfo', () => {
  it('returns null for non-JPEG', () => {
    expect(readJpegInfo(Uint8Array.from([1, 2, 3, 4, 5]))).toBeNull()
  })
  it('defaults to orientation 1 and reads the declared size', () => {
    expect(readJpegInfo(skeletonJpeg(64, 48))).toEqual({ orientation: 1, width: 64, height: 48 })
  })
  it('reads an injected orientation back (property over all 8)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ORIENTATIONS), fc.integer({ min: 1, max: 60000 }), (o, w) => {
        expect(readJpegInfo(skeletonJpeg(w, 7, o))).toEqual({ orientation: o, width: w, height: 7 })
      }),
    )
  })
  it('reads little-endian EXIF written by cameras', () => {
    const base = skeletonJpeg(10, 10)
    const tiff = [
      0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
    const len = body.length + 2
    const seg = [0xff, 0xe1, len >> 8, len & 255, ...body]
    const jpeg = Uint8Array.from([0xff, 0xd8, ...seg, ...base.subarray(2)])
    expect(readJpegInfo(jpeg)?.orientation).toBe(6)
  })
  it('ignores an out-of-range orientation and truncated EXIF', () => {
    const bad = injectExifOrientation(skeletonJpeg(5, 5), 6)
    const patched = Uint8Array.from(bad)
    // orientation value lives at SOI(2) + APP1 header(4) + "Exif\0\0"(6) + 18 bytes into the TIFF block
    patched[2 + 4 + 6 + 18 + 1] = 9
    expect(readJpegInfo(patched)?.orientation).toBe(1)
    expect(readJpegInfo(bad.subarray(0, 20))?.orientation).toBe(1)
  })
})

describe('injectExifOrientation', () => {
  it('replaces existing EXIF instead of adding a second segment', () => {
    const twice = injectExifOrientation(injectExifOrientation(skeletonJpeg(8, 8), 3), 8)
    expect(readJpegInfo(twice)?.orientation).toBe(8)
    let app1 = 0
    for (let i = 0; i < twice.length - 1; i++)
      if (twice[i] === 0xff && twice[i + 1] === 0xe1) app1++
    expect(app1).toBe(1)
  })
  it('throws on non-JPEG input', () => {
    expect(() => injectExifOrientation(Uint8Array.from([0, 1, 2, 3]), 1)).toThrow()
  })
})

describe('orientationTransform', () => {
  it('matches the EXIF table for 6 (rotate 90 clockwise)', () => {
    expect(orientationTransform(6, 64, 48)).toEqual({
      matrix: [0, 1, -1, 0, 48, 0],
      width: 48,
      height: 64,
    })
  })
  it('swaps axes only for 5-8', () => {
    for (const o of ORIENTATIONS) {
      const t = orientationTransform(o, 30, 20)
      expect([t.width, t.height]).toEqual(o >= 5 ? [20, 30] : [30, 20])
    }
  })
  it('maps the four corners inside the output and onto four distinct corners (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ORIENTATIONS),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        (o, w, h) => {
          const {
            matrix: [a, b, c, d, e, f],
            width,
            height,
          } = orientationTransform(o, w, h)
          const seen = new Set<string>()
          for (const [x, y] of [
            [0, 0],
            [w, 0],
            [0, h],
            [w, h],
          ] as const) {
            const X = a * x + c * y + e
            const Y = b * x + d * y + f
            expect(X).toBeGreaterThanOrEqual(-1e-9)
            expect(Y).toBeGreaterThanOrEqual(-1e-9)
            expect(X).toBeLessThanOrEqual(width + 1e-9)
            expect(Y).toBeLessThanOrEqual(height + 1e-9)
            seen.add(`${String(X)},${String(Y)}`)
          }
          expect(seen.size).toBe(4)
        },
      ),
    )
  })
})

describe('readJpegInfo on hostile input', () => {
  const exifSeg = (tiff: number[], declaredLen?: number): Uint8Array => {
    const body = [...ascii('Exif'), 0, 0, ...tiff]
    const len = declaredLen ?? body.length + 2
    return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...body, 0xff, 0xd9])
  }
  const MM = [0x4d, 0x4d, 0, 0x2a]
  const orientationOf = (b: Uint8Array): number | undefined => readJpegInfo(b)?.orientation

  it('never throws on arbitrary bytes (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (b) => {
        readJpegInfo(b)
        return true
      }),
    )
  })
  it('never throws on random bytes behind an APP1 Exif prefix (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 256 }),
        fc.integer({ min: 0, max: 65535 }),
        (rest, len) => {
          const b = Uint8Array.from([
            0xff,
            0xd8,
            0xff,
            0xe1,
            len >> 8,
            len & 255,
            ...ascii('Exif'),
            0,
            0,
            ...rest,
          ])
          const info = readJpegInfo(b)
          return info === null || (info.orientation >= 1 && info.orientation <= 8)
        },
      ),
    )
  })
  it('falls back to orientation 1 for malformed EXIF', () => {
    // IFD offset far past the buffer
    expect(orientationOf(exifSeg([...MM, 0x7f, 0xff, 0xff, 0xff]))).toBe(1)
    // entry count overruns the segment
    expect(orientationOf(exifSeg([...MM, 0, 0, 0, 8, 0xff, 0xff]))).toBe(1)
    // zero-length APP1 (len = 2)
    expect(orientationOf(exifSeg([], 2))).toBe(1)
    // no Exif header
    const noHeader = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0,
      10,
      ...ascii('Nope'),
      0,
      0,
      0xff,
      0xd9,
    ])
    expect(orientationOf(noHeader)).toBe(1)
    // invalid byte-order mark
    expect(orientationOf(exifSeg([0x58, 0x58, 0, 0x2a, 0, 0, 0, 8, 0, 0]))).toBe(1)
    // wrong TIFF magic
    expect(orientationOf(exifSeg([0x4d, 0x4d, 0, 0x2b, 0, 0, 0, 8, 0, 0]))).toBe(1)
  })
})

describe('orientationTransform pins the EXIF table exactly', () => {
  const w = 30
  const h = 20
  // Where source (0,0) and source (w,0) land, per the EXIF orientation table.
  const expected: Record<ExifOrientation, { origin: [number, number]; xEnd: [number, number] }> = {
    1: { origin: [0, 0], xEnd: [w, 0] },
    2: { origin: [w, 0], xEnd: [0, 0] },
    3: { origin: [w, h], xEnd: [0, h] },
    4: { origin: [0, h], xEnd: [w, h] },
    5: { origin: [0, 0], xEnd: [0, w] },
    6: { origin: [h, 0], xEnd: [h, w] },
    7: { origin: [h, w], xEnd: [h, 0] },
    8: { origin: [0, w], xEnd: [0, 0] },
  }
  const apply = (m: readonly number[], x: number, y: number): [number, number] => [
    (m[0] ?? 0) * x + (m[2] ?? 0) * y + (m[4] ?? 0),
    (m[1] ?? 0) * x + (m[3] ?? 0) * y + (m[5] ?? 0),
  ]
  for (const o of ORIENTATIONS) {
    it(`orientation ${String(o)} lands the source corners where EXIF says`, () => {
      const { matrix } = orientationTransform(o, w, h)
      expect(apply(matrix, 0, 0)).toEqual(expected[o].origin)
      expect(apply(matrix, w, 0)).toEqual(expected[o].xEnd)
    })
  }
})
