import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { stubDesktop } from '../test-utils'
import { TopBar } from './TopBar'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  stubDesktop(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const REASON = 'Add at least one image to export.'

describe('TopBar', () => {
  it('has a level-1 heading named Artistica, a skip link, the privacy pill and no language picker', () => {
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Artistica' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to preview' })).toHaveAttribute('href', '#main')
    expect(screen.getByText('Photos stay on this device')).toBeInTheDocument()
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument()
  })
  it('links the logo to the landing page one level up from the app', () => {
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(screen.getByRole('link', { name: 'Artistica home' })).toHaveAttribute('href', '../')
  })
  it('calls onExport when enabled', async () => {
    const onExport = vi.fn()
    render(<TopBar onExport={onExport} exportDisabledReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })
  it('keeps the disabled export focusable, explains why, and ignores clicks', async () => {
    const onExport = vi.fn()
    render(<TopBar onExport={onExport} exportDisabledReason={REASON} />)
    const button = screen.getByRole('button', { name: 'Export PDF' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(REASON)
    await userEvent.click(button)
    expect(onExport).not.toHaveBeenCalled()
  })

  describe('the phone step flow', () => {
    it('hides Export below the desktop width (the Export step exports there)', () => {
      stubDesktop(false)
      render(<TopBar onExport={vi.fn()} exportDisabledReason={REASON} />)
      expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument()
      expect(screen.queryByText(REASON)).not.toBeInTheDocument()
    })
    it('shows Export on desktop', () => {
      render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeVisible()
    })
  })

  describe('the disabled reason as a tooltip (WCAG 1.4.13)', () => {
    it('shows the reason on keyboard focus, keeps it as the description, and Esc dismisses it', async () => {
      const user = userEvent.setup()
      render(<TopBar onExport={vi.fn()} exportDisabledReason={REASON} />)
      const button = screen.getByRole('button', { name: 'Export PDF' })
      button.focus()
      expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON)
      expect(button).toHaveAccessibleDescription(REASON)
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      expect(button).toHaveFocus()
    })
    it('shows the reason on hover, and stays while the pointer moves onto it', async () => {
      const user = userEvent.setup()
      render(<TopBar onExport={vi.fn()} exportDisabledReason={REASON} />)
      const button = screen.getByRole('button', { name: 'Export PDF' })
      await user.hover(button)
      const tip = await screen.findByRole('tooltip')
      expect(tip).toHaveTextContent(REASON)
      const content = document.querySelector('.ds-tooltip')
      if (!(content instanceof HTMLElement)) throw new Error('no tooltip content')
      await user.hover(content)
      expect(screen.getByRole('tooltip')).toHaveTextContent(REASON)
    })
    it('shows no tooltip while Export is available', async () => {
      render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
      const button = screen.getByRole('button', { name: 'Export PDF' })
      button.focus()
      await userEvent.hover(button)
      await new Promise((resolve) => {
        setTimeout(resolve, 400)
      })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
    it('keeps focus on Export when the reason goes away', () => {
      const view = render(<TopBar onExport={vi.fn()} exportDisabledReason={REASON} />)
      const button = screen.getByRole('button', { name: 'Export PDF' })
      button.focus()
      view.rerender(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBe(button)
      expect(button).toHaveFocus()
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })
})
