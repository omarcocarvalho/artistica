import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const count = vi.hoisted(() => ({ value: 0 }))
vi.mock('../state/hasImages', () => ({ useImageCount: () => count.value }))

import { LeaveWarningEffect } from './LeaveWarningEffect'

function fire(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
/** Records what the handler assigns to the (deprecated) `returnValue`. */
function assignedReturnValue(): unknown[] {
  const event = new Event('beforeunload', { cancelable: true })
  const assigned: unknown[] = []
  Object.defineProperty(event, 'returnValue', {
    set: (value: unknown) => assigned.push(value),
    get: () => '',
  })
  window.dispatchEvent(event)
  return assigned
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LeaveWarningEffect (R12)', () => {
  it('asks the browser to confirm leaving while images are loaded', () => {
    count.value = 2
    render(<LeaveWarningEffect />)
    expect(fire()).toBe(true)
  })
  it('does not interfere when no images are loaded', () => {
    count.value = 0
    render(<LeaveWarningEffect />)
    expect(fire()).toBe(false)
  })
  it('removes the listener on unmount', () => {
    count.value = 2
    const { unmount } = render(<LeaveWarningEffect />)
    unmount()
    expect(fire()).toBe(false)
  })
  it('also sets returnValue for browsers that need it', () => {
    count.value = 2
    render(<LeaveWarningEffect />)
    expect(assignedReturnValue()).toEqual([''])
    expect(fire()).toBe(true)
  })
  it('removes the listener when the images are all removed', () => {
    count.value = 2
    const { rerender } = render(<LeaveWarningEffect />)
    count.value = 0
    rerender(<LeaveWarningEffect />)
    expect(fire()).toBe(false)
  })
  it('registers exactly once across a rerender with a different non-zero count', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    count.value = 2
    const { rerender } = render(<LeaveWarningEffect />)
    count.value = 3
    rerender(<LeaveWarningEffect />)
    const adds = (m: typeof add) => m.mock.calls.filter(([type]) => type === 'beforeunload').length
    expect(adds(add)).toBe(1)
    expect(adds(remove)).toBe(0)
  })
})
