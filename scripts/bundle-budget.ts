import { gzipSync } from 'node:zlib'

/** Spec §3: initial app JS < 250 KB gzipped (decimal KB, the stricter reading). */
export const INITIAL_JS_LIMIT_BYTES = 250_000

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

export function initialScriptPaths(html: string, base: string): string[] {
  const out: string[] = []
  const add = (url: string | undefined) => {
    if (!url?.startsWith(base) || !url.endsWith('.js')) return
    const rel = url.slice(base.length)
    if (!out.includes(rel)) out.push(rel)
  }
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/g)) {
    const tag = m[0]
    if (m[1] === 'script' && attr(tag, 'type') === 'module') add(attr(tag, 'src'))
    if (m[1] === 'link' && attr(tag, 'rel') === 'modulepreload') add(attr(tag, 'href'))
  }
  return out
}

export function gzipBytes(data: Uint8Array): number {
  return gzipSync(data, { level: 9 }).length
}

export const LAZY_ONLY_MARKERS = ['FaceLandmarker', 'PoseLandmarker']

export function lazyOnlyViolations(entries: readonly { file: string; text: string }[]): string[] {
  return entries.flatMap(({ file, text }) =>
    LAZY_ONLY_MARKERS.filter((m) => text.includes(m)).map((m) => `${file}: ${m}`),
  )
}

export function evaluateBudget(
  entries: readonly { file: string; gzipBytes: number }[],
  limit: number = INITIAL_JS_LIMIT_BYTES,
): { totalBytes: number; ok: boolean } {
  const totalBytes = entries.reduce((sum, e) => sum + e.gzipBytes, 0)
  return { totalBytes, ok: totalBytes <= limit }
}
