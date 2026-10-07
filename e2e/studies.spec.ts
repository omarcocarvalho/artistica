import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { mmToPt, summarizePdf, type PdfDraw, type PdfSummary } from './support/pdf.ts'
import { runOnly } from './support/projects.ts'

declare const document: { activeElement: unknown }

test.use({ viewport: { width: 1280, height: 900 } })

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

/** Loads the photos with the unit in mm (the default follows the browser locale), then opens Studies. */
async function withPhotos(page: Page, files: string[] = [FIXTURES.valueRamp]): Promise<AppPage> {
  const app = startApp(page)
  await app.goto()
  await page.getByRole('radio', { name: 'mm', exact: true }).click()
  await app.upload(files)
  await app.expectImages(files.length)
  await app.expectPreviewPages(1)
  await app.openStudiesTab()
  return app
}

const RAMP = 'value-ramp.png'
const GUTTER_PT = mmToPt(6)
const MAX_COUNTED_PX = 4_000_000

/**
 * The draws are the tiles of one study group, in reading order: equal tiles one gutter apart,
 * top to bottom in a column (PDF y decreases) or left to right in a row.
 */
function expectOneGroup(draws: readonly PdfDraw[]): void {
  expect(draws.length).toBeGreaterThanOrEqual(2)
  const [a, b] = draws as [PdfDraw, PdfDraw, ...PdfDraw[]]
  const column = Math.abs(a.xPt - b.xPt) < 0.5
  const pos = (d: PdfDraw) => (column ? -d.yPt : d.xPt)
  const across = (d: PdfDraw) => (column ? d.xPt : d.yPt)
  const step = (column ? a.hPt : a.wPt) + GUTTER_PT
  draws.forEach((d, i) => {
    expect(d.wPt).toBeCloseTo(a.wPt, 1)
    expect(d.hPt).toBeCloseTo(a.hPt, 1)
    expect(across(d)).toBeCloseTo(across(a), 1)
    expect(pos(d) - pos(a)).toBeCloseTo(i * step, 1)
  })
}

const allDraws = (info: PdfSummary): PdfDraw[] => info.pages.flatMap((p) => p.draws)

/** Tile box as fractions of the sheet, top-left origin, from the preview's tile button. */
async function previewBox(app: AppPage, tile: Locator) {
  const sheet = await app.pageCanvases.first().boundingBox()
  const box = await tile.boundingBox()
  if (!sheet || !box) throw new Error('preview tile is not rendered')
  return {
    x: (box.x - sheet.x) / sheet.width,
    y: (box.y - sheet.y) / sheet.height,
    w: box.width / sheet.width,
    h: box.height / sheet.height,
  }
}

/** The same box from the PDF (PDF y runs up from the bottom). */
function pdfBox(d: PdfDraw, page: { widthPt: number; heightPt: number }) {
  return {
    x: d.xPt / page.widthPt,
    y: 1 - (d.yPt + d.hPt) / page.heightPt,
    w: d.wPt / page.widthPt,
    h: d.hPt / page.heightPt,
  }
}

test.describe('exit criterion (all browsers)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('S-X1 an image next to its blurred and 5-value versions exports correctly', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page)
    await app.setVersions(['Original', 'Blurred', 'Values'])
    await app.setSlider('Number of values', 5)
    await app.swatch('Sepia').click()
    await expect(app.swatch('Sepia')).toHaveAttribute('aria-pressed', 'true')
    const tiles = [
      app.tile(RAMP),
      app.studyTile(RAMP, 'Blurred'),
      app.studyTile(RAMP, 'Values'),
    ] as const
    for (const t of tiles) await expect(t).toBeVisible()
    await app.expectPreviewSettled()
    const previewPages = await app.pageCanvases.count()
    const boxes = await Promise.all(tiles.map((t) => previewBox(app, t)))
    const info = await summarizePdf((await app.exportPdf()).bytes)

    expect(info.pageCount).toBe(previewPages)
    expect(info.pageCount).toBe(1)
    const page0 = info.pages[0]
    const draws = page0.draws
    expect(draws).toHaveLength(3)
    const [a, b, c] = draws as [PdfDraw, PdfDraw, PdfDraw]
    testInfo.annotations.push({
      type: 'exit-criterion-draws',
      description: JSON.stringify(draws),
    })

    expectOneGroup(draws)
    expect([a.filter, b.filter, c.filter]).toEqual(['DCTDecode', 'DCTDecode', 'FlateDecode'])
    expect(c.widthPx * c.heightPx).toBeLessThanOrEqual(MAX_COUNTED_PX)
    expect(c.colours).toBe(5)
    expect(new Set(draws.map((d) => d.name)).size).toBe(3)
    expect(info.imageCount).toBe(3)
    expect(info.images.map((i) => i.filter).sort()).toEqual([
      'DCTDecode',
      'DCTDecode',
      'FlateDecode',
    ])

    // The preview shows the same boxes as the PDF.
    draws.forEach((d, i) => {
      const want = pdfBox(d, page0)
      const got = boxes[i]
      expect(Math.abs(got.x - want.x)).toBeLessThan(0.005)
      expect(Math.abs(got.y - want.y)).toBeLessThan(0.005)
      expect(Math.abs(got.w - want.w)).toBeLessThan(0.005)
      expect(Math.abs(got.h - want.h)).toBeLessThan(0.005)
    })
  })
})

test.describe('studies on chromium', () => {
  runOnly('chromium')

  test('S-D1 Blur + Values is a PNG with at most N tones; Values ignores blur', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = await withPhotos(page)
    await app.setVersions(['Values', 'Blur + Values'])
    await app.setSlider('Number of values', 4)
    await app.setSlider('Amount', 80)
    await expect(app.studyTile(RAMP, 'Blur + Values')).toBeVisible()
    const info = await summarizePdf((await app.exportPdf()).bytes)
    const draws = allDraws(info)
    expect(draws.map((d) => d.filter)).toEqual(['FlateDecode', 'FlateDecode'])
    expect(draws[0]?.colours).toBe(4)
    expect(draws[1]?.colours).toBeGreaterThanOrEqual(2)
    expect(draws[1]?.colours).toBeLessThanOrEqual(4)
    expect(info.imageCount).toBe(2)
  })

  test('S-D2 two values give a notan; Neutral grey gives greys', async ({ page }) => {
    test.setTimeout(120_000)
    const app = await withPhotos(page)
    await app.setVersions(['Values'])
    await app.setSlider('Number of values', 2)
    await app.swatch('Neutral grey').click()
    await expect(
      page.getByRole('img', { name: '2 values, from darkest to lightest tint' }),
    ).toBeVisible()
    await expect(app.studyTile(RAMP, 'Values')).toBeVisible()
    await app.expectPreviewSettled()
    const [r, g, bl] = await app.tileCentrePixel(app.studyTile(RAMP, 'Values'))
    expect(r).toBe(g)
    expect(g).toBe(bl)
    const draws = allDraws(await summarizePdf((await app.exportPdf()).bytes))
    expect(draws).toHaveLength(1)
    expect(draws[0]?.filter).toBe('FlateDecode')
    expect(draws[0]?.colours).toBe(2)
  })

  test('S-D3 the lightest value is a tint, never the paper', async ({ page }) => {
    const app = await withPhotos(page)
    await app.setVersions(['Values'])
    const swatches = page
      .getByRole('img', { name: '5 values, from darkest to lightest tint' })
      .locator('span')
    await expect(swatches).toHaveCount(5)
    const lightest = await swatches
      .last()
      .evaluate((el: { style: { backgroundColor: string } }) => el.style.backgroundColor)
    expect(lightest).toMatch(/^rgb\(/)
    expect(lightest).not.toBe('rgb(255, 255, 255)')
  })

  test('S-D4 Apply to all copies the versions to every image, keeps copies, and announces it', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page, [
      FIXTURES.valueRamp,
      FIXTURES.quadrantsJpg,
      FIXTURES.quadrantsPng,
    ])
    await app.editButton('quadrants.jpg').click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'More copies' }).click()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await app.expectPreviewSettled()
    const before = await app.pageCanvases.count()

    await app.tile(RAMP).click()
    await expect(app.studiesPanel.getByText(RAMP, { exact: true })).toBeVisible()
    await app.setVersions(['Original', 'Blurred', 'Values'])
    await app.applyStudiesToAll()
    await expect(
      page.getByRole('status').filter({ hasText: 'Study settings copied to 2 images.' }),
    ).toBeAttached()
    for (const name of ['quadrants.jpg', 'quadrants.png']) {
      await expect(app.studyTile(name, 'Blurred').first()).toBeVisible()
      await expect(app.studyTile(name, 'Values').first()).toBeVisible()
    }
    await app.selectButton('quadrants.png').click()
    await expect(app.studiesPanel.getByText('quadrants.png', { exact: true })).toBeVisible()
    for (const [v, on] of [
      ['Original', 'true'],
      ['Blurred', 'true'],
      ['Values', 'true'],
      ['Blur + Values', 'false'],
    ] as const)
      await expect(app.versionChip(v)).toHaveAttribute('aria-pressed', on)

    await app.expectPreviewSettled()
    const after = await app.pageCanvases.count()
    expect(after).toBeGreaterThan(before)
    const info = await summarizePdf((await app.exportPdf()).bytes)
    expect(info.pageCount).toBe(after)
    // 3 tiles per group; quadrants.jpg keeps its 2 copies.
    expect(allDraws(info)).toHaveLength(3 + 2 * 3 + 3)
  })

  test('S-D5 the Studies tab follows the selection and edits only that image', async ({ page }) => {
    const app = await withPhotos(page, [FIXTURES.valueRamp, FIXTURES.quadrantsJpg])
    await app.tile('quadrants.jpg').click()
    await expect(app.studiesPanel.getByText('quadrants.jpg', { exact: true })).toBeVisible()
    await app.setVersions(['Original', 'Blurred'])
    await expect(app.studyTile('quadrants.jpg', 'Blurred')).toBeVisible()
    await expect(app.studyTile(RAMP, 'Blurred')).toHaveCount(0)
    await app.tile(RAMP).click()
    await expect(app.studiesPanel.getByText(RAMP, { exact: true })).toBeVisible()
    await expect(app.versionChip('Original')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.versionChip('Blurred')).toHaveAttribute('aria-pressed', 'false')
  })

  test('S-D6 two copies with three versions print two complete groups; a fixed width applies per tile', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = await withPhotos(page)
    await app.setVersions(['Original', 'Blurred', 'Values'])
    await app.editButton(RAMP).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'More copies' }).click()
    await sheet.getByRole('radio', { name: 'Fixed' }).click()
    await sheet.getByRole('radio', { name: 'Width' }).click()
    const width = sheet.getByRole('spinbutton', { name: 'Width' })
    await width.fill('50')
    await width.blur()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(app.studyTile(RAMP, 'Values')).toHaveCount(2)
    const info = await summarizePdf((await app.exportPdf()).bytes)
    const draws = allDraws(info)
    expect(draws).toHaveLength(6)
    // The packer may turn a group; the 50 mm then runs along the page's height.
    for (const d of draws) {
      expect(Math.max(d.wPt, d.hPt)).toBeCloseTo(mmToPt(50), 0)
      expect(Math.min(d.wPt, d.hPt)).toBeCloseTo(mmToPt(50 * (600 / 900)), 0)
    }
    expect(draws.map((d) => d.filter)).toEqual([
      'DCTDecode',
      'DCTDecode',
      'FlateDecode',
      'DCTDecode',
      'DCTDecode',
      'FlateDecode',
    ])
    expectOneGroup(draws.slice(0, 3))
    expectOneGroup(draws.slice(3))
  })

  test('S-D7 keyboard only: reach the Studies tab, toggle a version, move the sliders', async ({
    page,
  }) => {
    const app = await withPhotos(page)
    const studiesTab = page.getByRole('tab', { name: 'Studies' })
    await studiesTab.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('tab', { name: 'Page' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(studiesTab).toBeFocused()
    await expect(studiesTab).toHaveAttribute('aria-selected', 'true')

    const tabTo = async (target: Locator) => {
      for (let i = 0; i < 20; i++) {
        if (await target.evaluate((el) => el === document.activeElement)) return
        await page.keyboard.press('Tab')
      }
      await expect(target).toBeFocused()
    }
    await tabTo(app.versionChip('Blurred'))
    await page.keyboard.press('Space')
    await expect(app.versionChip('Blurred')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.studyTile(RAMP, 'Blurred')).toBeVisible()

    const blur = app.studySlider('Amount')
    await tabTo(blur)
    await page.keyboard.press('ArrowRight')
    await expect(blur).toHaveAttribute('aria-valuetext', '41%')
    await expect(page.locator(':focus-visible')).toHaveCount(1)

    const count = app.studySlider('Number of values')
    await tabTo(count)
    await page.keyboard.press('ArrowRight')
    await expect(count).toHaveAttribute('aria-valuetext', '6 values')
  })

  test('S-D8 preview study tiles still render when the studies worker cannot load', async ({
    page,
  }) => {
    let blocked = 0
    await page.context().route('**/study.worker*', (route) => {
      blocked++
      return route.abort()
    })
    const app = await withPhotos(page)
    await app.setVersions(['Values'])
    await app.swatch('Neutral grey').click()
    await expect(app.studyTile(RAMP, 'Values')).toBeVisible()
    await app.expectPreviewSettled()
    expect(blocked).toBeGreaterThan(0)
    const [r, g, bl] = await app.tileCentrePixel(app.studyTile(RAMP, 'Values'))
    expect(r).toBe(g)
    expect(g).toBe(bl)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('S-D9 the sheet stops being busy when an image with pending study tiles is removed', async ({
    page,
  }) => {
    await page.context().route('**/study.worker*', () => {
      // Never answered: the study tiles stay pending.
    })
    const app = await withPhotos(page, [FIXTURES.valueRamp, FIXTURES.quadrantsJpg])
    await app.tile(RAMP).click()
    await app.setVersions(['Original', 'Blurred'])
    await expect(app.studyTile(RAMP, 'Blurred')).toBeVisible()
    const busy = page.locator('main [aria-busy="true"]')
    await expect(busy).toHaveCount(1)
    await app.removeButton(RAMP).click()
    await app.expectImages(1)
    await expect(app.tile('quadrants.jpg')).toBeVisible()
    await app.expectPreviewSettled()
  })

  test('S-D10 the same photos and studies give the same PDF layout whatever the order they are added in', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const layoutOf = async (files: string[], changed: 'first' | 'last'): Promise<string> => {
      await app.upload(files)
      await app.expectImages(files.length)
      await app.expectPreviewPages(1)
      await app.tile('quadrants.jpg').click()
      await app.setVersions(['Original', 'Blurred'])
      await app.applyStudiesToAll()
      await expect(app.studyTile(RAMP, 'Blurred')).toHaveCount(2)
      // The two copies of one photo end up with different studies of the same size.
      const ramps = app.selectButton(RAMP)
      await (changed === 'first' ? ramps.first() : ramps.last()).click()
      await app.setVersions(['Original', 'Values'])
      await expect(app.studyTile(RAMP, 'Values')).toHaveCount(1)
      await expect(app.studyTile(RAMP, 'Blurred')).toHaveCount(1)
      // The preview names what sits where; the PDF must match it (S-X1) and is compared too.
      const placed = await Promise.all(
        (await app.pageFigures.all()).map((figure) =>
          figure
            .getByRole('button')
            .evaluateAll((buttons: { getAttribute(name: string): string | null }[]) =>
              buttons.map((b) => [b.getAttribute('aria-label'), b.getAttribute('style')]),
            ),
        ),
      )
      const info = await summarizePdf((await app.exportPdf()).bytes)
      return JSON.stringify({
        placed,
        draws: info.pages.map((p) =>
          p.draws.map((d) => [d.xPt, d.yPt, d.wPt, d.hPt, d.filter, d.widthPx, d.heightPx]),
        ),
      })
    }
    const app = startApp(page)
    await app.goto()
    await page.getByRole('radio', { name: 'mm', exact: true }).click()
    await app.openStudiesTab()
    // quadrants.jpg and its EXIF-rotated twin have the same area, so only a stable order separates them.
    const first = await layoutOf(
      [FIXTURES.valueRamp, FIXTURES.quadrantsJpg, FIXTURES.quadrantsExif6, FIXTURES.valueRamp],
      'first',
    )
    page.on('dialog', (d) => void d.accept())
    await page.reload()
    await expect(app.imageRows).toHaveCount(0)
    await app.openStudiesTab()
    const second = await layoutOf(
      [FIXTURES.quadrantsExif6, FIXTURES.valueRamp, FIXTURES.valueRamp, FIXTURES.quadrantsJpg],
      'last',
    )
    expect(second).toBe(first)
  })
})
