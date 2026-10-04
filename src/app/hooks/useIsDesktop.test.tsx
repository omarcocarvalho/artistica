import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_MIN_PX, useIsDesktop } from './useIsDesktop'

function stubMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }))
  return (next: boolean) => {
    matches = next
    listeners.forEach((cb) => {
      cb()
    })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsDesktop', () => {
  it('uses a 960px min-width query', () => {
    expect(DESKTOP_MIN_PX).toBe(960)
  })
  it('follows the media query', () => {
    const set = stubMatchMedia(true)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
    act(() => {
      set(false)
    })
    expect(result.current).toBe(false)
  })
})
