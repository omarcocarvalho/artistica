import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { EmptyState } from './EmptyState'

beforeAll(async () => {
  await initI18n()
})

describe('EmptyState', () => {
  it('shows the heading, the privacy line, and mounts the actions slot', () => {
    render(<EmptyState actions={<button type="button">Upload photos</button>} />)
    expect(screen.getByRole('heading', { name: 'Add some reference photos' })).toBeInTheDocument()
    expect(screen.getByText('Nothing is uploaded. Photos stay on this device.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload photos' })).toBeInTheDocument()
  })
})
