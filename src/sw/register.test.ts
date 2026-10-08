import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './register.ts'

const container = (result: Promise<unknown> = Promise.resolve({})) => ({
  register: vi.fn(() => result),
})

describe('registerServiceWorker', () => {
  it('registers /artistica/sw.js with scope /artistica/ in production only', async () => {
    const prod = container()
    await registerServiceWorker({ serviceWorker: prod }, true, '/artistica/')
    expect(prod.register).toHaveBeenCalledExactlyOnceWith('/artistica/sw.js', {
      scope: '/artistica/',
      updateViaCache: 'none',
    })

    const dev = container()
    await registerServiceWorker({ serviceWorker: dev }, false, '/artistica/')
    expect(dev.register).not.toHaveBeenCalled()
  })

  it('does nothing without navigator.serviceWorker', async () => {
    await expect(registerServiceWorker({}, true, '/artistica/')).resolves.toBeUndefined()
  })

  it('a registration failure is ignored (the app works online)', async () => {
    const failing = container(Promise.reject(new DOMException('denied', 'SecurityError')))
    await expect(
      registerServiceWorker({ serviceWorker: failing }, true, '/artistica/'),
    ).resolves.toBeUndefined()
    expect(failing.register).toHaveBeenCalledOnce()
  })
})
