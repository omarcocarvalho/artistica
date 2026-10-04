import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initI18n } from '../../shared/i18n'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { stubDesktop } from '../test-utils'
import { ResponsiveSheet } from './ResponsiveSheet'

beforeAll(async () => {
  await initI18n()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each([true, false])('ResponsiveSheet (desktop=%s)', (desktop) => {
  it('shows a titled dialog with its content when open', () => {
    stubDesktop(desktop)
    render(
      <ResponsiveSheet
        open
        onOpenChange={vi.fn()}
        title="old-photo.gif"
        closeLabel="Close"
        footer={<button type="button">Extra</button>}
      >
        <p>content</p>
      </ResponsiveSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'old-photo.gif' })).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Extra' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
  it('asks to close on Escape', async () => {
    stubDesktop(desktop)
    const onOpenChange = vi.fn()
    render(
      <ResponsiveSheet open onOpenChange={onOpenChange} title="t" closeLabel="Close">
        <button type="button">inside</button>
      </ResponsiveSheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('closes with the Done button (CR-X3)', async () => {
    stubDesktop(desktop)
    const onOpenChange = vi.fn()
    render(
      <ResponsiveSheet open onOpenChange={onOpenChange} title="t" closeLabel="Close">
        <p>content</p>
      </ResponsiveSheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('renders nothing when closed', () => {
    stubDesktop(desktop)
    render(
      <ResponsiveSheet open={false} onOpenChange={vi.fn()} title="t" closeLabel="Close">
        <p>content</p>
      </ResponsiveSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
