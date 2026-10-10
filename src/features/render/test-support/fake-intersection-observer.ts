import { act } from '@testing-library/react'
import { vi } from 'vitest'

interface FakeObserver {
  readonly callback: IntersectionObserverCallback
  readonly options: IntersectionObserverInit
  readonly targets: Set<Element>
  readonly self: IntersectionObserver
}

/**
 * Installs an `IntersectionObserver` that never fires on its own; tests decide which targets
 * intersect with `set(target, true | false)`. Restore with `vi.unstubAllGlobals()`.
 */
export function installFakeIntersectionObserver() {
  const observers = new Set<FakeObserver>()
  class FakeIntersectionObserver {
    readonly root: Element | Document | null
    readonly rootMargin: string
    readonly thresholds: readonly number[] = [0]
    readonly #fake: FakeObserver
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
      this.root = options.root ?? null
      this.rootMargin = options.rootMargin ?? '0px'
      this.#fake = {
        callback,
        options,
        targets: new Set(),
        self: this as unknown as IntersectionObserver,
      }
      observers.add(this.#fake)
    }
    observe(target: Element) {
      this.#fake.targets.add(target)
    }
    unobserve(target: Element) {
      this.#fake.targets.delete(target)
    }
    disconnect() {
      this.#fake.targets.clear()
      observers.delete(this.#fake)
    }
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

  const watching = (target: Element) => [...observers].filter((o) => o.targets.has(target))
  return {
    /** Options of every live observer that watches `target`. */
    optionsFor: (target: Element) => watching(target).map((o) => o.options),
    liveCount: () => observers.size,
    /** Delivers one entry for `target` to every observer watching it. */
    set(target: Element, isIntersecting: boolean) {
      this.batch(target, [isIntersecting])
    },
    /** Delivers several entries for `target` in one callback, oldest first. */
    batch(target: Element, states: readonly boolean[]) {
      act(() => {
        for (const o of watching(target)) {
          const entries = states.map(
            (isIntersecting) =>
              ({ target, isIntersecting }) as unknown as IntersectionObserverEntry,
          )
          o.callback(entries, o.self)
        }
      })
    },
  }
}
