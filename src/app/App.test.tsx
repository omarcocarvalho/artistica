import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../shared/i18n'
import { App } from './App'

beforeAll(async () => {
  await initI18n({ savedLanguage: 'en' })
})

describe('App', () => {
  it('shows the app name and the translated placeholder', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Artistica' })).toBeInTheDocument()
    expect(screen.getByText('The workspace is coming soon.')).toBeInTheDocument()
  })
})
