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

/** M6-R5: each lazily loaded language is one chunk at most this big (gzip, decimal KB). */
export const LOCALE_CHUNK_LIMIT_BYTES = 15_000

/** A locale string longer than this is distinctive enough to act as a marker. */
const LOCALE_MARKER_MIN_LENGTH = 13

export function isLocaleChunk(file: string): boolean {
  const name = file.slice(file.lastIndexOf('/') + 1)
  return name.startsWith('locale-') && name.endsWith('.js')
}

const STRING_LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.|\$(?!\{))*`/g

const CHUNK_IMPORT = /^\.\.?\/[^\s"'`]+\.js$/

function decodeLiteral(literal: string): string {
  if (literal.startsWith('"')) {
    try {
      const value: unknown = JSON.parse(literal)
      if (typeof value === 'string') return value
    } catch {
      // Not JSON-compatible escapes: compare the literal as written.
    }
  }
  return literal.slice(1, -1)
}

/**
 * LOCALE_MARKERS of one locale chunk: its string literals (as written in the chunk) longer than
 * 12 characters, minus chunk import paths and strings equal to an English string, which belong
 * in the initial chunks.
 */
export function localeMarkers(text: string, english: ReadonlySet<string> = new Set()): string[] {
  const out = new Set<string>()
  for (const [literal] of text.matchAll(STRING_LITERAL)) {
    const value = decodeLiteral(literal)
    if (CHUNK_IMPORT.test(value) || english.has(value)) continue
    if (value.length >= LOCALE_MARKER_MIN_LENGTH) out.add(literal)
  }
  return [...out]
}

export function localeMarkerViolations(
  localeChunks: readonly { file: string; text: string }[],
  initialChunks: readonly { file: string; text: string }[],
  english: ReadonlySet<string>,
): string[] {
  return localeChunks.flatMap((locale) =>
    localeMarkers(locale.text, english).flatMap((marker) =>
      initialChunks
        .filter(({ text }) => text.includes(marker))
        .map(({ file }) => `${file}: ${marker} (from ${locale.file})`),
    ),
  )
}

export function localeChunkViolations(
  entries: readonly { file: string; gzipBytes: number }[],
  limit: number = LOCALE_CHUNK_LIMIT_BYTES,
): string[] {
  const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`
  return entries
    .filter((e) => isLocaleChunk(e.file) && e.gzipBytes > limit)
    .map((e) => `${e.file}: ${kb(e.gzipBytes)} of ${kb(limit)} (${String(e.gzipBytes)} bytes)`)
}

export function* stringLeaves(tree: unknown): Generator<string> {
  if (typeof tree === 'string') yield tree
  else if (typeof tree === 'object' && tree !== null)
    for (const child of Object.values(tree)) yield* stringLeaves(child)
}
