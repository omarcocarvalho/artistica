import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { useNotices } from '../state/useNotices'

const addFromClipboard = vi.hoisted(() =>
  vi.fn<() => Promise<unknown[] | null>>(() => Promise.resolve([])),
)
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
  useNotices.getState().clear()
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
  it('a paste discarded by Remove all (null) shows no notice', async () => {
    addFromClipboard.mockResolvedValueOnce(null)
    render(<PasteEffect />)
    paste(document.body)
    expect(addFromClipboard).toHaveBeenCalledTimes(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(useNotices.getState().notices).toEqual([])
  })
  it('a paste with nothing importable still says there is no image', async () => {
    render(<PasteEffect />)
    paste(document.body)
    await vi.waitFor(() => {
      expect(useNotices.getState().notices).toHaveLength(1)
    })
    const [notice] = useNotices.getState().notices
    expect(notice?.kind).toBe('info')
    expect(notice?.message).toContain('No image')
  })
  it('stops listening after unmount', () => {
    const { unmount } = render(<PasteEffect />)
    unmount()
    paste(document.body)
    expect(addFromClipboard).not.toHaveBeenCalled()
  })
})
