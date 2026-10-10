import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { DesktopWorkspace } from './DesktopWorkspace'

beforeAll(async () => {
  await initI18n()
})

describe('DesktopWorkspace preview toolbar', () => {
  it('sticks to the top of the preview, and the preview scrolls focused items clear of it (WCAG 2.4.11)', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96)
    render(
      <DesktopWorkspace
        imageCount={1}
        images={null}
        emptyActions={null}
        preview={<p>pages</p>}
        previewToolbar={<button type="button">Arrange</button>}
        settings={null}
      />,
    )
    const toolbar = screen.getByRole('button', { name: 'Arrange' }).parentElement
    expect(toolbar).toHaveClass('sticky', 'top-0')
    expect(screen.getByRole('main').style.scrollPaddingTop).toBe('104px')
    vi.restoreAllMocks()
  })
})
