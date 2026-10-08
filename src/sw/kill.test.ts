import { describe, expect, it, vi } from 'vitest'
import { type KillSwitchScope, startKillSwitch } from './kill.ts'

function setup(keys: string[]) {
  const stores = new Set(keys)
  const order: string[] = []
  const listeners = new Map<string, (event: { waitUntil(p: Promise<unknown>): void }) => void>()
  const scope: KillSwitchScope = {
    caches: {
      keys: vi.fn(() => Promise.resolve([...stores])),
      delete: vi.fn((key: string) => {
        order.push(`delete ${key}`)
        return Promise.resolve(stores.delete(key))
      }),
    },
    registration: {
      unregister: vi.fn(() => {
        order.push('unregister')
        return Promise.resolve(true)
      }),
    },
    skipWaiting: vi.fn(() => {
      order.push('skipWaiting')
      return Promise.resolve()
    }),
    addEventListener: (type, listener) => {
      listeners.set(type, listener)
    },
  }
  startKillSwitch(scope)
  const lifecycle = async (type: 'install' | 'activate') => {
    let pending: Promise<unknown> = Promise.resolve()
    listeners.get(type)?.({
      waitUntil: (p) => {
        pending = p
      },
    })
    await pending
  }
  return { stores, order, listeners, lifecycle }
}

describe('kill switch worker', () => {
  it('takes over at once, deletes every shell cache, then unregisters', async () => {
    const sw = setup(['artistica-shell-a', 'artistica-shell-b', 'artistica-ai-v1', 'other'])
    await sw.lifecycle('install')
    expect(sw.order).toEqual(['skipWaiting'])
    await sw.lifecycle('activate')
    expect(sw.order.slice(1, 3).sort()).toEqual([
      'delete artistica-shell-a',
      'delete artistica-shell-b',
    ])
    expect(sw.order.at(-1)).toBe('unregister')
    expect([...sw.stores].sort()).toEqual(['artistica-ai-v1', 'other'])
  })

  it('handles no fetch event, so every request goes to the network', () => {
    const sw = setup([])
    expect([...sw.listeners.keys()]).toEqual(['install', 'activate'])
  })
})
