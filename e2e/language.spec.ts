import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'

test.use({ viewport: { width: 1280, height: 900 } })

let guard: NetworkGuard | undefined

function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

test.describe('number formatting (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('F-D1 a 1200 mm custom paper: the fields never group, the readout does, and 12,5 reads as 12.5 mm', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await page.getByRole('radio', { name: 'mm', exact: true }).click()
    await app.setPaper('Custom…')
    await app.setField('Height', '1200')
    await app.setField('Width', '1200')
    const width = page.getByLabel('Width', { exact: true })
    const height = page.getByLabel('Height', { exact: true })
    await expect(width).toHaveValue('1200')
    await expect(height).toHaveValue('1200')
    await expect(width).toHaveAttribute('aria-valuetext', '1,200 mm')
    await expect(width).toHaveAttribute('aria-valuenow', '1200')
    await expect(page.getByText('1,200 × 1,200 mm', { exact: true })).toBeVisible()

    await app.setField('Safe area', '12,5')
    const safeArea = page.getByLabel('Safe area', { exact: true })
    await expect(safeArea).toHaveValue('12.5')
    await expect(safeArea).toHaveAttribute('aria-valuetext', '12.5 mm')
    await expect(safeArea).toHaveAttribute('aria-valuenow', '12.5')
  })
})
