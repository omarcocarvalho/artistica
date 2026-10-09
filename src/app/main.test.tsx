import { describe, expect, it, vi } from 'vitest'

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
    await import('./main')
    expect(mocks.register).toHaveBeenCalledExactlyOnceWith()
    await vi.waitFor(() => {
      expect(mocks.render).toHaveBeenCalledOnce()
    })
  })
})
