import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { AppPage, colourDistance } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { summarizePdf } from './support/pdf.ts'
import { inspectPdf } from '../src/features/render/pdf/inspect.ts'
import { runOnly } from './support/projects.ts'
import { sampleBrowserMemory } from './support/memory.ts'
import { syntheticJpegs } from './support/synthetic.ts'
import { expectTouchTargets, settled } from './support/targets.ts'

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
const pdfDraws = async (bytes: Uint8Array) =>
  (await inspectPdf(bytes)).pages.flatMap((p) => p.draws)

test('M1 phone flow: Images, edit sheet, Page, Preview, Export, parse the PDF', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = startApp(page)
  await app.goto()

  await expect(page.getByRole('region', { name: 'Step 1 of 5: Images' })).toBeVisible()
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
  await expect(page.getByRole('region', { name: 'Step 2 of 5: Page' })).toBeVisible()
  await app.setPaper('Letter')
  await expect(page.getByText(/Letter fits \d+ references? per page/)).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('region', { name: 'Step 3 of 5: Studies' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('region', { name: 'Step 4 of 5: Preview' })).toBeVisible()
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

/** Interior points of a tile; a drawn value study puts most of them exactly on a ramp colour. */
const SAMPLES = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.5, 0.5],
  [0.3, 0.7],
  [0.7, 0.7],
] as const
/** Total RSS of the browser's process tree, in MB. */
const AFTER_IMPORT_BUDGET_MB = 1500
const EXPORT_PEAK_BUDGET_MB = 1700

test('M3 @slow 22 x 24 MP photos x 3 study versions import, preview and export on a phone within a memory budget', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'chromium only: the photos are encoded by the page canvas and RSS comes from Chromium’s process list',
  )
  test.setTimeout(600_000)
  const crashed: string[] = []
  page.on('crash', () => crashed.push('page crashed'))
  const app = startApp(page)
  await app.goto()
  const photos = await syntheticJpegs(page, 22, 5712, 4284, { noisy: true })
  const memory = sampleBrowserMemory(browser)
  let pdf: Buffer
  let previewPages: number
  let previewTiles: number
  let ramp: number[][]
  const valuesOnRamp: number[] = []
  let settledBreakdown: Record<string, number>
  try {
    await page.waitForTimeout(1000)
    memory.phase('import')
    await app.upload(photos)
    await app.expectImages(22, 300_000)
    await page.getByRole('button', { name: 'Next' }).click()
    await app.setPaper('A5')
    await page.getByRole('button', { name: 'Next' }).click()
    memory.phase('studies')
    await app.pickStudiesImage('synthetic-01.jpg')
    await app.setVersions(['Original', 'Blurred', 'Values'])
    await app.applyStudiesToAll()
    ramp = await app.rampColours()
    await expect(
      page.getByRole('status').filter({ hasText: 'Study settings copied to 21 images.' }),
    ).toBeAttached()
    await page.getByRole('button', { name: 'Next' }).click()
    await app.expectPreviewPages(3)
    await expect(app.studyTile('synthetic-22.jpg', 'Values')).toBeAttached({ timeout: 60_000 })
    await app.expectPreviewSettled(300_000)
    previewTiles = await app.pageFigures.getByRole('button').count()
    for (const tile of await app.pageFigures.getByRole('button', { name: /, Values$/ }).all()) {
      const off = await Promise.all(
        SAMPLES.map(async ([fx, fy]) => colourDistance(await app.tilePixel(tile, fx, fy), ramp)),
      )
      valuesOnRamp.push(off.filter((d) => d <= 3).length)
    }
    previewPages = await app.pageCanvases.count()
    await page.waitForTimeout(2000)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.detach()
    await page.waitForTimeout(1000)
    memory.phase('settled after studies')
    await page.waitForTimeout(2000)
    settledBreakdown = await memory.breakdown()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('22 images are ready to print.')).toBeVisible()
    memory.phase('export')
    pdf = (await app.exportPdf('step')).bytes
  } finally {
    await memory.stop()
  }
  const peaks = memory.peaks()
  const report = JSON.stringify({
    previewPages,
    previewTiles,
    valuesOnRamp,
    ramp,
    peaksMb: peaks,
    settledBreakdown,
  })
  console.log(`memory: ${report}`)
  testInfo.annotations.push({ type: 'memory', description: report })

  const info = await summarizePdf(pdf)
  expect(info.pageCount).toBe(previewPages)
  expect(previewTiles).toBe(66)
  expect(ramp).toHaveLength(5)
  expect(valuesOnRamp).toHaveLength(22)
  expect(Math.min(...valuesOnRamp)).toBeGreaterThanOrEqual(2)
  expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(66)
  expect((await pdfDraws(pdf)).filter((d) => d.filter === 'FlateDecode')).toHaveLength(22)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(crashed).toEqual([])
  expect(peaks.studies).toBeLessThan(AFTER_IMPORT_BUDGET_MB)
  expect(peaks['settled after studies']).toBeLessThan(AFTER_IMPORT_BUDGET_MB)
  expect(peaks.export).toBeLessThan(EXPORT_PEAK_BUDGET_MB)
})

test('M2 touch targets in the step bar and footer are at least 44px tall', async ({ page }) => {
  const app = startApp(page)
  await app.goto()
  const targets = [
    page.getByRole('button', { name: 'Back', exact: true }),
    page.getByRole('button', { name: 'Next', exact: true }),
    ...(['Images', 'Page', 'Studies', 'Preview', 'Export'] as const).map((name) =>
      app.stepTab(name),
    ),
  ]
  for (const target of targets) {
    await expect(target).toBeVisible()
    const b = await target.boundingBox()
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})

test('H1 phone: every Page-step form control is at least 44 x 44 px', async ({ page }) => {
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg])
  await app.expectImages(1)
  await app.goToStep('Page')
  await app.setPaper('Custom…')
  await app.setSwitch('Gutter between images', true)
  await app.setSwitch('Bleed', true)
  const step = page.getByRole('region', { name: 'Step 2 of 5: Page' })
  const radios = [
    ...(await step.getByRole('radiogroup', { name: 'Units' }).getByRole('radio').all()),
    ...(await step.getByRole('radiogroup', { name: 'Orientation' }).getByRole('radio').all()),
  ]
  expect(radios).toHaveLength(2 + 3)
  const fields = ['Width', 'Height', 'Safe area', 'Gutter size', 'Bleed amount'].map((name) =>
    step.getByRole('spinbutton', { name, exact: true }),
  )
  await expectTouchTargets([
    step.getByRole('combobox', { name: 'Paper size' }),
    ...radios,
    ...fields,
  ])
  const switches = await step.getByRole('switch').all()
  expect(switches).toHaveLength(3)
  await expectTouchTargets(switches)
})

test('H1 phone: every edit-sheet control is at least 44 x 44 px', async ({ page }) => {
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg])
  await app.expectImages(1)
  await app.editButton('quadrants.jpg').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await settled(sheet)
  await sheet.getByRole('radio', { name: 'Fixed' }).click()
  const radios = await sheet.getByRole('radio').all()
  expect(radios).toHaveLength(6 + 2 + 2)
  const buttons = await sheet.getByRole('button').all()
  expect(buttons.length).toBeGreaterThanOrEqual(9)
  await expectTouchTargets([
    ...radios,
    ...buttons,
    sheet.getByRole('spinbutton', { name: 'Copies' }),
    sheet.getByRole('spinbutton', { name: 'Width' }),
  ])
})

test('S-P1 phone: Studies step, a 3-version group in the preview, export parses back', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = startApp(page)
  await app.goto()
  const [gradient] = await syntheticJpegs(page, 1, 1200, 800)
  await app.upload([
    { ...gradient, name: 'gradient.jpg' },
    { name: 'quadrants.jpg', mimeType: 'image/jpeg', buffer: readFileSync(FIXTURES.quadrantsJpg) },
  ])
  await app.expectImages(2)
  await app.goToStep('Studies')
  await expect(page.getByRole('region', { name: 'Step 3 of 5: Studies' })).toBeVisible()
  await app.pickStudiesImage('quadrants.jpg')
  await expect(page.getByText('Studies for quadrants.jpg')).toBeVisible()
  await app.pickStudiesImage('gradient.jpg')
  await expect(page.getByText('Studies for gradient.jpg')).toBeVisible()
  await app.setVersions(['Original', 'Blurred', 'Values'])
  await app.setSlider('Number of values', 5)
  await app.swatch('Sepia').click()
  const ramp = await app.rampColours()
  expect(ramp).toHaveLength(5)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('region', { name: 'Step 4 of 5: Preview' })).toBeVisible()
  await expect(app.studyTile('gradient.jpg', 'Blurred')).toBeAttached()
  await expect(app.studyTile('gradient.jpg', 'Values')).toBeAttached()
  await expect(app.studyTile('quadrants.jpg', 'Values')).toHaveCount(0)
  await app.expectPreviewSettled(60_000)
  for (const [fx, fy] of [
    [0.1, 0.5],
    [0.5, 0.5],
    [0.9, 0.5],
  ] as const) {
    expect(
      colourDistance(await app.tilePixel(app.studyTile('gradient.jpg', 'Values'), fx, fy), ramp),
    ).toBeLessThanOrEqual(3)
  }
  const previewPages = await app.pageCanvases.count()
  await page.getByRole('button', { name: 'Next' }).click()
  const { bytes } = await app.exportPdf('step')
  expect((await summarizePdf(bytes)).pageCount).toBe(previewPages)
  const draws = await pdfDraws(bytes)
  expect(draws).toHaveLength(4)
  expect(draws.filter((d) => d.filter === 'DCTDecode')).toHaveLength(3)
  expect(draws.filter((d) => d.filter === 'FlateDecode').map((d) => d.colours)).toEqual([5])
})

test('S-P2 phone: every Studies-step control is at least 44 px tall', async ({ page }) => {
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsPng])
  await app.expectImages(2)
  await app.goToStep('Studies')
  const radios = await app.studiesPicker.getByRole('radio').all()
  expect(radios).toHaveLength(2)
  const targets = [
    ...radios.map((r) => r.locator('xpath=ancestor::label')),
    ...(await page.getByRole('group', { name: 'Print these versions' }).getByRole('button').all()),
    ...(await page.getByRole('group', { name: 'Hue' }).getByRole('button').all()),
    ...(await page.getByRole('slider').all()),
    page.getByRole('button', { name: 'Apply to all images' }),
  ]
  expect(targets).toHaveLength(2 + 4 + 8 + 3 + 1)
  for (const t of targets) {
    await t.scrollIntoViewIfNeeded()
    const b = await t.boundingBox()
    expect(
      b?.height ?? 0,
      await t.evaluate((el: { outerHTML: string }) => el.outerHTML.slice(0, 80)),
    ).toBeGreaterThanOrEqual(44)
    expect(b?.width ?? 0).toBeGreaterThanOrEqual(44)
  }
})
