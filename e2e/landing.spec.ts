import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { ENDONYMS, LANGUAGES, OG_LOCALES, type LanguageCode } from '../src/shared/i18n/languages.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { findOverflow } from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'

interface Strings {
  readonly [key: string]: string | Strings
}
const EN = JSON.parse(
  readFileSync(new URL('../landing/locales/en.json', import.meta.url), 'utf8'),
) as Strings
const leaves = (node: Strings): string[] =>
  Object.values(node).flatMap((v) => (typeof v === 'string' ? [v] : leaves(v)))
const section = (key: string): Strings => {
  const node = EN[key]
  if (typeof node !== 'object') throw new Error(`no section ${key}`)
  return node
}

let guard: NetworkGuard | undefined

test.beforeEach(({ page }) => {
  guard = guardNetwork(page)
})

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

test.describe('landing page', () => {
  test('has the SEO metadata', async ({ page }) => {
    await page.goto('./')
    await expect(page).toHaveTitle(/Artistica/)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /print-ready sheets/,
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://omarcocarvalho.github.io/artistica/',
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /og-image\.png$/,
    )
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })

  test('JSON-LD parses and describes a WebApplication and the visible FAQ', async ({ page }) => {
    await page.goto('./')
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    const data = blocks.map(
      (b) => JSON.parse(b) as { '@type': string; mainEntity?: { name: string }[] },
    )
    expect(data.map((d) => d['@type']).sort()).toEqual(['FAQPage', 'WebApplication'])
    const faq = data.find((d) => d['@type'] === 'FAQPage')
    const summaries = await page.locator('#faq summary').allTextContents()
    expect(faq?.mainEntity?.map((e) => e.name)).toEqual(summaries.map((s) => s.trim()))
  })

  test('serves sitemap.xml, robots.txt and the 1200x630 share image', async ({ request }) => {
    const sitemap = await request.get('sitemap.xml')
    expect(sitemap.ok()).toBe(true)
    expect(await sitemap.text()).toContain('https://omarcocarvalho.github.io/artistica/app/')
    const robots = await request.get('robots.txt')
    expect(await robots.text()).toContain(
      'Sitemap: https://omarcocarvalho.github.io/artistica/sitemap.xml',
    )
    const og = await request.get('og-image.png')
    expect(og.headers()['content-type']).toContain('image/png')
  })

  for (const path of ['./', './app/']) {
    test(`${path} serves its favicon and home-screen icon at their sizes`, async ({
      page,
      request,
    }) => {
      await page.goto(path)
      const href = async (rel: string) =>
        new URL((await page.locator(`link[rel="${rel}"]`).getAttribute('href')) ?? '', page.url())
          .href
      const icon = await href('icon')
      const touch = await href('apple-touch-icon')
      expect(icon).toMatch(/\/artistica\/favicon\.svg$/)
      expect(touch).toMatch(/\/artistica\/apple-touch-icon\.png$/)
      const svg = await request.get(icon)
      expect(svg.ok()).toBe(true)
      expect(svg.headers()['content-type']).toContain('image/svg+xml')
      expect(await svg.text()).toContain('viewBox="0 0 32 32"')
      const png = await request.get(touch)
      expect(png.ok()).toBe(true)
      const body = await png.body()
      expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([180, 180])
    })
  }

  test('serves the share image at 1200x630', async ({ request }) => {
    const body = await (await request.get('og-image.png')).body()
    expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630])
  })

  test('LND-1 the CTA opens /artistica/app/', async ({ page }) => {
    await page.goto('./')
    for (const name of ['Start a sheet', 'Open the app']) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        '/artistica/app/',
      )
    }
    await page.getByRole('link', { name: 'Open the app' }).click()
    await expect(page).toHaveURL(/\/artistica\/app\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Artistica' })).toBeAttached()
  })

  test('LND-2 serves the generated sitemap with alternates', async ({ request }) => {
    const res = await request.get('sitemap.xml')
    expect(res.ok()).toBe(true)
    const xml = await res.text()
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://omarcocarvalho.github.io/artistica/" />',
    )
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://omarcocarvalho.github.io/artistica/" />',
    )
  })

  test('the footer lists the languages, the current one marked', async ({ page }) => {
    await page.goto('./')
    const nav = page.getByRole('navigation', { name: 'Language' })
    const english = nav.getByRole('link', { name: 'English' })
    await expect(english).toHaveAttribute('aria-current', 'page')
    await expect(english).toHaveAttribute('hreflang', 'en')
    await expect(english).toHaveAttribute('lang', 'en')
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      'https://omarcocarvalho.github.io/artistica/',
    )
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US')
  })

  test('CTA opens the app', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('link', { name: 'Start a sheet' }).click()
    await expect(page).toHaveURL(/\/app\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Artistica' })).toBeAttached()
  })

  test('has no horizontal scroll at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')
    const overflow = await page
      .locator('html')
      .evaluate(
        (el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth - el.clientWidth,
      )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('theme toggle cycles and sets data-theme', async ({ page }) => {
    await page.goto('./')
    const toggle = page.getByRole('button', { name: /change theme/i })
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`is axe-clean (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('./')
      await expectNoAxeViolations(page)
    })
  }
})

test.describe('landing page without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('is fully readable (pre-rendered for crawlers)', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('print-ready sheets')
    await expect(page.getByText('Will my prints be the right size?')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start a sheet' })).toHaveAttribute(
      'href',
      '/artistica/app/',
    )
  })

  test('LND-3 the page works with JavaScript off', async ({ page }) => {
    await page.goto('./')
    const body = (await page.locator('body').textContent()) ?? ''
    const text = body.replace(/\s+/g, ' ')
    const visible = [
      ...leaves(section('hero')),
      ...leaves(section('how')),
      ...leaves(section('features')),
      ...leaves(section('privacy')),
      ...leaves(section('faq')),
    ]
    expect(visible.filter((s) => !text.includes(s))).toEqual([])
    await expect(page.getByRole('button', { name: 'Change theme: Auto' })).toHaveText('Auto')
  })
})

const SITE = 'https://omarcocarvalho.github.io/artistica/'
/** The hero's hand-written tip. */
const HERO_TIP = 'span.font-hand.text-ink-muted'
const LANDING: readonly LanguageCode[] = LANGUAGES.filter((code) =>
  existsSync(new URL(`../landing/locales/${code}.json`, import.meta.url)),
)
const STRINGS = Object.fromEntries(
  LANDING.map((code) => [
    code,
    JSON.parse(
      readFileSync(new URL(`../landing/locales/${code}.json`, import.meta.url), 'utf8'),
    ) as Strings,
  ]),
) as Record<LanguageCode, Strings>

function str(code: LanguageCode, key: string): string {
  let node: string | Strings | undefined = STRINGS[code]
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined
  if (typeof node !== 'string') throw new Error(`no landing string ${key} in ${code}`)
  return node
}
const pathOf = (code: LanguageCode) => (code === 'en' ? '/artistica/' : `/artistica/${code}/`)
const relOf = (code: LanguageCode) => (code === 'en' ? './' : `./${code}/`)
const urlOf = (code: LanguageCode) => `https://omarcocarvalho.github.io${pathOf(code)}`
const imageOf = (code: LanguageCode) => (code === 'en' ? 'og-image.png' : `og-image-${code}.png`)
const squash = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '')

/** `rgb()`/`rgba()` as [r, g, b, alpha], channels 0–255. */
function rgba(css: string): [number, number, number, number] {
  const m = /^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)$/.exec(css)
  if (!m) throw new Error(`not an rgb colour: ${css}`)
  const alpha = m.at(4)
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha === undefined ? 1 : Number(alpha)]
}

/** WCAG 2 contrast ratio of two opaque colours. */
function contrast(a: string, b: string): number {
  const luminance = (css: string) => {
    const [r, g, bl] = rgba(css).map((c) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

declare function getComputedStyle(el: object): { color: string; backgroundColor: string }

interface TipElement {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
  contains(other: TipElement): boolean
}

interface TipDocument {
  elementFromPoint(x: number, y: number): TipElement | null
}

interface Attributes {
  getAttribute(name: string): string | null
}

test('the landing page exists in all seven languages', () => {
  expect(LANDING).toEqual(LANGUAGES)
})

for (const code of LANDING) {
  test.describe(`landing page in ${code}`, () => {
    test(`LND-L1 has the SEO metadata in ${code}`, async ({ page, request }) => {
      await page.goto(relOf(code))
      await expect(page.locator('html')).toHaveAttribute('lang', code)
      await expect(page).toHaveTitle(str(code, 'meta.title'))
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        str(code, 'meta.description'),
      )
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', urlOf(code))
      const alternates = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links: Attributes[]) =>
          links.map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]),
        )
      expect(alternates).toEqual([...LANDING.map((c) => [c, urlOf(c)]), ['x-default', SITE]])
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
        'content',
        OG_LOCALES[code],
      )
      const ogAlternates = await page
        .locator('meta[property="og:locale:alternate"]')
        .evaluateAll((metas: Attributes[]) => metas.map((m) => m.getAttribute('content')))
      expect(ogAlternates).toEqual(LANDING.filter((c) => c !== code).map((c) => OG_LOCALES[c]))
      for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]'])
        await expect(page.locator(selector)).toHaveAttribute('content', `${SITE}${imageOf(code)}`)
      const image = await request.get(imageOf(code))
      expect(image.ok()).toBe(true)
      expect(image.headers()['content-type']).toContain('image/png')
      const body = await image.body()
      expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630])
    })

    test(`LND-L2 JSON-LD parses and matches the visible FAQ in ${code}`, async ({ page }) => {
      await page.goto(relOf(code))
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
      const data = blocks.map(
        (b) =>
          JSON.parse(b) as {
            '@type': string
            inLanguage?: string | string[]
            mainEntity?: { name: string; acceptedAnswer: { text: string } }[]
          },
      )
      expect(data.map((d) => d['@type']).sort()).toEqual(['FAQPage', 'WebApplication'])
      const app = data.find((d) => d['@type'] === 'WebApplication')
      const faq = data.find((d) => d['@type'] === 'FAQPage')
      expect(app?.inLanguage).toEqual(LANGUAGES)
      expect(faq?.inLanguage).toBe(code)
      const visible = await page
        .locator('#faq details')
        .evaluateAll(
          (items: { querySelector(s: string): { textContent: string | null } | null }[]) =>
            items.map((d) => [
              d.querySelector('summary')?.textContent ?? '',
              d.querySelector('p')?.textContent ?? '',
            ]),
        )
      expect(visible.length).toBeGreaterThanOrEqual(5)
      expect(faq?.mainEntity?.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(
        visible.map(([q, a]) => [squash(q), squash(a)]),
      )
    })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`LND-L3 is axe-clean in ${code} (${colorScheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.goto(relOf(code))
        await expect(page.locator('html')).toHaveAttribute('lang', code)
        await expectNoAxeViolations(page)
        const [ink, backing] = await page
          .locator(`main [aria-hidden="true"] > ${HERO_TIP}`)
          .evaluate((el: object) => {
            const style = getComputedStyle(el)
            return [style.color, style.backgroundColor] as const
          })
        expect(rgba(backing)[3], 'the tip backing is opaque').toBe(1)
        expect(contrast(ink, backing)).toBeGreaterThanOrEqual(4.5)
        const tip = page.locator(`main [aria-hidden="true"] > ${HERO_TIP}`)
        await tip.scrollIntoViewIfNeeded()
        const onTop = await tip.evaluate((el: TipElement) => {
          const doc = (globalThis as unknown as { document: TipDocument }).document
          const r = el.getBoundingClientRect()
          return [0.25, 0.5, 0.75].map((fx) => {
            const hit = doc.elementFromPoint(r.left + r.width * fx, r.top + r.height / 2)
            return hit !== null && el.contains(hit)
          })
        })
        expect(onTop, 'nothing is drawn over the tip').toEqual([true, true, true])
      })
    }

    test(`LND-L4 no horizontal scroll or overflow at phone width in ${code}`, async ({
      page,
      isMobile,
    }) => {
      if (!isMobile) await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(relOf(code))
      await expect(page.locator('html')).toHaveAttribute('lang', code)
      const scroll = await page
        .locator('html')
        .evaluate(
          (el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth - el.clientWidth,
        )
      expect(scroll).toBeLessThanOrEqual(0)
      expect(await findOverflow(page)).toEqual([])
    })

    test.describe('with an English browser', () => {
      test.use({ locale: 'en-US' })
      test(`LND-L5 "Open the app" opens the app in ${code}`, async ({ page }) => {
        await page.goto(relOf(code))
        expect(await page.evaluate('navigator.language')).toBe('en-US')
        await page.getByRole('link', { name: str(code, 'header.openApp'), exact: true }).click()
        await expect(page.locator('html')).toHaveAttribute('lang', code)
        await expect(page).toHaveURL(/\/artistica\/app\/$/)
      })
    })

    test(`LND-L6 the footer links reach every language from ${code}`, async ({ page, request }) => {
      await page.goto(relOf(code))
      const nav = page.getByRole('navigation', { name: str(code, 'footer.language'), exact: true })
      await expect(nav.getByRole('link')).toHaveCount(LANDING.length)
      for (const target of LANDING) {
        const link = nav.getByRole('link', { name: ENDONYMS[target], exact: true })
        await expect(link).toHaveAttribute('href', pathOf(target))
        await expect(link).toHaveAttribute('hreflang', target)
        await expect(link).toHaveAttribute('lang', target)
        if (target === code) await expect(link).toHaveAttribute('aria-current', 'page')
        else await expect(link).not.toHaveAttribute('aria-current')
        const res = await request.get(pathOf(target))
        expect(res.ok(), pathOf(target)).toBe(true)
        expect(await res.text()).toContain(`<html lang="${target}"`)
      }
      const next = LANDING[(LANDING.indexOf(code) + 1) % LANDING.length] ?? 'en'
      await nav.getByRole('link', { name: ENDONYMS[next], exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${pathOf(next)}$`))
      await expect(page.locator('html')).toHaveAttribute('lang', next)
    })
  })
}
