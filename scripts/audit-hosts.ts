import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

/**
 * Links a shipped file may name: each is `host[:port]/path` and allows itself and anything below it.
 * None is requested by the app. Adding one needs a reason it is never fetched.
 */
export const ALLOWED_LINKS: readonly string[] = [
  // This site, and its repository (landing page link, canonical URL, sitemap).
  'omarcocarvalho.github.io/artistica/',
  'github.com/omarcocarvalho/artistica',
  // XML namespaces, JSON-LD and JSON Schema identifiers: names, never fetched.
  'www.w3.org/2000/svg',
  'www.w3.org/1999/xlink',
  'www.w3.org/1998/Math/MathML',
  'www.w3.org/XML/1998/namespace',
  'www.sitemaps.org/schemas/sitemap/0.9',
  'schema.org',
  'json-schema.org/',
  // Library error and licence text.
  'react.dev/errors/',
  'react.i18next.com/latest/usetranslation-hook',
  'github.com/Hopding/pdf-lib',
  'tailwindcss.com',
  // Reserved example domain (RFC 2606): the URL field's placeholder.
  'example.com/',
  // Comments and error strings in the MediaPipe runtime (vision_wasm_module_internal.{js,wasm}).
  'en.wikipedia.org/wiki/UTF-8',
  'kripken.github.io/emscripten-site/',
  'pubs.opengroup.org/onlinepubs/',
  'server.com:4324',
  'unicode.org/faq/',
  'www.w3.org/TR/',
  'bugzil.la/1328882',
  'developer.mozilla.org/en-US/docs/',
  'github.com/github/fetch/pull/92',
  'github.com/google/closure-compiler/',
  'github.com/emscripten-core/emscripten/',
  'github.com/libsdl-org/SDL/pull/6304',
  'github.com/nodejs/help/issues/2136',
  'github.com/opencv/opencv/issues/16739',
  'tools.ietf.org/html/rfc3629',
  'webkit.org/b/222758',
  'www.ietf.org/rfc/rfc2279.txt',
  'www.khronos.org/registry/webgl/specs/',
  'www.tensorflow.org/lite/guide/',
  'go/lsc_proto3_utf8',
  'goto/weakfields',
]

/** Domains that fail the audit wherever a host under them appears, with or without a scheme (usage metrics and analytics). */
export const FORBIDDEN_DOMAINS: readonly string[] = [
  'googleapis.com',
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
]

/** Names under a forbidden domain that are identifiers, never hosts that are requested. */
const ALLOWED_NAMES: ReadonlySet<string> = new Set([
  // Protobuf `Any` type URLs in the MediaPipe bundle ("type.googleapis.com/mediapipe.tasks…").
  'type.googleapis.com',
])

/** Documents shipped beside the models; the app never loads them. */
const UNSCANNED = new Set(['.md', '.txt'])

const URL_PATTERN = /\b(?:https?|wss?):\/\/([A-Za-z0-9][A-Za-z0-9.-]*(?::\d+)?)([^\s"'`<>()\\\0]*)/g

export function remoteLinks(text: string): string[] {
  return [...text.matchAll(URL_PATTERN)].map((m) => `${m[1].toLowerCase()}${m[2]}`)
}

function isAllowed(link: string, allowed: readonly string[]): boolean {
  return allowed.some((prefix) => {
    if (!link.startsWith(prefix)) return false
    if (link.length === prefix.length || prefix.endsWith('/')) return true
    return '/?#:'.includes(link.charAt(prefix.length))
  })
}

function forbiddenNames(text: string): string[] {
  const lower = text.toLowerCase()
  return FORBIDDEN_DOMAINS.flatMap((domain) => {
    const pattern = new RegExp(`(?:[a-z0-9-]+\\.)*${domain.replaceAll('.', '\\.')}`, 'g')
    return [...lower.matchAll(pattern)].map((m) => m[0]).filter((name) => !ALLOWED_NAMES.has(name))
  })
}

/** The links in `text` that are not allowed, then every forbidden name outside a link. */
export function auditText(text: string, allowed: readonly string[] = ALLOWED_LINKS): string[] {
  const bad = remoteLinks(text).filter((link) => !isAllowed(link, allowed))
  const forbidden = forbiddenNames(text.replace(URL_PATTERN, ' '))
  return [...new Set([...bad, ...forbidden])]
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)).split(sep).join('/'))
    .sort()
}

export interface AuditResult {
  readonly scanned: number
  readonly violations: readonly { readonly file: string; readonly link: string }[]
}

export function auditDir(dir: string): AuditResult {
  const files = filesUnder(dir).filter((f) => !UNSCANNED.has(extname(f)))
  const violations = files.flatMap((file) =>
    auditText(readFileSync(join(dir, file)).toString('latin1')).map((link) => ({ file, link })),
  )
  return { scanned: files.length, violations }
}

if (import.meta.main) {
  const dir = process.argv[2] ?? 'dist'
  const { scanned, violations } = auditDir(dir)
  const lines = [
    `Host audit: ${String(scanned)} files in ${dir}, ${String(violations.length)} links to other hosts`,
    ...violations.map((v) => `  ${v.file}: ${v.link}`),
  ]
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Host audit\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`,
    )
  }
  if (scanned === 0 || violations.length > 0) {
    console.error(
      scanned === 0
        ? `No files to audit in ${dir}; is the build output missing?`
        : 'A shipped file names another host. Remove it, or add it to ALLOWED_LINKS with the reason it is never requested.',
    )
    process.exit(1)
  }
}
