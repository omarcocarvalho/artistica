import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
})

// happy-dom lacks ResizeObserver in some versions; Radix measures with it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {
      /* no layout in tests */
    }
    unobserve(): void {
      /* no layout in tests */
    }
    disconnect(): void {
      /* no layout in tests */
    }
  }
  globalThis.ResizeObserver = ResizeObserverStub
}

// happy-dom's IntersectionObserver never reports, so every observed page would stay undecided.
Reflect.deleteProperty(globalThis, 'IntersectionObserver')
