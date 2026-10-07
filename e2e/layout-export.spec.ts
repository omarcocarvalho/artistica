import { expect, test, type Page } from '@playwright/test'
import { AppPage, colourDistance } from './support/app.ts'
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
    for (const p of info.pages) {
      expect(p.markSegments).toHaveLength(p.strokes)
      for (const m of p.markSegments) {
        expect(Math.hypot(m.x2 - m.x1, m.y2 - m.y1)).toBeGreaterThan(0)
      }
      expect(p.markSegments.some((m) => m.x1 === m.x2 && m.y1 !== m.y2)).toBe(true)
      expect(p.markSegments.some((m) => m.y1 === m.y2 && m.x1 !== m.x2)).toBe(true)
    }
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
    await page.keyboard.press('Escape') // close the export dialog: it makes the settings inert
    await expect(page.getByRole('dialog')).toHaveCount(0)

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
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
    // The caption reads the paper from the settings store, so it changes before the layout runs.
    await armRedrawTimer(page, 'input')
    await app.setPaper('Letter')
    const ms = await layoutMs(page, 5_000)
    await expect(page.getByText(/Page 1 of \d+ · Letter/).first()).toBeVisible()
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
    // The 400 mm request is scaled down to exactly the content box width: 210 mm minus, per side,
    // the 5 mm safe area and the 5 mm crop-mark reserve (1 mm offset + 4 mm mark) = 190 mm.
    const widths = info.pages.flatMap((p) => p.imageWidthsPt)
    expect(widths).toHaveLength(1)
    expect(widths[0]).toBeCloseTo(mmToPt(190), 0)
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

interface RedrawTimer {
  start: number
  slotBusySeen: boolean
  layoutEnd: number
  sheetBusySeen: boolean
  end: number
}
interface TimerWindow {
  __redraw?: RedrawTimer
  performance: { now(): number }
  requestAnimationFrame(cb: () => void): void
  document: {
    querySelector(sel: string): unknown
    addEventListener(type: string, cb: () => void, opts: { capture: boolean; once: boolean }): void
  }
  MutationObserver: new (cb: () => void) => {
    observe(node: unknown, opts: object): void
    disconnect(): void
  }
}

/**
 * Times, in the page, from the next `event` to two moments: the frame after the layout finished
 * (`layoutEnd`: pages and original tiles drawn), and the moment the preview is idle again after one
 * of its sheets was busy with study tiles (`end`: a sheet clears aria-busy in the same task that
 * draws them).
 */
async function armRedrawTimer(page: Page, event: 'input' | 'click'): Promise<void> {
  await page.evaluate((type) => {
    const w = globalThis as unknown as TimerWindow
    const t: RedrawTimer = {
      start: 0,
      slotBusySeen: false,
      layoutEnd: 0,
      sheetBusySeen: false,
      end: 0,
    }
    w.__redraw = t
    w.document.addEventListener(
      type,
      () => {
        t.start = w.performance.now()
      },
      { capture: true, once: true },
    )
    const observer = new w.MutationObserver(() => {
      if (t.start === 0 || t.end !== 0) return
      const slotBusy = w.document.querySelector('main [aria-busy="true"]:has(figure)') !== null
      if (slotBusy) t.slotBusySeen = true
      else if (t.slotBusySeen && t.layoutEnd === 0) {
        t.layoutEnd = -1
        w.requestAnimationFrame(() => {
          t.layoutEnd = w.performance.now()
        })
      }
      if (w.document.querySelector('main figure [aria-busy="true"]') !== null)
        t.sheetBusySeen = true
      else if (t.sheetBusySeen && w.document.querySelector('main [aria-busy="true"]') === null) {
        t.end = w.performance.now()
        observer.disconnect()
      }
    })
    observer.observe(w.document.querySelector('main'), {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-busy'],
    })
  }, event)
}

async function redrawMs(
  page: Page,
  timeout: number,
): Promise<{ layoutMs: number | null; studiesMs: number }> {
  const read = () =>
    page.evaluate(() => {
      const t = (globalThis as unknown as TimerWindow).__redraw
      return t && t.end > 0
        ? { layoutMs: t.layoutEnd > 0 ? t.layoutEnd - t.start : null, studiesMs: t.end - t.start }
        : null
    })
  await expect.poll(read, { timeout }).not.toBeNull()
  const r = await read()
  if (!r) throw new Error('unreachable: polled until set')
  return {
    layoutMs: r.layoutMs === null ? null : Math.round(r.layoutMs),
    studiesMs: Math.round(r.studiesMs),
  }
}

/** Milliseconds from the armed event to the frame after the layout finished. */
async function layoutMs(page: Page, timeout: number): Promise<number> {
  const read = () =>
    page.evaluate(() => {
      const t = (globalThis as unknown as TimerWindow).__redraw
      return t && t.layoutEnd > 0 ? t.layoutEnd - t.start : null
    })
  await expect.poll(read, { timeout }).not.toBeNull()
  return Math.round((await read()) ?? NaN)
}

const INTERIOR = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
] as const

const TOGGLES = [
  ['Blurred', 81],
  ['Values', 82],
  ['Blur + Values', 83],
  ['Blurred', 81],
  ['Original', 82],
  ['Blur + Values', 83],
  ['Original', 0],
] as const

const TWENTY = [FIXTURES.quadrantsPng, ...Array<string>(19).fill(FIXTURES.quadrantsJpg)]

test.describe('study preview timing and races (chromium)', () => {
  runOnly('chromium')

  test('X13-S study changes with 20 images: selected image, apply to all, page setting (recorded; CI bounds 1000 / 8000 / 1000 ms)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const app = await loaded(page, TWENTY)
    await app.openStudiesTab()
    await app.selectButton('quadrants.png').click()
    await expect(page.getByText('Studies for quadrants.png')).toBeVisible()
    await app.setVersions(['Original', 'Blurred', 'Values'])
    await expect(app.studyTile('quadrants.png', 'Values')).toBeAttached()
    await app.expectPreviewSettled()

    await armRedrawTimer(page, 'click')
    await app.applyStudiesToAll()
    const all = await redrawMs(page, 30_000)
    await expect(app.pageFigures.getByRole('button')).toHaveCount(60)
    await expect(app.studyTile('quadrants.jpg', 'Values')).toHaveCount(19)

    await armRedrawTimer(page, 'input')
    await app.setSlider('Amount', 90)
    const blur = await redrawMs(page, 5_000)

    await page.getByRole('tab', { name: 'Page' }).click()
    await armRedrawTimer(page, 'input')
    await app.setPaper('Letter')
    const paper = await redrawMs(page, 30_000)
    await expect(page.getByText(/Page 1 of \d+ · Letter/).first()).toBeVisible()

    const timings = {
      applyAllStudiesMs: all.studiesMs,
      blurStudiesMs: blur.studiesMs,
      paperLayoutMs: paper.layoutMs,
      paperStudiesMs: paper.studiesMs,
    }
    for (const [type, ms] of Object.entries(timings))
      testInfo.annotations.push({ type, description: String(ms) })
    console.log(`study timing: ${JSON.stringify(timings)}`)
    expect(all.studiesMs).toBeLessThan(8000) // spec §3: 2 s on a desktop; CI bound 8 s
    expect(blur.studiesMs).toBeLessThan(1000) // spec §3: 200 ms on a desktop; CI bound 1000 ms
    expect(paper.layoutMs).not.toBeNull()
    expect(paper.layoutMs ?? Infinity).toBeLessThan(1000) // spec §3: 200 ms on a desktop; CI bound 1000 ms
  })

  test('X13-V version toggles while layouts are in flight end with the right tiles and pixels', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000)
    const app = await loaded(page, TWENTY)
    await app.openStudiesTab()
    await app.selectButton('quadrants.png').click()
    await expect(page.getByText('Studies for quadrants.png')).toBeVisible()
    // Clicked in the page so the pauses are exact: each pause outlasts the pipeline's 80 ms
    // debounce, so a click that finds the preview still computing lands while a layout runs.
    const inFlight = await page.evaluate(async (steps) => {
      interface El {
        textContent: string | null
        click(): void
      }
      const doc = (
        globalThis as unknown as {
          document: { querySelector(s: string): El | null; querySelectorAll(s: string): El[] }
        }
      ).document
      const chip = (name: string) => {
        const found = [...doc.querySelectorAll('fieldset button[aria-pressed]')].find(
          (b) => b.textContent?.trim() === name,
        )
        if (!found) throw new Error(`no chip ${name}`)
        return found
      }
      let n = 0
      for (const [name, pause] of steps) {
        if (doc.querySelector('main [aria-busy="true"]:has(figure)') !== null) n++
        chip(name).click()
        await new Promise((r) => setTimeout(r, pause))
      }
      return n
    }, TOGGLES)
    await expect(app.versionChip('Original')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.versionChip('Values')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.versionChip('Blurred')).toHaveAttribute('aria-pressed', 'false')
    await expect(app.versionChip('Blur + Values')).toHaveAttribute('aria-pressed', 'false')
    await app.expectPreviewSettled()
    testInfo.annotations.push({ type: 'clicks-during-layout', description: String(inFlight) })
    console.log(`clicks during a running layout: ${String(inFlight)} of ${String(TOGGLES.length)}`)
    expect(inFlight).toBeGreaterThan(0)

    await expect(app.pageFigures.getByRole('button')).toHaveCount(21)
    await expect(app.tile('quadrants.png')).toHaveCount(1)
    await expect(app.studyTile('quadrants.png', 'Values')).toHaveCount(1)
    await expect(app.studyTile('quadrants.png', 'Blurred')).toHaveCount(0)
    await expect(app.studyTile('quadrants.png', 'Blur + Values')).toHaveCount(0)
    const ramp = await app.rampColours()
    expect(ramp).toHaveLength(5)
    for (const [fx, fy] of INTERIOR) {
      expect(
        colourDistance(await app.tilePixel(app.studyTile('quadrants.png', 'Values'), fx, fy), ramp),
      ).toBeLessThanOrEqual(3)
    }
    const originalOffRamp = await Promise.all(
      INTERIOR.map(async ([fx, fy]) =>
        colourDistance(await app.tilePixel(app.tile('quadrants.png'), fx, fy), ramp),
      ),
    )
    expect(Math.max(...originalOffRamp)).toBeGreaterThan(20)
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
