import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from '../features/settings'
import { initI18n } from '../shared/i18n'
import { App } from './App'
import { stubDesktop } from './test-utils'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App (desktop, no images)', () => {
  it('renders the three regions, the empty state and a disabled export', () => {
    stubDesktop(true)
    render(<App />)
    expect(screen.getByRole('complementary', { name: /^Images/ })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add some reference photos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
  it('applies the saved theme to <html>', () => {
    stubDesktop(true)
    useSettings.getState().setTheme('dark')
    render(<App />)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
