import { SHELL_CACHE_PREFIX } from './config'
import type { ExtendableEventLike } from './sw'

export interface KillSwitchScope {
  readonly caches: Pick<CacheStorage, 'keys' | 'delete'>
  readonly registration: { unregister(): Promise<boolean> }
  skipWaiting(): Promise<void>
  addEventListener(
    type: 'install' | 'activate',
    listener: (event: ExtendableEventLike) => void,
  ): void
}

export function startKillSwitch(scope: KillSwitchScope): void {
  scope.addEventListener('install', (event) => {
    event.waitUntil(scope.skipWaiting())
  })

  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      scope.caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(SHELL_CACHE_PREFIX))
              .map((key) => scope.caches.delete(key)),
          ),
        )
        .then(() => scope.registration.unregister()),
    )
  })
}
