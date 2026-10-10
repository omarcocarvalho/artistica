import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, OG_LOCALES, type LanguageCode } from '../src/shared/i18n/languages.ts'
import {
  landingLanguages,
  renderLandingPage,
  sitemapXml,
  type LandingStrings,
} from './vite-landing.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const TEMPLATE = read('landing/page.html')
const EN = JSON.parse(read('landing/locales/en.json')) as LandingStrings
const ORIGIN = 'https://omarcocarvalho.github.io'
const SITE = `${ORIGIN}/artistica/`
const pageUrl = (code: LanguageCode) => (code === 'en' ? SITE : `${SITE}${code}/`)

const render = (lang: LanguageCode = 'en', all: readonly LanguageCode[] = LANGUAGES) =>
  renderLandingPage(TEMPLATE, EN, lang, all)

const decode = (t: string) =>
  t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
const squash = (t: string) => t.replace(/\s+/g, ' ').trim()
const tags = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0])
const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null
function jsonLd(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]) as Record<string, unknown>,
  )
}
function metaContent(html: string, key: string): string[] {
  return tags(html, 'meta')
    .filter((t) => attr(t, 'property') === key || attr(t, 'name') === key)
    .map((t) => decode(attr(t, 'content') ?? ''))
}

describe('renderLandingPage', () => {
  it('renders every {{t:key}} and fails on a missing key', () => {
    const html = render()
    expect(html).not.toMatch(/\{\{/)
    expect(html).toContain('<title>Artistica: printable reference sheets for artists</title>')
    expect(() => renderLandingPage('<p>{{t:hero.nope}}</p>', EN, 'ja', ['en', 'ja'])).toThrow(
      /hero\.nope.*\bja\b/,
    )
    expect(() => renderLandingPage('<p>{{t:hero}}</p>', EN, 'en', ['en'])).toThrow(/hero/)
    expect(() => renderLandingPage('<p>{{nope}}</p>', EN, 'en', ['en'])).toThrow(/nope/)
  })

  it('escapes per context', () => {
    const evil = '<script>alert(1)</script>"&\'<!--'
    const strings: LandingStrings = { v: evil, vHtml: `${evil} <strong>bold</strong>` }
    const template = [
      '<p>{{t:v}}</p>',
      '<p title="{{t:v}}">x</p>',
      '<script type="application/ld+json">{"a": "{{t:v}}", "b": "{{t:vHtml}}"}</script>',
      '<p>{{t:vHtml}}</p>',
    ].join('\n')
    const html = renderLandingPage(template, strings, 'en', ['en'])
    const [text, attribute, json, rich] = html.split('\n')
    expect(text).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;"&amp;\'&lt;!--</p>')
    expect(attribute).toBe(
      '<p title="&lt;script&gt;alert(1)&lt;/script&gt;&quot;&amp;&#39;&lt;!--">x</p>',
    )
    expect(json).not.toMatch(/<\/script>.*<\/script>|<!--/)
    expect(json).toContain('\\u003c/script\\u003e')
    expect(json).toContain('\\u003c!--')
    const parsed = JSON.parse(json.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')) as {
      a: string
      b: string
    }
    expect(parsed.a).toBe(evil)
    expect(parsed.b).toBe(`${evil} bold`)
    expect(rich).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;"&amp;\'&lt;!-- <strong>bold</strong></p>',
    )
    expect(renderLandingPage('<p>{{t:v}}</p>', { v: '<strong>x</strong>' }, 'en', ['en'])).toBe(
      '<p>&lt;strong&gt;x&lt;/strong&gt;</p>',
    )
    expect(
      renderLandingPage('<p>{{t:vHtml}}</p>', { vHtml: 'a <em>b</em> <abbr>c</abbr>' }, 'en', [
        'en',
      ]),
    ).toBe('<p>a <em>b</em> <abbr>c</abbr></p>')
    expect(renderLandingPage('<p>{{t:vHtml}}</p>', { vHtml: '<b>x</b>' }, 'en', ['en'])).toBe(
      '<p>&lt;b&gt;x&lt;/b&gt;</p>',
    )
    expect(() =>
      renderLandingPage('<p>{{t:vHtml}}</p>', { vHtml: '<strong>x' }, 'en', ['en']),
    ).toThrow(/vHtml/)
    expect(() =>
      renderLandingPage('<p title="{{t:vHtml}}"></p>', { vHtml: 'x' }, 'en', ['en']),
    ).toThrow(/vHtml/)
    expect(() =>
      renderLandingPage('<script>let a = "{{t:v}}"</script>', { v: 'x' }, 'en', ['en']),
    ).toThrow(/script/)
  })

  it.each(LANGUAGES)('sets lang, canonical, seven alternates and x-default (%s)', (code) => {
    const html = render(code)
    expect(attr(tags(html, 'html')[0] ?? '', 'lang')).toBe(code)
    const canonical = tags(html, 'link').filter((t) => attr(t, 'rel') === 'canonical')
    expect(canonical.map((t) => attr(t, 'href'))).toEqual([pageUrl(code)])
    expect(metaContent(html, 'og:url')).toEqual([pageUrl(code)])
    const alternates = tags(html, 'link')
      .filter((t) => attr(t, 'rel') === 'alternate')
      .map((t) => [attr(t, 'hreflang'), attr(t, 'href')])
    expect(alternates).toEqual([...LANGUAGES.map((c) => [c, pageUrl(c)]), ['x-default', SITE]])
  })

  it('lists only the languages it is given as alternates', () => {
    const alternates = tags(render('en', ['en']), 'link')
      .filter((t) => attr(t, 'rel') === 'alternate')
      .map((t) => attr(t, 'hreflang'))
    expect(alternates).toEqual(['en', 'x-default'])
  })

  it.each(LANGUAGES)(
    "og:locale is the page's and og:locale:alternate lists the other six (%s)",
    (code) => {
      const html = render(code)
      expect(metaContent(html, 'og:locale')).toEqual([OG_LOCALES[code]])
      expect(metaContent(html, 'og:locale:alternate')).toEqual(
        LANGUAGES.filter((c) => c !== code).map((c) => OG_LOCALES[c]),
      )
    },
  )

  it('the FAQPage JSON-LD has the same questions and answers as the visible FAQ', () => {
    const html = render()
    const faq = jsonLd(html).find((j) => j['@type'] === 'FAQPage') as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[]
    }
    const visible = [
      ...html.matchAll(
        /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/details>/g,
      ),
    ].map((m) => ({
      q: decode(squash(m[1])),
      a: decode(squash(m[2].replace(/<[^>]+>/g, ''))),
    }))
    expect(visible).toHaveLength(7)
    expect(faq.mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }))).toEqual(visible)
  })

  it.each(LANGUAGES)(
    "WebApplication.inLanguage lists the seven codes; FAQPage.inLanguage is the page's (%s)",
    (code) => {
      const blocks = jsonLd(render(code))
      expect(blocks.find((j) => j['@type'] === 'WebApplication')?.inLanguage).toEqual([
        ...LANGUAGES,
      ])
      expect(blocks.find((j) => j['@type'] === 'FAQPage')?.inLanguage).toBe(code)
    },
  )

  it.each(LANGUAGES)(
    'links to the app are /artistica/app/ on the English page and /artistica/app/?lang=<code> elsewhere (%s)',
    (code) => {
      const html = render(code)
      const app = code === 'en' ? '/artistica/app/' : `/artistica/app/?lang=${code}`
      const hrefs = tags(html, 'a').map((t) => decode(attr(t, 'href') ?? ''))
      expect(hrefs.filter((h) => h.includes('app/'))).toEqual([app, app])
      const home = tags(html, 'a').find((t) => attr(t, 'aria-label') === 'Artistica home')
      expect(attr(home ?? '', 'href')).toBe(code === 'en' ? '/artistica/' : `/artistica/${code}/`)
      expect(hrefs.filter((h) => h.startsWith('.'))).toEqual([])
    },
  )

  it.each(LANGUAGES)(
    'the footer lists the seven languages as links with hreflang and lang, the current one aria-current="page" (%s)',
    (code) => {
      const html = render(code)
      const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
      const links = [...footer.matchAll(/(<a\b[^>]*\bhreflang="[^"]*"[^>]*>)([^<]*)<\/a>/g)].map(
        (m) => ({
          href: attr(m[1], 'href'),
          hreflang: attr(m[1], 'hreflang'),
          lang: attr(m[1], 'lang'),
          current: attr(m[1], 'aria-current'),
          text: m[2],
        }),
      )
      expect(links.map((l) => l.hreflang)).toEqual([...LANGUAGES])
      expect(links.map((l) => l.lang)).toEqual([...LANGUAGES])
      expect(links.map((l) => l.href)).toEqual(
        LANGUAGES.map((c) => (c === 'en' ? '/artistica/' : `/artistica/${c}/`)),
      )
      expect(links.map((l) => l.text)).toEqual([
        'English',
        'Português (Brasil)',
        '日本語',
        '한국어',
        'Italiano',
        'Español',
        '简体中文',
      ])
      expect(links.filter((l) => l.current !== null).map((l) => [l.hreflang, l.current])).toEqual([
        [code, 'page'],
      ])
    },
  )

  it('rendering is deterministic', () => {
    expect(render('ja')).toBe(render('ja'))
    expect(render('en')).toBe(render('en'))
  })

  it('each rendered page stays under 40 KB', () => {
    for (const code of LANGUAGES)
      expect(new TextEncoder().encode(render(code)).length).toBeLessThan(40_000)
  })

  it('the theme toggle labels are data attributes', () => {
    const button = tags(render(), 'button').find((t) => t.includes('data-theme-toggle')) ?? ''
    expect(
      ['auto', 'light', 'dark'].map((k) => [
        attr(button, `data-label-${k}`),
        attr(button, `data-aria-${k}`),
      ]),
    ).toEqual([
      ['Auto', 'Change theme: Auto'],
      ['Light', 'Change theme: Light'],
      ['Dark', 'Change theme: Dark'],
    ])
    expect(attr(button, 'aria-label')).toBe('Change theme: Auto')
  })

  it('landing/main.ts has no English text', () => {
    const source = read('landing/main.ts')
    const literals = [...source.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2])
    const allowed =
      /^(\.\.\/src\/shared\/styles\.css|\.\/theme|\[data-[a-z-]+\]|click|aria-label|data-(label|aria)-\$\{theme\})$/
    expect(literals.filter((l) => /\p{L}/u.test(l) && !allowed.test(l))).toEqual([])
  })
})

describe('landingLanguages', () => {
  it('is the codes with a locale file, in LANGUAGES order, English first', () => {
    expect(landingLanguages(['ja.json', 'en.json', 'xx.json', 'pt-BR.json', 'notes.txt'])).toEqual([
      'en',
      'pt-BR',
      'ja',
    ])
  })
})

describe('sitemapXml', () => {
  it('lists seven landing URLs with xhtml:link alternates and x-default, plus the app URL', () => {
    const xml = sitemapXml(ORIGIN, LANGUAGES)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1])
    expect(urls.map((u) => /<loc>([^<]*)<\/loc>/.exec(u)?.[1])).toEqual([
      ...LANGUAGES.map(pageUrl),
      `${SITE}app/`,
    ])
    for (const u of urls.slice(0, LANGUAGES.length)) {
      const links = [
        ...u.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]*)" href="([^"]*)"\s*\/>/g),
      ]
      expect(links.map((m) => [m[1], m[2]])).toEqual([
        ...LANGUAGES.map((c) => [c, pageUrl(c)]),
        ['x-default', SITE],
      ])
    }
    expect(urls.at(-1)).not.toContain('xhtml:link')
  })
  it('lists only the languages it is given', () => {
    const xml = sitemapXml(ORIGIN, ['en'])
    expect([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])).toEqual([
      SITE,
      `${SITE}app/`,
    ])
  })
})

describe.runIf(existsSync(new URL('../dist/index.html', import.meta.url)))('the build', () => {
  it('writes each landing page with its lang, and the sitemap', () => {
    const langs = landingLanguages(
      LANGUAGES.filter((c) =>
        existsSync(new URL(`../landing/locales/${c}.json`, import.meta.url)),
      ).map((c) => `${c}.json`),
    )
    for (const code of langs) {
      const html = read(code === 'en' ? 'dist/index.html' : `dist/${code}/index.html`)
      expect(attr(tags(html, 'html')[0] ?? '', 'lang')).toBe(code)
      expect(html).toMatch(/src="\/artistica\/assets\/[^"]+\.js"/)
      expect(html).not.toMatch(/\{\{/)
    }
    expect(read('dist/sitemap.xml')).toBe(sitemapXml(ORIGIN, langs))
    expect(existsSync(new URL('../dist/.landing', import.meta.url))).toBe(false)
  })
})
