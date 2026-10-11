import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { switchLanguage } from '../../test/languages'
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

  it('underlines the highlighted words of the heading', () => {
    render(<EmptyState actions={null} />)
    const heading = screen.getByRole('heading', { name: 'Add some reference photos' })
    const highlight = heading.querySelector('span')
    expect(highlight).toHaveTextContent(/^reference photos$/)
    expect(highlight).toHaveClass('decoration-wavy')
  })
})

describe('EmptyState in another language (M6-R10)', () => {
  afterAll(async () => {
    await switchLanguage('en')
  })

  it('takes the heading from one key, so the language places the highlight', async () => {
    await switchLanguage('ja', {
      app: { empty: { title: '<highlight>参考写真</highlight>を追加' } },
    })
    render(<EmptyState actions={null} />)
    const heading = screen.getByRole('heading')
    expect(heading.textContent).toBe('参考写真を追加')
    expect(heading.firstElementChild).toHaveTextContent(/^参考写真$/)
    expect(heading.firstElementChild).toHaveClass('decoration-wavy')
  })
})
