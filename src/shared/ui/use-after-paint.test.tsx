import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAfterPaint } from './use-after-paint'

let pending = new Map<number, FrameRequestCallback>()
let nextId = 1
const runFrame = () => {
  const due = [...pending.values()]
  pending = new Map()
  act(() => {
    for (const f of due) f(0)
  })
}

beforeEach(() => {
  pending = new Map()
  nextId = 1
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    pending.set(nextId, f)
    return nextId++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id)
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAfterPaint', () => {
  it('turns on two animation frames after mount, so the region is painted empty first', () => {
    const { result } = renderHook(() => useAfterPaint(true))
    expect(result.current).toBe(false)
    runFrame()
    expect(result.current).toBe(false)
    runFrame()
    expect(result.current).toBe(true)
  })

  it('is on at once when it does not wait', () => {
    const { result } = renderHook(() => useAfterPaint(false))
    expect(result.current).toBe(true)
    expect(pending.size).toBe(0)
  })

  it('cancels whichever frame is pending when unmounted', () => {
    const first = renderHook(() => useAfterPaint(true))
    first.unmount()
    expect(pending.size).toBe(0)
    const second = renderHook(() => useAfterPaint(true))
    runFrame()
    expect(pending.size).toBe(1)
    second.unmount()
    expect(pending.size).toBe(0)
  })
})
