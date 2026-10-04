import type { Page } from '@playwright/test'

export interface NetworkGuard {
  /** Register a URL the test "typed as the user" (exact GET/HEAD to it is then allowed). */
  allowExternal(url: string): void
  /** Requests that broke the privacy rule, as `METHOD url`. */
  violations(): string[]
}

/**
 * Records every request. Strict by default: a request is a violation unless it is
 *  - data:, blob: or about:,
 *  - same-origin, GET/HEAD, with no body, or
 *  - an exact GET/HEAD to a URL the test registered as typed by the user (a failed CORS import
 *    makes two requests to that URL, a GET and a HEAD).
 * Install it before navigating so nothing is missed.
 */
export function guardNetwork(page: Page): NetworkGuard {
  const seen: { url: string; method: string; body: boolean }[] = []
  const allowed = new Set<string>()
  page.on('request', (r) => {
    seen.push({ url: r.url(), method: r.method(), body: r.postDataBuffer() !== null })
  })
  const key = (u: string) => {
    const x = new URL(u)
    return `${x.origin}${x.pathname}`
  }
  return {
    allowExternal: (url) => {
      allowed.add(key(url))
    },
    violations: () => {
      const origin = new URL(page.url() === 'about:blank' ? 'http://localhost' : page.url()).origin
      return seen
        .filter((r) => {
          if (/^(data|blob|about):/.test(r.url)) return false
          const safeMethod = (r.method === 'GET' || r.method === 'HEAD') && !r.body
          if (new URL(r.url).origin === origin) return !safeMethod
          return !(safeMethod && allowed.has(key(r.url)))
        })
        .map((r) => `${r.method} ${r.url}${r.body ? ' (with body)' : ''}`)
    },
  }
}
