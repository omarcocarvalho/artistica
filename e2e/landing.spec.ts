import { expect, test } from '@playwright/test'
import { expectNoAxeViolations } from './support/axe.ts'

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
      './app/',
    )
  })
})
