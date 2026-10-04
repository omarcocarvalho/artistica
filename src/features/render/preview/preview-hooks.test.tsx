import { act, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDrawColors } from './draw-colors'
import { DEFAULT_PAGE_DRAW_COLORS } from './draw-page'
import { releaseAllTileCanvases, syncTileCanvasCache } from './tile-cache'
import { useDevicePixelRatio, useElementWidth } from './use-element-width'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('syncTileCanvasCache', () => {
  it('creates missing entries, reuses existing ones and skips null keys', () => {
    const cache = new Map<string, string>()
    const create = vi.fn((i: number) => `c${String(i)}`)
    const release = vi.fn()
    expect(syncTileCanvasCache(cache, ['a', null, 'b'], create, release)).toEqual([
      'c0',
      null,
      'c2',
    ])
    expect(syncTileCanvasCache(cache, ['a', 'b'], create, release)).toEqual(['c0', 'c2'])
    expect(create).toHaveBeenCalledTimes(2)
    expect(release).not.toHaveBeenCalled()
  })
  it('releases and evicts entries no longer used', () => {
    const cache = new Map<string, string>()
    const release = vi.fn()
    syncTileCanvasCache(cache, ['a', 'b'], (i) => `c${String(i)}`, release)
    syncTileCanvasCache(cache, ['b'], (i) => `c${String(i)}`, release)
    expect(release).toHaveBeenCalledExactlyOnceWith('c0')
    expect([...cache.keys()]).toEqual(['b'])
  })
  it('releases everything', () => {
    const cache = new Map([
      ['a', 1],
      ['b', 2],
    ])
    const release = vi.fn()
    releaseAllTileCanvases(cache, release)
    expect(release).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(0)
  })
})

describe('readDrawColors', () => {
  it('uses CSS tokens and falls back for missing ones', () => {
    const style = (vals: Record<string, string>) => ({
      getPropertyValue: (n: string) => vals[n] ?? '',
    })
    const el = document.createElement('div')
    const c = readDrawColors(el, () => style({ '--color-guide-safe': ' #123456 ' }))
    expect(c.safe).toBe('#123456')
    expect(c.bleed).toBe(DEFAULT_PAGE_DRAW_COLORS.bleed)
    expect(readDrawColors(el).paper).toBe(DEFAULT_PAGE_DRAW_COLORS.paper)
  })
})

describe('useElementWidth', () => {
  it('observes, follows resizes and disconnects on unmount', () => {
    let cb: ResizeObserverCallback = () => undefined
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(c: ResizeObserverCallback) {
          cb = c
        }
        observe = observe
        disconnect = disconnect
        unobserve = vi.fn()
      },
    )
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 120 })
    const ref = { current: el }
    const { result, unmount } = renderHook(() => useElementWidth(ref))
    expect(result.current).toBe(120)
    expect(observe).toHaveBeenCalledWith(el)
    act(() => {
      cb([{ contentRect: { width: 300 } } as ResizeObserverEntry], {} as ResizeObserver)
    })
    expect(result.current).toBe(300)
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
  it('stays 0 for an unattached ref and tolerates no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    expect(renderHook(() => useElementWidth({ current: null })).result.current).toBe(0)
    const el = document.createElement('div')
    expect(renderHook(() => useElementWidth({ current: el })).result.current).toBe(0)
  })
})

describe('useDevicePixelRatio', () => {
  it('re-subscribes when the ratio changes', () => {
    const listeners: (() => void)[] = []
    const queries: string[] = []
    vi.stubGlobal('matchMedia', (q: string) => {
      queries.push(q)
      return {
        addEventListener: (_: string, l: () => void) => listeners.push(l),
        removeEventListener: vi.fn(),
      }
    })
    vi.stubGlobal('devicePixelRatio', 1)
    const { result } = renderHook(() => useDevicePixelRatio())
    expect(result.current).toBe(1)
    vi.stubGlobal('devicePixelRatio', 2)
    act(() => {
      listeners[0]?.()
    })
    expect(result.current).toBe(2)
    expect(queries).toEqual(['(resolution: 1dppx)', '(resolution: 2dppx)'])
  })
  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useDevicePixelRatio()).result.current).toBeGreaterThan(0)
    render(<div />)
  })
})
