import type { Page } from '@playwright/test'

export interface NetworkGuard {
  /** Register a URL the test "typed as the user" (exact GET/HEAD to it is then allowed). */
  allowExternal(url: string): void
  /** Requests that broke the privacy rule, as `METHOD url`. */
  violations(): string[]
}

/**
 * Records every request. Strict by default: a request is a violation unless it is
 *  - data:, blob: or about:. These never leave the browser (inline or in-memory content, e.g. the
 *    app's own object URLs for thumbnails), so they cannot leak anything,
 *  - same-origin, GET/HEAD, with no body, or
 *  - an exact GET/HEAD to a URL the test registered as typed by the user (a failed CORS import
 *    makes two requests to that URL, a GET and a HEAD). The FULL URL, query included, must match.
 * Any WebSocket is a violation. Service workers are out of scope (the app has none); fetches from
 * dedicated workers are visible to `page.on('request')` in Chromium.
 * Install it before navigating so nothing is missed. The app origin is `options.origin` or, by
 * default, the origin of the first http(s) main-frame navigation.
 */
export function guardNetwork(page: Page, options: { origin?: string } = {}): NetworkGuard {
  const seen: { url: string; method: string; body: boolean }[] = []
  const sockets: string[] = []
  const allowed = new Set<string>()
  let appOrigin = options.origin
  page.on('request', (r) => {
    if (
      appOrigin === undefined &&
      r.isNavigationRequest() &&
      r.frame() === page.mainFrame() &&
      /^https?:/.test(r.url())
    )
      appOrigin = new URL(r.url()).origin
    seen.push({ url: r.url(), method: r.method(), body: r.postDataBuffer() !== null })
  })
  page.on('websocket', (ws) => {
    sockets.push(`WEBSOCKET ${ws.url()}`)
  })
  return {
    allowExternal: (url) => {
      allowed.add(new URL(url).href)
    },
    violations: () => {
      const requests = seen
        .filter((r) => {
          if (/^(data|blob|about):/.test(r.url)) return false
          const safeMethod = (r.method === 'GET' || r.method === 'HEAD') && !r.body
          if (new URL(r.url).origin === appOrigin) return !safeMethod
          return !(safeMethod && allowed.has(new URL(r.url).href))
        })
        .map((r) => `${r.method} ${r.url}${r.body ? ' (with body)' : ''}`)
      return [...requests, ...sockets]
    },
  }
}
