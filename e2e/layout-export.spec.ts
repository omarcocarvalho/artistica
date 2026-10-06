import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { FIXTURES } from './support/fixtures.ts'
import { mmToPt, summarizePdf } from './support/pdf.ts'
import { runOnly } from './support/projects.ts'

test.use({ viewport: { width: 1280, height: 900 } })

const THREE = [FIXTURES.quadrantsJpg, FIXTURES.quadrantsExif6, FIXTURES.transparentPng]

let guard: NetworkGuard | undefined

/** Page object with the strict network guard installed before navigation (checked after each test). */
function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.afterEach(() => {
  // Privacy rule: no request may leave the app, whatever the test did.
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

async function loaded(page: Page, files: string[] = THREE) {
  const app = startApp(page)
  await app.goto()
  await app.upload(files)
  await app.expectImages(files.length)
  await app.expectPreviewPages(1)
  return app
}

/** The default unit follows the browser locale (en-US gives inches); the specs below state mm. */
async function useMm(page: Page) {
  await page.getByRole('radio', { name: 'mm', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'mm', exact: true })).toBeChecked()
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

test.describe('PDF export (all browsers)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('X1 A4 with crop marks: size, page count, images and vector marks', async ({ page }) => {
    test.setTimeout(120_000)
    const app = await loaded(page)
    const previewPages = await app.pageCanvases.count()
    const { bytes } = await app.exportPdf()
    const info = await summarizePdf(bytes)
    expect(info.pageCount).toBe(previewPages)
    for (const p of info.pages) {
      expect(p.widthPt).toBeCloseTo(mmToPt(210), 0)
      expect(p.heightPt).toBeCloseTo(mmToPt(297), 0)
    }
    expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(THREE.length)
    expect(sum(info.pages.map((p) => p.strokes))).toBeGreaterThan(0)
  })

  test('X2 Letter with marks and 3 mm bleed', async ({ page }) => {
    test.setTimeout(120_000)
    const app = await loaded(page)
    await app.setPaper('Letter')
    await useMm(page)
    await app.setSwitch('Crop marks', true)
    await expect(page.getByRole('switch', { name: 'Bleed' })).not.toBeChecked()
    await app.expectPreviewPages(1)
    const before = await summarizePdf((await app.exportPdf()).bytes)
    await page.keyboard.press('Escape') // close the export dialog

    await app.setField('Gutter size', '2') // below 2 x bleed, so turning bleed on must raise it
    await app.setSwitch('Bleed', true)
    await expect(page.getByText(/Gutter raised to 6/)).toBeVisible()
    await expect(page.getByLabel('Gutter size')).toHaveValue('6')
    await app.expectPreviewPages(1)
    const info = await summarizePdf((await app.exportPdf()).bytes)
    for (const p of info.pages) {
      expect(p.widthPt).toBeCloseTo(612, 0)
      expect(p.heightPt).toBeCloseTo(792, 0)
    }
    expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(THREE.length)
    expect(sum(info.pages.map((p) => p.strokes))).toBeGreaterThan(0)
    // Bleed changes the output: the marks move away from the cut lines and/or the images grow.
    const shape = (i: typeof info) =>
      JSON.stringify(i.pages.map((p) => [p.imageWidthsPt, p.markGeometry]))
    expect(shape(info)).not.toBe(shape(before))
  })
})

test.describe('page setup and export (chromium)', () => {
  runOnly('chromium')

  test('X3 marks off leaves no vector marks', async ({ page }) => {
    test.setTimeout(120_000)
    const app = await loaded(page)
    await app.setSwitch('Crop marks', false)
    await app.expectPreviewPages(1)
    const info = await summarizePdf((await app.exportPdf()).bytes)
    expect(sum(info.pages.map((p) => p.strokes))).toBe(0)
  })

  test('X4 landscape and custom paper change the MediaBox', async ({ page }) => {
    test.setTimeout(150_000)
    const app = await loaded(page)
    await useMm(page)
    await page.getByRole('radio', { name: 'Landscape' }).click()
    await app.expectPreviewPages(1)
    let info = await summarizePdf((await app.exportPdf()).bytes)
    expect(info.pages[0]?.widthPt).toBeCloseTo(mmToPt(297), 0)
    expect(info.pages[0]?.heightPt).toBeCloseTo(mmToPt(210), 0)
    await page.keyboard.press('Escape') // close the export dialog: it makes the settings inert
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('radio', { name: 'Auto' }).click()
    await app.setPaper('Custom…')
    await app.setField('Width', '200')
    await app.setField('Height', '250')
    await app.expectPreviewPages(1)
    info = await summarizePdf((await app.exportPdf()).bytes)
    expect(info.pages[0]?.widthPt).toBeCloseTo(mmToPt(200), 0)
    expect(info.pages[0]?.heightPt).toBeCloseTo(mmToPt(250), 0)
  })

  test('X5 a small page needs several pages, and the PDF matches the preview', async ({ page }) => {
    test.setTimeout(150_000)
    const six = Array<string>(6).fill(FIXTURES.quadrantsJpg)
    const app = await loaded(page, six)
    await app.setPaper('A6')
    await expect.poll(async () => app.pageCanvases.count()).toBeGreaterThanOrEqual(2)
    const previewPages = await app.pageCanvases.count()
    const info = await summarizePdf((await app.exportPdf()).bytes)
    expect(info.pageCount).toBe(previewPages)
    expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(6)
  })

  test('X6 names the file artistica-<PAPER>-<date>.pdf (D10)', async ({ page }) => {
    test.setTimeout(120_000)
    const app = await loaded(page)
    const { fileName } = await app.exportPdf()
    expect(fileName).toMatch(/^artistica-A4-\d{4}-\d{2}-\d{2}\.pdf$/)
  })

  test('X7 switching units back and forth does not change what is stored or exported', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = await loaded(page)
    const safe = page.getByLabel('Safe area', { exact: true })
    await useMm(page)
    await expect(safe).toHaveValue('5')
    for (let i = 0; i < 3; i++) {
      await page.getByRole('radio', { name: 'inches' }).click()
      await expect(safe).toHaveValue('0.2')
      await page.getByRole('radio', { name: 'mm' }).click()
    }
    await expect(safe).toHaveValue('5')
    await app.expectPreviewPages(1)
    const info = await summarizePdf((await app.exportPdf()).bytes)
    expect(info.pages[0]?.widthPt).toBeCloseTo(mmToPt(210), 0)
    expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(THREE.length)
  })

  test('X10 the fits-per-page suggestion shows even with no images, and follows the paper', async ({
    page,
  }) => {
    const empty = startApp(page)
    await empty.goto()
    const tip = page.getByText(/fits \d+ references? per page comfortably/)
    await expect(tip).toContainText('A4 fits')
    await empty.upload(FIXTURES.quadrantsJpg)
    await empty.expectPreviewPages(1)
    await expect(tip).toContainText('A4 fits')
    await empty.setPaper('A6')
    await expect(tip).toContainText('A6 fits')
  })

  test('X13 preview update after a setting change with 20 images (recorded; CI bound 1000 ms)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000)
    const app = startApp(page)
    await app.goto()
    await app.upload(Array<string>(20).fill(FIXTURES.quadrantsJpg))
    await app.expectImages(20)
    await app.expectPreviewPages(1)
    await expect(page.getByText(/Page 1 of \d+ · A4/).first()).toBeVisible()
    const start = Date.now()
    await app.setPaper('Letter')
    await expect(page.getByText(/Page 1 of \d+ · Letter/).first()).toBeVisible({ timeout: 5_000 })
    const ms = Date.now() - start
    testInfo.annotations.push({ type: 'preview-update-ms', description: String(ms) })
    expect(ms).toBeLessThan(1000)
  })

  test('X14 a fixed 400 mm width on A4 is scaled to fit, flagged, and exported inside the content box', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = await loaded(page, [FIXTURES.quadrantsJpg])
    await useMm(page)
    await app.editButton('quadrants.jpg').click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio', { name: 'Fixed' }).click()
    await sheet.getByRole('radio', { name: 'Width' }).click()
    const width = sheet.getByRole('spinbutton', { name: 'Width' })
    await width.fill('400')
    await width.blur()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Scaled to fit').first()).toBeVisible()
    const info = await summarizePdf((await app.exportPdf()).bytes)
    expect(info.pages[0]?.widthPt).toBeCloseTo(mmToPt(210), 0)
    expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(1)
    // The 400 mm request is scaled down to at most the content box (page minus the 5 mm safe area).
    const widths = info.pages.flatMap((p) => p.imageWidthsPt)
    expect(widths).toHaveLength(1)
    expect(widths[0]).toBeLessThanOrEqual(mmToPt(150))
    expect(widths[0]).toBeGreaterThan(mmToPt(50)) // and it was not collapsed
  })

  test('X11 export can be cancelled and run again', async ({ page }) => {
    test.setTimeout(150_000)
    // Many small pages keep the export running long enough to cancel it mid-way.
    const app = await loaded(page, Array<string>(24).fill(FIXTURES.quadrantsJpg))
    await app.setPaper('A6')
    await app.expectPreviewPages(4)
    await app.exportButton.click()
    const dialog = page.getByRole('dialog')
    // Slow the CPU so the export cannot finish before Cancel lands (chromium only).
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
    await dialog.getByRole('button', { name: /create pdf/i }).click()
    // The Cancel button re-renders with each progress tick, so click without waiting for stability.
    await dialog.getByRole('button', { name: /cancel/i }).dispatchEvent('click')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    // Cancel returns the dialog to idle, with no error and no PDF.
    await expect(dialog.getByRole('link', { name: /download pdf/i })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: /create pdf/i })).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    const info = await summarizePdf((await app.exportPdf()).bytes)
    expect(info.pageCount).toBeGreaterThanOrEqual(4)
  })
})

test.describe('crop by keyboard and selection sync (chromium, firefox)', () => {
  runOnly('chromium', 'firefox')

  test('X8 arrows move the crop, Shift+arrows resize it, Reset crop restores it', async ({
    page,
  }) => {
    const app = await loaded(page, [FIXTURES.quadrantsJpg])
    await app.editButton('quadrants.jpg').click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio', { name: '1:1' }).click()
    const box = sheet.getByTestId('crop-area')
    const readout = async () => (await sheet.getByTestId('crop-readout').textContent()) ?? ''
    const parse = async () => {
      const m = /^Crop (\d+) × (\d+) px at (\d+), (\d+)$/.exec(await readout())
      if (!m) throw new Error(`unexpected crop readout: ${await readout()}`)
      return { w: Number(m[1]), h: Number(m[2]), x: Number(m[3]), y: Number(m[4]) }
    }
    await box.focus()
    const initial = await parse()
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    const moved = await parse()
    expect(moved.x).toBeGreaterThan(initial.x)
    expect(moved.w).toBe(initial.w)
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
    const resized = await parse()
    expect(resized.w).toBeLessThan(moved.w)
    await sheet.getByRole('button', { name: 'Reset crop' }).click()
    expect(await readout()).toMatch(/^Crop 64 × 48 px at 0, 0$/)
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await app.expectPreviewPages(1)
  })

  test('X9 clicking a tile selects its row (D6); selecting a row marks its tile; Edit selected opens the sheet', async ({
    page,
  }) => {
    const app = await loaded(page, [FIXTURES.quadrantsJpg, FIXTURES.transparentPng])
    await app.tile('transparent.png').click()
    await expect(app.imageRows.filter({ hasText: 'transparent.png' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await app.selectButton('quadrants.jpg').click()
    await expect(app.tile('quadrants.jpg')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.tile('transparent.png')).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Edit selected image' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('quadrants.jpg')
  })
})

test.describe('preview screenshot (Linux CI only)', () => {
  runOnly('chromium')
  test.skip(process.platform !== 'linux', 'baselines are generated on Linux only')

  test('X12 page 1 of A4 with three images', async ({ page }) => {
    const app = await loaded(page)
    await expect(app.pageCanvases.first()).toHaveScreenshot('a4-three-images.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})
