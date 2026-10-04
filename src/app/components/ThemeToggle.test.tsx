import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useSettings } from '../../features/settings'
import { initI18n } from '../../shared/i18n'
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
