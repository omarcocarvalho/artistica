import { injectExifOrientation, type ExifOrientation } from './exif'

export const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0))

const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]

/** SOI + SOF0 (declares the size) + EOI. Not decodable, enough for header parsing. */
export function skeletonJpeg(w: number, h: number, orientation?: ExifOrientation): Uint8Array {
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    0x03,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]
  const base = Uint8Array.from([0xff, 0xd8, ...sof, 0xff, 0xd9])
  return orientation === undefined ? base : injectExifOrientation(base, orientation)
}

export const pngHeader = (w: number, h: number): Uint8Array =>
  Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    ...ascii('IHDR'),
    ...be32(w),
    ...be32(h),
    8,
    6,
    0,
    0,
    0,
  ])

export const webpHeader = (): Uint8Array =>
  Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8 ')])

export const heicHeader = (brand: string): Uint8Array =>
  Uint8Array.from([
    0,
    0,
    0,
    24,
    ...ascii('ftyp'),
    ...ascii(brand),
    0,
    0,
    0,
    0,
    ...ascii('mif1'),
    ...ascii(brand),
  ])

const gifHead = [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 255, 0, 0, 0, 0, 255]
const gifFrame = (idx: 0 | 1): number[] => [
  0x2c,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  0,
  0x00,
  0x02,
  0x02,
  idx === 0 ? 0x44 : 0x4c,
  0x01,
  0x00,
]
export const STILL_GIF = Uint8Array.from([...gifHead, ...gifFrame(0), 0x3b])
export const ANIMATED_GIF = Uint8Array.from([...gifHead, ...gifFrame(0), ...gifFrame(1), 0x3b])
