import { act, render, screen } from '@testing-library/react'
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

  it('follows the toolbar when it wraps to more rows', () => {
    let height = 48
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height)
    let notify: () => void = () => undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly cb: () => void
        constructor(cb: () => void) {
          this.cb = cb
        }
        observe(el: Element) {
          if (el.contains(screen.getByRole('button', { name: 'Arrange' }))) notify = this.cb
        }
        disconnect = disconnect
      },
    )
    const view = render(
      <DesktopWorkspace
        imageCount={1}
        images={null}
        emptyActions={null}
        preview={<p>pages</p>}
        previewToolbar={<button type="button">Arrange</button>}
        settings={null}
      />,
    )
    expect(screen.getByRole('main').style.scrollPaddingTop).toBe('56px')
    height = 120
    act(() => {
      notify()
    })
    expect(screen.getByRole('main').style.scrollPaddingTop).toBe('128px')
    view.unmount()
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
