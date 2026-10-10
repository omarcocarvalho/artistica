import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { expectNoAxeViolations } from './support/axe.ts'
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
