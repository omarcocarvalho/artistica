import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isAnimatedGif, looksLikeHeicByLabel, readDeclaredSize, sniffImage } from './sniff'
import {
  ANIMATED_GIF,
  STILL_GIF,
  ascii,
  heicHeader,
  pngHeader,
  skeletonJpeg,
  webpHeader,
} from './test-bytes'

describe('sniffImage', () => {
  it('recognises each supported format by magic bytes', () => {
    expect(sniffImage(skeletonJpeg(4, 4))).toEqual({ kind: 'jpeg', mime: 'image/jpeg' })
    expect(sniffImage(pngHeader(4, 4))?.kind).toBe('png')
    expect(sniffImage(webpHeader())?.kind).toBe('webp')
    expect(sniffImage(STILL_GIF)?.kind).toBe('gif')
    expect(sniffImage(heicHeader('heic'))).toEqual({ kind: 'heic', mime: 'image/heic' })
    expect(sniffImage(heicHeader('mif1'))?.kind).toBe('heic')
  })

  it('rejects other containers, including AVIF and PDF', () => {
    expect(sniffImage(heicHeader('avif'))).toBeNull()
    expect(sniffImage(Uint8Array.from(ascii('%PDF-1.7\n')))).toBeNull()
    expect(sniffImage(new Uint8Array(0))).toBeNull()
    expect(sniffImage(Uint8Array.from([0xff, 0xd8]))).toBeNull()
  })

  it('never throws, whatever the bytes (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (b) => {
        sniffImage(b)
        isAnimatedGif(b)
        return true
      }),
    )
  })
})

describe('isAnimatedGif', () => {
  it('is false for one frame and true for two', () => {
    expect(isAnimatedGif(STILL_GIF)).toBe(false)
    expect(isAnimatedGif(ANIMATED_GIF)).toBe(true)
  })
  it('is false for a truncated or non-GIF buffer', () => {
    expect(isAnimatedGif(ANIMATED_GIF.subarray(0, 25))).toBe(false)
    expect(isAnimatedGif(skeletonJpeg(2, 2))).toBe(false)
  })
})

describe('readDeclaredSize', () => {
  it('reads JPEG SOF and PNG IHDR sizes without decoding', () => {
    expect(readDeclaredSize(skeletonJpeg(640, 480), 'jpeg')).toEqual({ w: 640, h: 480 })
    expect(readDeclaredSize(pngHeader(1000, 2000), 'png')).toEqual({ w: 1000, h: 2000 })
    expect(readDeclaredSize(webpHeader(), 'webp')).toBeNull()
  })
})

describe('looksLikeHeicByLabel', () => {
  it('uses MIME or extension, case-insensitively', () => {
    expect(looksLikeHeicByLabel('image/heic', 'a')).toBe(true)
    expect(looksLikeHeicByLabel('', 'IMG_0001.HEIC')).toBe(true)
    expect(looksLikeHeicByLabel('image/heif-sequence', 'a')).toBe(true)
    expect(looksLikeHeicByLabel('image/jpeg', 'a.jpg')).toBe(false)
  })
})
