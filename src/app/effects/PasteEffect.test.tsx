import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'

const addFromClipboard = vi.hoisted(() => vi.fn(() => Promise.resolve([])))
vi.mock('../../features/images', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useImages: { getState: () => ({ images: [], addFromClipboard }) } }
})

import { PasteEffect } from './PasteEffect'

beforeAll(async () => {
  await initI18n()
})
afterEach(() => {
  addFromClipboard.mockClear()
})

function paste(target: Element): ClipboardEvent {
  const event = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: new DataTransfer(),
  })
  target.dispatchEvent(event)
  return event
}

describe('PasteEffect', () => {
  it('imports a paste on the body synchronously and prevents the default', () => {
    render(<PasteEffect />)
    const event = paste(document.body)
    expect(addFromClipboard).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })
  it('ignores pastes into text inputs and contenteditable elements', () => {
    render(<PasteEffect />)
    const input = document.body.appendChild(document.createElement('input'))
    const editable = document.body.appendChild(document.createElement('div'))
    editable.setAttribute('contenteditable', 'true')
    expect(paste(input).defaultPrevented).toBe(false)
    paste(editable)
    expect(addFromClipboard).not.toHaveBeenCalled()
    input.remove()
    editable.remove()
  })
  it('stops listening after unmount', () => {
    const { unmount } = render(<PasteEffect />)
    unmount()
    paste(document.body)
    expect(addFromClipboard).not.toHaveBeenCalled()
  })
})
