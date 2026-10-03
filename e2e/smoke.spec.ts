import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const PAGES = [
  { name: 'landing', path: './' },
  { name: 'app', path: 'app/' },
] as const

for (const { name, path } of PAGES) {
  test.describe(`${name} page`, () => {
    test('loads without failed requests and shows the heading', async ({ page }) => {
      const failures: string[] = []
      page.on('response', (response) => {
        if (response.status() >= 400)
          failures.push(`${String(response.status())} ${response.url()}`)
      })
      page.on('requestfailed', (request) => failures.push(`failed ${request.url()}`))

      await page.goto(path)
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { level: 1, name: 'Artistica' })).toBeVisible()
      expect(failures).toEqual([])
    })

    test('applies Tailwind styles', async ({ page }) => {
      await page.goto(path)
      // text-4xl = 2.25rem = 36px; without Tailwind it would be 32px (UA) or 16px (preflight only).
      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '36px')
    })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()
        expect(results.violations).toEqual([])
      })
    }
  })
}
