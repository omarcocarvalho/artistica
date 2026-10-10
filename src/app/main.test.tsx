import { describe, expect, it, vi } from 'vitest'
import { useSettings } from '../features/settings'

const mocks = vi.hoisted(() => ({
  register: vi.fn(() => Promise.resolve()),
  render: vi.fn(),
}))
vi.mock('../sw/register', () => ({ registerServiceWorker: mocks.register }))
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: mocks.render }) }))
vi.mock('./App', () => ({ App: () => null }))

describe('main', () => {
  it('registers the service worker once, with its production-only defaults (M4-R20)', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)
    window.history.replaceState(null, '', '/artistica/app/?lang=en&x=1')
    document.documentElement.lang = 'xx'
    await import('./main')
    expect(mocks.register).toHaveBeenCalledExactlyOnceWith()
    await vi.waitFor(() => {
      expect(mocks.render).toHaveBeenCalledOnce()
    })
  })

  it('removes the ?lang hint without saving it, then sets the page language and title (M6-R3, R6)', () => {
    expect(window.location.search).toBe('?x=1')
    expect(useSettings.getState().language).toBeNull()
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.title).toBe('Artistica app')
  })
})
