import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const count = vi.hoisted(() => ({ value: 0 }))
vi.mock('../state/hasImages', () => ({ useImageCount: () => count.value }))

import { LeaveWarningEffect } from './LeaveWarningEffect'

function fire(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

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
})
