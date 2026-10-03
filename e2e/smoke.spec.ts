import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const PAGES = [
  { name: 'landing', path: './', h1: /\S/ },
  { name: 'app', path: 'app/', h1: 'Artistica' },
] as const

for (const { name, path, h1 } of PAGES) {
  test.describe(`${name} page`, () => {
    test('loads without failed requests and shows a level-1 heading', async ({ page }) => {
      const failures: string[] = []
      page.on('response', (response) => {
        if (response.status() >= 400)
          failures.push(`${String(response.status())} ${response.url()}`)
      })
      page.on('requestfailed', (request) => failures.push(`failed ${request.url()}`))

      await page.goto(path)
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeAttached()
      expect(failures).toEqual([])
    })

    test('applies the design-system styles and fonts', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('body')).toHaveCSS('font-family', /Atkinson/)
    })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeAttached()

        const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()
        expect(results.violations).toEqual([])
      })
    }
  })
}
