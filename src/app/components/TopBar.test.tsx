import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { TopBar } from './TopBar'

beforeAll(async () => {
  await initI18n()
})

describe('TopBar', () => {
  it('has a level-1 heading named Artistica, a skip link, the privacy pill and no language picker', () => {
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Artistica' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to preview' })).toHaveAttribute('href', '#main')
    expect(screen.getByText('Photos stay on this device')).toBeInTheDocument()
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument()
  })
  it('calls onExport when enabled', async () => {
    const onExport = vi.fn()
    render(<TopBar onExport={onExport} exportDisabledReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })
  it('keeps the disabled export focusable, explains why, and ignores clicks', async () => {
    const onExport = vi.fn()
    render(<TopBar onExport={onExport} exportDisabledReason="Add at least one image to export." />)
    const button = screen.getByRole('button', { name: 'Export PDF' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription('Add at least one image to export.')
    await userEvent.click(button)
    expect(onExport).not.toHaveBeenCalled()
  })
})
