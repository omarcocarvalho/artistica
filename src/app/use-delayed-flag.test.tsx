import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDelayedFlag } from './use-delayed-flag'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const setup = (flag: boolean) =>
  renderHook(({ on }) => useDelayedFlag(on, 500), { initialProps: { on: flag } })

describe('useDelayedFlag', () => {
  it('stays off while the flag is off', () => {
    const { result } = setup(false)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current).toBe(false)
  })

  it('turns on only once the flag has been on for the whole delay', () => {
    const { result } = setup(true)
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(true)
  })

  it('turns off at once when the flag turns off', () => {
    const { result, rerender } = setup(true)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current).toBe(true)
    rerender({ on: false })
    expect(result.current).toBe(false)
  })

  it('never reports on in a render where the flag is off', () => {
    const renders: [boolean, boolean][] = []
    const { rerender } = renderHook(
      ({ on }) => {
        const value = useDelayedFlag(on, 500)
        renders.push([on, value])
        return value
      },
      { initialProps: { on: true } },
    )
    act(() => {
      vi.advanceTimersByTime(500)
    })
    rerender({ on: false })
    expect(renders).toContainEqual([true, true])
    expect(renders).not.toContainEqual([false, true])
  })

  it('restarts the delay each time the flag turns on', () => {
    const { result, rerender } = setup(true)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender({ on: false })
    rerender({ on: true })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe(true)
  })

  it('starts the delay again after a run that turned on', () => {
    const { result, rerender } = setup(true)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    rerender({ on: false })
    rerender({ on: true })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current).toBe(false)
  })
})
