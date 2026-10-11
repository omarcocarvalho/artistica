import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PSEUDO_LANGUAGE, initI18n, setPseudoLanguage, type LanguageCode } from '../../shared/i18n'
import { stubDesktop } from '../test-utils'
import { TopBar } from './TopBar'

beforeAll(async () => {
  await initI18n()
  await setPseudoLanguage()
  await i18next.changeLanguage('en')
})
beforeEach(() => {
  stubDesktop(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const REASON = 'Add at least one image to export.'

describe('TopBar', () => {
  it('has a level-1 heading named Artistica, a skip link and the privacy pill', () => {
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Artistica' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to preview' })).toHaveAttribute('href', '#main')
    expect(screen.getByText('Photos stay on this device')).toBeInTheDocument()
  })
  it('puts the language select right before the theme toggle, at every width', () => {
    for (const desktop of [true, false]) {
      stubDesktop(desktop)
      const view = render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
      const select = screen.getByRole('combobox', { name: 'Language' })
      const theme = screen.getByRole('button', { name: /^Change theme/ })
      const control = select.parentElement
      expect(control?.parentElement).toBe(screen.getByRole('banner'))
      expect(control?.nextElementSibling).toBe(theme)
      view.unmount()
    }
  })

  describe('the home link goes to the landing page of the language showing (M6-R21)', () => {
    afterEach(async () => {
      await i18next.changeLanguage('en')
    })
    it.each<[LanguageCode, string]>([
      ['en', '../'],
      ['pt-BR', '../pt-BR/'],
      ['ja', '../ja/'],
      ['zh-CN', '../zh-CN/'],
    ])('%s → %s', async (code, href) => {
      await i18next.changeLanguage(code)
      render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
      expect(screen.getByRole('link', { name: 'Artistica home' })).toHaveAttribute('href', href)
    })
    it('goes to the English landing page under the pseudo-locale (M6-R14)', async () => {
      await i18next.changeLanguage(PSEUDO_LANGUAGE)
      render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
      expect(i18next.language).toBe(PSEUDO_LANGUAGE)
      expect(screen.getByRole('link', { name: /Áŕţíšţíçá/ })).toHaveAttribute('href', '../')
    })
    it('follows a language change while mounted', async () => {
      render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
      const home = screen.getByRole('link', { name: 'Artistica home' })
      expect(home).toHaveAttribute('href', '../')
      await act(async () => {
        await i18next.changeLanguage('ko')
      })
      expect(home).toHaveAttribute('href', '../ko/')
    })
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
