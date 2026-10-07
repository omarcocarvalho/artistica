import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { AppPage, colourDistance } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { summarizePdf } from './support/pdf.ts'
import { inspectPdf, isRegistrationStroke } from '../src/features/render/pdf/inspect.ts'
import { compositionPaths } from '../src/features/lines/composition.ts'
import { DEFAULT_LINES, patchLines } from '../src/shared/model/lines.ts'
import { runOnly } from './support/projects.ts'
import { sampleBrowserMemory } from './support/memory.ts'
import { syntheticJpegs } from './support/synthetic.ts'
import { expectNoFocusZoom, expectTouchTargets, settled } from './support/targets.ts'

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
/** Every stroke that is not a crop mark, per page, in content order. */
const pdfLineStrokes = async (bytes: Uint8Array) =>
  (await inspectPdf(bytes)).pages.map((p) => p.strokes.filter((s) => !isRegistrationStroke(s)))
const EVERY_LINE_TYPE =
  /, lines: Grid, Rule of thirds, Diagonals & armature, Golden ratio, Golden spiral, and Centre lines$/

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

const MEMORY_LINES = patchLines(DEFAULT_LINES, {
  grid: { on: true, cols: 20, rows: 20 },
  thirds: true,
  armature: true,
  golden: true,
  spiral: { on: true, corner: 'topRight' },
  centre: true,
})
const MIN_CLEARANCE_PX = 2
const PHOTO = { w: 5712, h: 4284 }

/**
 * Centres of the 20 x 20 cells of a w x h px tile that lie at least MIN_CLEARANCE_PX from every
 * MEMORY_LINES path, as tile fractions. A drawn value study puts most of them exactly on a ramp
 * colour.
 */
function pointsClearOfLines(w: number, h: number, pictureLandscape: boolean): [number, number][] {
  const turned = w >= h !== pictureLandscape
  const frame = turned ? { w: h, h: w } : { w, h }
  const onPaths: [number, number][] = []
  for (const path of compositionPaths(MEMORY_LINES, frame)) {
    let x = 0
    let y = 0
    for (const c of path.cmds) {
      const steps = 400
      for (let i = 1; c.op !== 'M' && i <= steps; i++) {
        const t = i / steps
        const u = 1 - t
        onPaths.push(
          c.op === 'L'
            ? [x + (c.x - x) * t, y + (c.y - y) * t]
            : [
                u ** 3 * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t ** 3 * c.x,
                u ** 3 * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t ** 3 * c.y,
              ],
        )
      }
      x = c.x
      y = c.y
    }
  }
  const clear: [number, number][] = []
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < 20; j++) {
      const fx = (i + 0.5) / 20
      const fy = (j + 0.5) / 20
      const [u, v] = turned ? [fy * frame.w, (1 - fx) * frame.h] : [fx * frame.w, fy * frame.h]
      if (onPaths.every(([px, py]) => Math.hypot(px - u, py - v) >= MIN_CLEARANCE_PX))
        clear.push([fx, fy])
    }
  return clear
}

/** Total RSS of the browser's process tree, in MB. */
const AFTER_IMPORT_BUDGET_MB = 1500
const EXPORT_PEAK_BUDGET_MB = 1700

test('M3 @slow 22 x 24 MP photos x 3 study versions with every line on import, preview and export on a phone within a memory budget', async ({
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
  const photos = await syntheticJpegs(page, 22, PHOTO.w, PHOTO.h, { noisy: true })
  const memory = sampleBrowserMemory(browser)
  let pdf: Buffer
  let previewPages: number
  let previewTiles: number
  let previewTilesWithLines: number
  let ramp: number[][]
  const clearPoints: number[] = []
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
    await app.openLinesSection()
    await app.everyLineOn(app.linesSection, { cols: 20, rows: 20 }, 'Top right')
    await app.linesApplyButton.click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Line settings copied to 21 images.' }),
    ).toBeAttached()
    await page.getByRole('button', { name: 'Next' }).click()
    await app.expectPreviewPages(3)
    await expect(app.studyTile('synthetic-22.jpg', 'Values')).toBeAttached({ timeout: 60_000 })
    await app.expectPreviewSettled(300_000)
    previewTiles = await app.pageFigures.getByRole('button').count()
    previewTilesWithLines = await page
      .getByRole('list', { name: /^Page \d+ contents$/ })
      .getByRole('listitem')
      .filter({ hasText: EVERY_LINE_TYPE })
      .count()
    for (const tile of await app.pageFigures.getByRole('button', { name: /, Values$/ }).all()) {
      const box = await tile.boundingBox()
      if (!box) throw new Error('tile not laid out')
      const points = pointsClearOfLines(box.width, box.height, PHOTO.w > PHOTO.h)
      const off = (await app.tilePixels(tile, points)).map((px) => colourDistance(px, ramp))
      clearPoints.push(points.length)
      valuesOnRamp.push(Math.round((100 * off.filter((d) => d <= 3).length) / off.length))
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
    previewTilesWithLines,
    clearPoints,
    valuesOnRampPct: valuesOnRamp,
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
  expect(Math.min(...clearPoints)).toBeGreaterThanOrEqual(50)
  expect(Math.min(...valuesOnRamp)).toBeGreaterThanOrEqual(50)
  expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(66)
  expect((await pdfDraws(pdf)).filter((d) => d.filter === 'FlateDecode')).toHaveLength(22)
  expect(previewTilesWithLines).toBe(66)
  const lineStrokes = (await pdfLineStrokes(pdf)).flat()
  expect(lineStrokes).toHaveLength(66 * 2)
  expect(lineStrokes.filter((s) => s.dashPt.length === 0)).toHaveLength(66)
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
  const paper = step.getByRole('combobox', { name: 'Paper size' })
  await expectTouchTargets([paper, ...radios, ...fields])
  await expectNoFocusZoom([paper, ...fields])
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
  const fields = [
    sheet.getByRole('spinbutton', { name: 'Copies' }),
    sheet.getByRole('spinbutton', { name: 'Width' }),
  ]
  await expectTouchTargets([...radios, ...buttons, ...fields])
  await expectNoFocusZoom(fields)
})

test('H1 phone: the link field and the export file name are 44 px tall with 16 px text', async ({
  page,
}) => {
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg])
  await app.expectImages(1)
  const link = await app.openLinkField()
  await expectTouchTargets([link])
  await expectNoFocusZoom([link])
  await app.goToStep('Export')
  await page.getByRole('button', { name: 'Create PDF' }).first().click()
  const fileName = page.getByRole('dialog').getByRole('textbox', { name: 'File name' })
  await expectTouchTargets([fileName])
  await expectNoFocusZoom([fileName])
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

const LINE_COLOUR = [0x1f, 0x3f, 0xbf]

test('L-P1 phone: the Lines section in the Studies step, lines in the preview and in the PDF', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsPng])
  await app.expectImages(2)
  await app.goToStep('Studies')
  await app.pickStudiesImage('quadrants.jpg')
  await expect(app.linesSection).not.toHaveAttribute('open')
  await expect(app.linesSummary).toHaveAccessibleName('Lines')
  await expect(app.phoneLineSwitch('Rule of thirds')).toBeHidden()

  await app.openLinesSection()
  await expect(page.getByText('Lines for quadrants.jpg')).toBeVisible()
  await app.phoneLineSwitch('Rule of thirds').click()
  await app.phoneLineSwitch('Centre lines').click()
  await expect(app.linesSummary).toHaveAccessibleName('Lines, 2 on')
  if (testInfo.project.name === 'mobile-chromium') {
    const cdp = await page.context().newCDPSession(page)
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: { role?: { value?: string }; name?: { value?: string } }[]
    }
    await cdp.detach()
    expect(
      nodes.filter((n) => n.role?.value === 'DisclosureTriangle').map((n) => n.name?.value),
    ).toEqual(['Lines, 2 on'])
  }

  const applyButtons = page.getByRole('button', { name: /apply/i })
  await expect(applyButtons).toHaveCount(2)
  await expect(applyButtons.nth(0)).toHaveAccessibleName('Apply to all images')
  await expect(applyButtons.nth(1)).toHaveAccessibleName('Apply lines to all images')
  await expect(applyButtons.nth(0)).toBeVisible()
  await expect(applyButtons.nth(1)).toBeVisible()

  await app.linesSection.getByLabel('Colour', { exact: true }).fill('#1f3fbf')
  await expect(app.linesSection.getByText('#1f3fbf', { exact: true })).toBeVisible()
  await app.linesSection.getByRole('slider', { name: 'Thickness' }).fill('2')
  await app.linesSection.getByRole('slider', { name: 'Opacity' }).fill('100')
  await expect(app.linesSection.getByRole('slider', { name: 'Opacity' })).toHaveAttribute(
    'aria-valuetext',
    '100%',
  )

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('region', { name: 'Step 4 of 5: Preview' })).toBeVisible()
  await app.expectPreviewPages(1)
  await app.expectPreviewSettled()
  const lined = app.tile('quadrants.jpg')
  const plain = app.tile('quadrants.png')
  expect(colourDistance(await app.tilePixel(lined, 1 / 3, 0.1), [LINE_COLOUR])).toBeLessThan(40)
  expect(colourDistance(await app.tilePixel(lined, 0.2, 0.1), [LINE_COLOUR])).toBeGreaterThan(100)
  expect(colourDistance(await app.tilePixel(plain, 1 / 3, 0.1), [LINE_COLOUR])).toBeGreaterThan(100)

  await page.getByRole('button', { name: 'Next' }).click()
  const { bytes } = await app.exportPdf('step')
  const strokes = (await pdfLineStrokes(bytes)).flat()
  expect(strokes.map((s) => s.dashPt.length > 0)).toEqual([false, true])
  for (const s of strokes) {
    expect(s.colour.space).toBe('rgb')
    s.colour.values.forEach((v, i) => {
      expect(v).toBeCloseTo((LINE_COLOUR[i] ?? NaN) / 255, 2)
    })
    expect(s.opacity).toBe(1)
  }
})

test('L-P2 phone: every Lines control is at least 44 x 44 px, with 16 px text in the count fields', async ({
  page,
}) => {
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsPng])
  await app.expectImages(2)
  await app.goToStep('Studies')
  await expectTouchTargets([app.linesSummary])
  await app.openLinesSection()
  await app.setSwitch('Grid', true)
  await app.setSwitch('Golden spiral', true)
  const section = app.linesSection
  const switches = await section.getByRole('switch').all()
  const fields = [
    section.getByRole('textbox', { name: 'Columns', exact: true }),
    section.getByRole('textbox', { name: 'Rows', exact: true }),
  ]
  const radios = await section
    .getByRole('radiogroup', { name: 'Spiral starts at' })
    .getByRole('radio')
    .all()
  const sliders = await section.getByRole('slider').all()
  const targets = [
    app.linesSummary,
    ...switches,
    ...fields,
    ...radios,
    section.getByLabel('Colour', { exact: true }),
    ...sliders,
    app.linesApplyButton,
  ]
  expect([switches.length, radios.length, sliders.length, targets.length]).toEqual([
    6,
    4,
    2,
    1 + 6 + 2 + 4 + 1 + 2 + 1,
  ])
  await expectTouchTargets(targets)
  await expectNoFocusZoom(fields)
})

test('L-P3 phone: the Lines section opens and its controls work from the keyboard', async ({
  page,
}, testInfo) => {
  // WebKit on macOS moves Tab focus to buttons only with Alt held (no "full keyboard access").
  const tab = testInfo.project.name === 'mobile-webkit' ? 'Alt+Tab' : 'Tab'
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsPng])
  await app.expectImages(2)
  await app.goToStep('Studies')
  await page.getByRole('button', { name: 'Apply to all images', exact: true }).focus()
  await page.keyboard.press(tab)
  await expect(app.linesSummary).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(app.linesSection).toHaveAttribute('open', '')
  await page.keyboard.press(tab)
  const grid = app.phoneLineSwitch('Grid')
  await expect(grid).toBeFocused()
  await page.keyboard.press('Space')
  await expect(grid).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press(tab)
  const cols = app.linesSection.getByRole('textbox', { name: 'Columns', exact: true })
  await expect(cols).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(cols).toHaveValue('5')
  const spiral = app.phoneLineSwitch('Golden spiral')
  await spiral.focus()
  await page.keyboard.press('Space')
  await expect(spiral).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press(tab)
  const corners = app.linesSection.getByRole('radiogroup', { name: 'Spiral starts at' })
  await expect(corners.getByRole('radio', { name: 'Top left', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight', { delay: 50 })
  await expect(corners.getByRole('radio', { name: 'Top right', exact: true })).toBeChecked()
  await expect(app.linesSummary).toHaveAccessibleName('Lines, 2 on')
  await app.linesSummary.focus()
  await page.keyboard.press('Enter')
  await expect(app.linesSection).not.toHaveAttribute('open')
})
