import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { summarizePdf } from './support/pdf.ts'
import { runOnly } from './support/projects.ts'
import { syntheticJpegs } from './support/synthetic.ts'

runOnly('mobile-chromium', 'mobile-webkit')

let guard: NetworkGuard | undefined

/** Page object with the strict network guard installed before navigation (checked after each test). */
function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

test('M1 phone flow: Images, edit sheet, Page, Preview, Export, parse the PDF', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = startApp(page)
  await app.goto()

  await expect(page.getByRole('region', { name: 'Step 1 of 4: Images' })).toBeVisible()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsExif6])
  await app.expectImages(2)
  await app.editButton('quadrants.jpg').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const sheetBox = await sheet.boundingBox()
  const viewportHeight = page.viewportSize()?.height ?? 0
  expect((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0)).toBeGreaterThan(viewportHeight - 40) // anchored to the bottom
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('region', { name: 'Step 2 of 4: Page' })).toBeVisible()
  await app.setPaper('Letter')
  await expect(page.getByText(/Letter fits \d+ references? per page/)).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('region', { name: 'Step 3 of 4: Preview' })).toBeVisible()
  expect(await app.expectPreviewPages(1)).toBe(1)
  const overflow = await page
    .locator('html')
    .evaluate((el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // Owner Q10: the phone Export step opens the same dialog as desktop.
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('2 images are ready to print.')).toBeVisible()
  const { bytes, fileName } = await app.exportPdf('step')
  expect(fileName).toMatch(/^artistica-Letter-/)
  const info = await summarizePdf(bytes)
  expect(info.pageCount).toBe(1)
  expect(info.pages[0]?.widthPt).toBeCloseTo(612, 0)
  expect(info.pages[0]?.heightPt).toBeCloseTo(792, 0)
  expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(2)
})

test('M3 @slow 20 x 12 MP photos import and export on a phone without running out of memory', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'chromium only: synthetic 12 MP JPEGs are encoded by the page canvas',
  )
  test.setTimeout(600_000)
  const crashed: string[] = []
  page.on('crash', () => crashed.push('page crashed'))
  const app = startApp(page)
  await app.goto()
  const photos = await syntheticJpegs(page, 20, 4000, 3000)
  await app.upload(photos)
  await app.expectImages(20, 300_000)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const previewPages = await app.expectPreviewPages(1)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('20 images are ready to print.')).toBeVisible()
  const { bytes } = await app.exportPdf('step')
  const info = await summarizePdf(bytes)
  expect(info.pageCount).toBe(previewPages)
  expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(20)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(crashed).toEqual([])
})

test('M2 touch targets in the step bar and footer are at least 44px tall', async ({ page }) => {
  const app = startApp(page)
  await app.goto()
  const targets = [
    page.getByRole('button', { name: 'Back', exact: true }),
    page.getByRole('button', { name: 'Next', exact: true }),
    ...(['Images', 'Page', 'Preview', 'Export'] as const).map((name) => app.stepTab(name)),
  ]
  for (const target of targets) {
    await expect(target).toBeVisible()
    const b = await target.boundingBox()
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})
