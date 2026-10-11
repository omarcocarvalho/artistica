import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useSettings } from '../../features/settings'
import { initI18n } from '../../shared/i18n'
import { PT_BR, switchLanguage } from '../../test/languages'
import { ThemeToggle } from './ThemeToggle'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
})

describe('ThemeToggle', () => {
  it('cycles auto, light, dark, auto and shows the current mode', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: /change theme/i })
    expect(button).toHaveTextContent('Auto')
    await user.click(button)
    expect(useSettings.getState().theme).toBe('light')
    expect(button).toHaveTextContent('Light')
    await user.click(button)
    expect(useSettings.getState().theme).toBe('dark')
    await user.click(button)
    expect(useSettings.getState().theme).toBe('auto')
  })
})

describe('ThemeToggle names (M6-R10, WCAG 2.5.3)', () => {
  afterAll(async () => {
    await switchLanguage('en')
  })

  it('builds the accessible name from one key that holds the visible text', async () => {
    await switchLanguage('en')
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Change theme: Auto' })
    expect(button).toHaveTextContent('Auto')
  })

  it('lets a language word the whole name, the visible text inside it', async () => {
    await switchLanguage('pt-BR', PT_BR)
    const user = userEvent.setup()
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Tema (Automático) — mudar' })
    expect(button).toHaveTextContent('Automático')
    await user.click(button)
    expect(button).toHaveAccessibleName('Tema (Claro) — mudar')
    expect(button.getAttribute('aria-label')).toContain(button.textContent)
  })
})
