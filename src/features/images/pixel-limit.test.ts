import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_DECODED_PIXELS, MAX_DECODED_PIXELS_TOUCH } from './limits'
import { COARSE_POINTER_QUERY, decodedPixelLimit } from './pixel-limit'

function stubPointer(coarse: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches: query === COARSE_POINTER_QUERY && coarse,
  }))
  vi.stubGlobal('matchMedia', matchMedia)
  return matchMedia
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('decodedPixelLimit (owner Q-H7)', () => {
  it('is 100 MP on a touch screen, the largest size measured within the phone budget', () => {
    expect(MAX_DECODED_PIXELS_TOUCH).toBe(100_000_000)
    stubPointer(true)
    expect(decodedPixelLimit()).toBe(MAX_DECODED_PIXELS_TOUCH)
  })

  it('is the general limit with a fine pointer', () => {
    stubPointer(false)
    expect(decodedPixelLimit()).toBe(MAX_DECODED_PIXELS)
  })

  it('asks for the primary pointer, so a laptop with a touch screen keeps the general limit', () => {
    const matchMedia = stubPointer(true)
    decodedPixelLimit()
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)')
    expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)')
  })

  it('is the general limit where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(decodedPixelLimit()).toBe(MAX_DECODED_PIXELS)
  })

  it('reads the pointer on every call, so a tablet that gains a mouse gets the general limit', () => {
    stubPointer(true)
    expect(decodedPixelLimit()).toBe(MAX_DECODED_PIXELS_TOUCH)
    stubPointer(false)
    expect(decodedPixelLimit()).toBe(MAX_DECODED_PIXELS)
  })
})
