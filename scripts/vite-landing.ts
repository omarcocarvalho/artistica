import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import {
  ENDONYMS,
  isLanguageCode,
  LANGUAGES,
  OG_LOCALES,
  type LanguageCode,
} from '../src/shared/i18n/languages.ts'

export interface LandingStrings {
  readonly [key: string]: string | LandingStrings
}

export const SITE_ORIGIN = 'https://omarcocarvalho.github.io'
export const SITE_BASE = '/artistica/'
const TEMPLATE_FILE = 'landing/page.html'
const LOCALES_DIR = 'landing/locales'
const RENDER_DIR = '.landing'

const RICH_TAGS = /&lt;(\/?)(strong|em|abbr)&gt;/g
const PLACEHOLDER = /\{\{(t:)?([\w.-]+)\}\}/g

type Context = 'text' | 'attribute' | 'json'

const pagePath = (code: LanguageCode) => (code === 'en' ? SITE_BASE : `${SITE_BASE}${code}/`)
const pageUrl = (origin: string, code: LanguageCode) => `${origin}${pagePath(code)}`

/** The landing languages: codes with a `<code>.json` among `files`, in `LANGUAGES` order. */
export function landingLanguages(files: readonly string[]): LanguageCode[] {
  const present = new Set(files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
  return LANGUAGES.filter((code) => present.has(code))
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value)
    .slice(1, -1)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function lookup(strings: LandingStrings, key: string, lang: LanguageCode): string {
  let node: string | LandingStrings | undefined = strings
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined
  }
  if (typeof node !== 'string') {
    throw new Error(`landing: no string for "${key}" in ${lang}`)
  }
  return node
}

function richText(value: string, key: string, lang: LanguageCode): string {
  const html = escapeText(value)
  const open: string[] = []
  for (const [found] of html.matchAll(RICH_TAGS)) {
    const tag = found.replace(/&lt;\/?|&gt;/g, '')
    if (!found.startsWith('&lt;/')) open.push(tag)
    else if (open.pop() !== tag)
      throw new Error(`landing: unbalanced <${tag}> in "${key}" (${lang})`)
  }
  if (open.length > 0)
    throw new Error(`landing: unclosed <${open.join('>, <')}> in "${key}" (${lang})`)
  return html.replace(RICH_TAGS, '<$1$2>')
}

function contextAt(template: string, index: number): Context | 'script' {
  const before = template.slice(0, index)
  const scriptOpen = before.lastIndexOf('<script')
  if (scriptOpen > before.lastIndexOf('</script')) {
    const tag = template.slice(scriptOpen, template.indexOf('>', scriptOpen) + 1)
    return tag.includes('type="application/ld+json"') ? 'json' : 'script'
  }
  return before.lastIndexOf('<') > before.lastIndexOf('>') ? 'attribute' : 'text'
}

function localised(
  strings: LandingStrings,
  key: string,
  context: Context,
  lang: LanguageCode,
): string {
  const value = lookup(strings, key, lang)
  if (!key.endsWith('Html')) {
    if (context === 'json') return escapeJsonString(value)
    return context === 'attribute' ? escapeAttribute(value) : escapeText(value)
  }
  const html = richText(value, key, lang)
  if (context === 'text') return html
  if (context === 'json') return escapeJsonString(value.replace(/<\/?(strong|em|abbr)>/g, ''))
  throw new Error(`landing: "${key}" holds markup and can only be used as text`)
}

function builtins(lang: LanguageCode): ReadonlyMap<string, string> {
  const appUrl = `${SITE_BASE}app/${lang === 'en' ? '' : `?lang=${lang}`}`
  return new Map([
    ['lang', lang],
    ['canonical', pageUrl(SITE_ORIGIN, lang)],
    ['homeUrl', pagePath(lang)],
    ['appUrl', appUrl],
    ['ogLocale', OG_LOCALES[lang]],
    ['ogImage', `${SITE_ORIGIN}${SITE_BASE}og-image.png`],
  ])
}

function blocks(lang: LanguageCode, all: readonly LanguageCode[]): ReadonlyMap<string, string> {
  const alternates = [
    ...all.map((c) => `<link rel="alternate" hreflang="${c}" href="${pageUrl(SITE_ORIGIN, c)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl(SITE_ORIGIN, 'en')}" />`,
  ]
  const ogAlternates = all
    .filter((c) => c !== lang)
    .map((c) => `<meta property="og:locale:alternate" content="${OG_LOCALES[c]}" />`)
  const links = all.map((c) => {
    const current = c === lang ? ' aria-current="page"' : ''
    const style = c === lang ? 'text-ink font-semibold' : 'underline underline-offset-4'
    return `<a class="inline-flex min-h-11 items-center ${style}" href="${pagePath(c)}" hreflang="${c}" lang="${c}"${current}>${escapeText(ENDONYMS[c])}</a>`
  })
  return new Map([
    ['alternates', alternates.join('\n    ')],
    ['ogLocaleAlternates', ogAlternates.join('\n    ')],
    ['languageLinks', links.join('\n        ')],
    ['inLanguageAll', JSON.stringify(LANGUAGES)],
  ])
}

/**
 * Renders the landing template for `lang`. `{{t:key}}` takes a string from `strings`, escaped
 * for where it stands (text, attribute or JSON-LD string); only keys ending `Html` may carry
 * `<strong>`, `<em>` or `<abbr>`, and only in text. `all` is the set of rendered languages.
 */
export function renderLandingPage(
  template: string,
  strings: LandingStrings,
  lang: LanguageCode,
  all: readonly LanguageCode[],
): string {
  const values = builtins(lang)
  const raw = blocks(lang, all)
  return template.replace(
    PLACEHOLDER,
    (match, t: string | undefined, key: string, index: number) => {
      const context = contextAt(template, index)
      if (context === 'script') throw new Error(`landing: ${match} inside a <script>`)
      if (t) return localised(strings, key, context, lang)
      const block = raw.get(key)
      if (block !== undefined) return block
      const value = values.get(key)
      if (value === undefined) throw new Error(`landing: unknown placeholder ${match}`)
      if (context === 'json') return escapeJsonString(value)
      return context === 'attribute' ? escapeAttribute(value) : escapeText(value)
    },
  )
}

export function sitemapXml(origin: string, langs: readonly LanguageCode[]): string {
  const alternates = [
    ...langs.map(
      (c) => `<xhtml:link rel="alternate" hreflang="${c}" href="${pageUrl(origin, c)}" />`,
    ),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(origin, 'en')}" />`,
  ]
  const pages = langs.map(
    (c) =>
      `  <url>\n    <loc>${pageUrl(origin, c)}</loc>\n${alternates.map((a) => `    ${a}\n`).join('')}  </url>\n`,
  )
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    pages.join('') +
    `  <url>\n    <loc>${origin}${SITE_BASE}app/</loc>\n  </url>\n` +
    '</urlset>\n'
  )
}

interface LandingSource {
  readonly template: string
  readonly langs: readonly LanguageCode[]
  readonly strings: (code: LanguageCode) => LandingStrings
}

function readSource(root: string): LandingSource {
  const dir = resolve(root, LOCALES_DIR)
  return {
    template: readFileSync(resolve(root, TEMPLATE_FILE), 'utf8'),
    langs: landingLanguages(readdirSync(dir)),
    strings: (code) =>
      JSON.parse(readFileSync(join(dir, `${code}.json`), 'utf8')) as LandingStrings,
  }
}

function render(source: LandingSource, code: LanguageCode): string {
  return renderLandingPage(source.template, source.strings(code), code, source.langs)
}

/** The language a dev-server path asks for, or null for any other path. */
function devLanguage(url: string): LanguageCode | null {
  const path = url.split(/[?#]/)[0] ?? ''
  const rest = path.startsWith(SITE_BASE) ? path.slice(SITE_BASE.length) : null
  if (rest === null) return null
  if (rest === '' || rest === 'index.html') return 'en'
  const match = /^([^/]+)\/(index\.html)?$/.exec(rest)
  const code = match?.[1]
  return code !== undefined && code !== 'en' && isLanguageCode(code) ? code : null
}

function serveDev(server: ViteDevServer, root: string): void {
  server.middlewares.use((req, res, next) => {
    const url = req.originalUrl ?? req.url ?? ''
    const path = url.split(/[?#]/)[0]
    const source = readSource(root)
    if (path === `${SITE_BASE}sitemap.xml`) {
      res.setHeader('Content-Type', 'application/xml')
      res.end(sitemapXml(SITE_ORIGIN, source.langs))
      return
    }
    const code = devLanguage(url)
    if (code === null || !source.langs.includes(code)) {
      next()
      return
    }
    server
      .transformIndexHtml(url, render(source, code))
      .then((html) => {
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      })
      .catch(next)
  })
}

/**
 * Renders `landing/page.html` once per language with a `landing/locales/<code>.json` into
 * `.landing/<code>/index.html`, builds each as an HTML input and emits it as `index.html` (en)
 * or `<code>/index.html`, with a generated `sitemap.xml` (M6-R19, R22).
 */
export function landingPages(): Plugin {
  let root = process.cwd()
  return {
    name: 'artistica:landing',
    config(config, { command }) {
      root = resolve(config.root ?? process.cwd())
      if (command !== 'build') return
      const source = readSource(root)
      const out = resolve(root, RENDER_DIR)
      rmSync(out, { recursive: true, force: true })
      const input: Record<string, string> = {}
      for (const code of source.langs) {
        const file = join(out, code, 'index.html')
        mkdirSync(join(out, code), { recursive: true })
        writeFileSync(file, render(source, code))
        input[code === 'en' ? 'landing' : `landing-${code}`] = file
      }
      return { build: { rolldownOptions: { input } } }
    },
    configureServer(server) {
      serveDev(server, root)
    },
    buildStart() {
      this.addWatchFile(resolve(root, TEMPLATE_FILE))
      const dir = resolve(root, LOCALES_DIR)
      if (existsSync(dir)) for (const f of readdirSync(dir)) this.addWatchFile(join(dir, f))
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const prefix = relative(root, resolve(root, RENDER_DIR)).split(sep).join('/')
        const langs: LanguageCode[] = []
        for (const [key, file] of Object.entries(bundle)) {
          const match = new RegExp(`^${prefix}/([^/]+)/index\\.html$`).exec(file.fileName)
          const code = match?.[1]
          if (file.type !== 'asset' || code === undefined || !isLanguageCode(code)) continue
          Reflect.deleteProperty(bundle, key)
          this.emitFile({
            type: 'asset',
            fileName: code === 'en' ? 'index.html' : `${code}/index.html`,
            source: file.source,
          })
          langs.push(code)
        }
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: sitemapXml(
            SITE_ORIGIN,
            LANGUAGES.filter((c) => langs.includes(c)),
          ),
        })
      },
    },
  }
}
