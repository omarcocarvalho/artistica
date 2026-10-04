import { vi } from 'vitest'

/** Make `window.matchMedia('(min-width: 960px)')` return `desktop`. Call `vi.unstubAllGlobals()` in afterEach. */
export function stubDesktop(desktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? desktop : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}
