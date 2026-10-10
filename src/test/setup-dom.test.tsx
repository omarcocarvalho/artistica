import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('dom project', () => {
  it('renders with happy-dom and has jest-dom matchers', () => {
    render(<button type="button">Hello</button>)
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument()
    expect(document.body).toBeInstanceOf(HTMLElement)
  })

  it('has no IntersectionObserver, so the preview counts every page as near', () => {
    expect(typeof IntersectionObserver).toBe('undefined')
  })

  it('cleans up between tests', () => {
    expect(screen.queryByRole('button')).toBeNull()
  })
})
