import { expect, test, type Page } from '@playwright/test'
import { expectNoAxeViolations } from './support/axe.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'

let guard: NetworkGuard | undefined

test.beforeEach(({ page }) => {
  guard = guardNetwork(page)
})

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

async function box(page: Page, name: string | RegExp) {
  const b = await page.getByRole('complementary', { name }).boundingBox()
  if (!b) throw new Error(`no box for ${String(name)}`)
  return b
}

test.describe('desktop layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('shows images | preview | settings with the design widths and the empty state', async ({
    page,
  }) => {
    await page.goto('app/')
    const left = await box(page, /^Images/)
    const right = await box(page, 'Settings')
    expect(Math.round(left.width)).toBe(288)
    expect(Math.round(right.width)).toBe(352)
    expect(left.x).toBeLessThan(right.x)
    await expect(page.getByRole('heading', { name: 'Add some reference photos' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export PDF' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(page.getByLabel('Paper size')).toHaveValue('A4')
  })

  test('X-D the disabled Export shows its reason as a tooltip on hover and on keyboard focus (WCAG 1.4.13)', async ({
    page,
  }) => {
    await page.goto('app/')
    const exportButton = page.getByRole('button', { name: 'Export PDF' })
    const reason = 'Add at least one image to export.'
    const tip = page.locator('.ds-tooltip')
    await expect(exportButton).toHaveAttribute('aria-disabled', 'true')
    await expect(exportButton).toHaveAccessibleDescription(reason)

    await exportButton.hover()
    await expect(tip).toBeVisible()
    await expect(tip).toHaveText(reason)
    const box = await tip.boundingBox()
    if (!box) throw new Error('no tooltip box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })
    await expect(tip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tip).toHaveCount(0)
    await page.mouse.move(5, 400)

    await exportButton.focus()
    await expect(tip).toBeVisible()
    await expect(tip).toHaveText(reason)
    await page.keyboard.press('Escape')
    await expect(tip).toHaveCount(0)
    await expect(exportButton).toBeFocused()
    // WebKit on macOS does not Tab to buttons, so focus moves with focus().
    const home = page.getByRole('link', { name: 'Artistica home' })
    await home.focus()
    await exportButton.focus()
    await expect(tip).toBeVisible()
    await home.focus()
    await expect(tip).toHaveCount(0)
  })

  test('uses the narrower panels between 960 and 1199 px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await page.goto('app/')
    expect(Math.round((await box(page, /^Images/)).width)).toBe(248)
    expect(Math.round((await box(page, 'Settings')).width)).toBe(320)
  })

  test('the logo links to the landing page', async ({ page }) => {
    await page.goto('app/')
    const landing = new URL('/artistica/', page.url()).href
    const home = page.getByRole('link', { name: 'Artistica home' })
    expect(await home.evaluate((a: { href: string }) => a.href)).toBe(landing)
    await home.click()
    await expect(page).toHaveURL(landing)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Turn reference photos into print-ready sheets.',
      }),
    ).toBeVisible()
  })

  test('has no language picker (D4)', async ({ page }) => {
    await page.goto('app/')
    await expect(page.getByLabel(/language/i)).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: /language/i })).toHaveCount(0)
  })

  test('theme toggle cycles, sets data-theme and persists across reload', async ({ page }) => {
    await page.goto('app/')
    const html = page.locator('html')
    const toggle = page.getByRole('button', { name: /change theme/i })
    await expect(html).not.toHaveAttribute('data-theme', /.+/)
    await toggle.click()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await toggle.click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await toggle.click()
    await expect(html).not.toHaveAttribute('data-theme', /.+/)
  })

  test('page setup changes persist across reload (last-used settings)', async ({ page }) => {
    await page.goto('app/')
    await page.getByLabel('Paper size').selectOption('Letter')
    await page.getByRole('switch', { name: 'Bleed' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Bleed needs a gutter' })).toHaveCount(
      0,
    )
    await page.reload()
    await expect(page.getByLabel('Paper size')).toHaveValue('Letter')
    await expect(page.getByRole('switch', { name: 'Bleed' })).toBeChecked()
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`empty workspace is axe-clean (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('app/')
      await expect(page.getByRole('heading', { name: 'Add some reference photos' })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  }
})

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('switches to the step flow below 960 px and walks the steps', async ({ page }) => {
    await page.goto('app/')
    await expect(page.getByRole('complementary')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Steps' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Step 1 of 5: Images' })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Paper size')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('region', { name: 'Step 3 of 5: Studies' })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('button', { name: 'Create PDF' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Export PDF' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('region', { name: 'Step 4 of 5: Preview' })).toBeVisible()
  })

  test('has no horizontal scroll and 44px targets in the footer and step bar', async ({ page }) => {
    await page.goto('app/')
    const overflow = await page
      .locator('html')
      .evaluate(
        (el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth - el.clientWidth,
      )
    expect(overflow).toBeLessThanOrEqual(0)
    for (const name of ['Next', 'Images', 'Page', 'Studies', 'Preview', 'Export']) {
      const b = await page.getByRole('button', { name, exact: true }).first().boundingBox()
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })

  test('resizing across 960 px swaps the layouts without losing settings', async ({ page }) => {
    await page.goto('app/')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Paper size').selectOption('A3')
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByLabel('Paper size')).toHaveValue('A3')
    await expect(page.getByRole('navigation', { name: 'Steps' })).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`each step is axe-clean (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('app/')
      for (let i = 0; i < 5; i++) {
        await expectNoAxeViolations(page)
        if (i < 4) await page.getByRole('button', { name: 'Next' }).click()
      }
    })
  }
})
