import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readJpegInfo } from './exif'
import { isAnimatedGif, sniffImage } from './sniff'
import { flatGreyPng } from './__fixtures__/flat-grey'
import { valueRampPng } from './__fixtures__/value-ramp'

const read = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '__fixtures__', name)))

describe('image fixtures', () => {
  it('JPEG fixtures declare the expected size and EXIF orientation', () => {
    expect(readJpegInfo(read('quadrants.jpg'))).toEqual({ orientation: 1, width: 64, height: 48 })
    expect(readJpegInfo(read('quadrants-exif6.jpg'))).toEqual({
      orientation: 6,
      width: 64,
      height: 48,
    })
    expect(readJpegInfo(read('quadrants-exif3.jpg'))?.orientation).toBe(3)
  })
  it('every file sniffs as what E2E expects', () => {
    const kinds: Record<string, string | null> = {
      'quadrants.jpg': 'jpeg',
      'quadrants.png': 'png',
      'quadrants.webp': 'webp',
      'transparent.png': 'png',
      'still.gif': 'gif',
      'animated.gif': 'gif',
      'photo.heic': 'heic',
      'mislabelled-heic.jpg': 'heic',
      'value-ramp.png': 'png',
      'flat-grey.png': 'png',
      'notes.pdf': null,
    }
    for (const [name, kind] of Object.entries(kinds))
      expect(sniffImage(read(name))?.kind ?? null, name).toBe(kind)
  })
  it('only animated.gif is animated', () => {
    expect(isAnimatedGif(read('animated.gif'))).toBe(true)
    expect(isAnimatedGif(read('still.gif'))).toBe(false)
  })
  it('value-ramp.png is exactly what its generator writes', () => {
    expect(Buffer.from(read('value-ramp.png')).equals(valueRampPng())).toBe(true)
  })
  it('flat-grey.png is exactly what its generator writes', () => {
    expect(Buffer.from(read('flat-grey.png')).equals(flatGreyPng())).toBe(true)
  })
})
