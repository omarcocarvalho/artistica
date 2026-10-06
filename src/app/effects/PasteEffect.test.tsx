import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'

const addFromClipboard = vi.hoisted(() => vi.fn(() => Promise.resolve([])))
vi.mock('../../features/images', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useImages: { getState: () => ({ images: [], addFromClipboard }) } }
})

import { useAppUi } from '../state/useAppUi'
import { PasteEffect } from './PasteEffect'

beforeAll(async () => {
  await initI18n()
})
afterEach(() => {
  addFromClipboard.mockClear()
  useAppUi.setState(useAppUi.getInitialState())
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
  it('ignores a page-level paste while the export dialog is open', () => {
    useAppUi.getState().openExport()
    render(<PasteEffect />)
    const event = paste(document.body)
    expect(addFromClipboard).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
  it('ignores a page-level paste while the edit sheet is open', () => {
    useAppUi.getState().openEdit('a' as ImageId)
    render(<PasteEffect />)
    paste(document.body)
    expect(addFromClipboard).not.toHaveBeenCalled()
  })
  it('ignores a paste whose target is inside a dialog', () => {
    render(<PasteEffect />)
    const dialog = document.body.appendChild(document.createElement('div'))
    dialog.setAttribute('role', 'dialog')
    const button = dialog.appendChild(document.createElement('button'))
    expect(paste(button).defaultPrevented).toBe(false)
    expect(addFromClipboard).not.toHaveBeenCalled()
    dialog.remove()
  })
  it('imports again once the dialogs are closed', () => {
    useAppUi.getState().openExport()
    render(<PasteEffect />)
    paste(document.body)
    useAppUi.getState().closeExport()
    paste(document.body)
    expect(addFromClipboard).toHaveBeenCalledTimes(1)
  })
})
