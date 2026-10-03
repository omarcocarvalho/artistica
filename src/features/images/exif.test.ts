import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  injectExifOrientation,
  orientationTransform,
  readJpegInfo,
  type ExifOrientation,
} from './exif'
import { skeletonJpeg } from './test-bytes'

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
