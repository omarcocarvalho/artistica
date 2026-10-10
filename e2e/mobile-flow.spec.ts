import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage, colourDistance } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import {
  failModelOnce,
  GUIDE_PHOTOS,
  GuidesSection,
  holdModel,
  interval,
  recordAiRequests,
  textLog,
  announcements,
  watchAnnouncements,
  watchTexts,
} from './support/guides.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { summarizePdf, type PdfStroke, type PdfSummary } from './support/pdf.ts'
import { inspectPdf } from '../src/features/render/pdf/inspect.ts'
import { compositionPaths } from '../src/features/lines/composition.ts'
import { DEFAULT_LINES, patchLines } from '../src/shared/model/lines.ts'
import { runOnly } from './support/projects.ts'
import { heapByContext, sampleBrowserMemory, type ContextHeap } from './support/memory.ts'
import { syntheticJpegs } from './support/synthetic.ts'
import {
  installWorkerProbe,
  summarizeLandmarkWorkers,
  workerLog,
  type LandmarkWorkerSummary,
} from './support/workers.ts'
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
/** The settled phase after the landmark worker's idle release, over the M3 settled phase (M4 overview). */
const SETTLED_GUIDES_GROWTH_MB = 100
/** The landmark worker ends when its queue drains, and at most 30 s later through the engine's idle release (M4-R6). */
const IDLE_RELEASE_WAIT_MS = 35_000

test('M3 @slow 22 x 24 MP photos x 3 study versions with every line and guide on import, preview and export on a phone within a memory budget', async ({
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
  await installWorkerProbe(page)
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
  const checkpoints: Record<
    string,
    { rssMb: number; byProcess: Record<string, number>; heaps: ContextHeap[] }
  > = {}
  const checkpoint = async (name: string) => {
    checkpoints[name] = {
      rssMb: await memory.sample(),
      byProcess: await memory.breakdown(),
      heaps: await heapByContext(page),
    }
  }
  let guidesMs: number
  let workers: LandmarkWorkerSummary
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
    await app.setAllLineSwitches(true)
    await app.setGrid(20, 20)
    await app.setSpiralCorner('Top right')
    await app.applyLinesToAll()
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
      await app.showTile(tile)
      const box = await tile.boundingBox()
      if (!box) throw new Error('tile not laid out')
      const points = pointsClearOfLines(box.width, box.height, PHOTO.w > PHOTO.h)
      const off = (await app.tilePixels(tile, points)).map((px) => colourDistance(px, ramp))
      clearPoints.push(points.length)
      valuesOnRamp.push(Math.round((100 * off.filter((d) => d <= 3).length) / off.length))
    }
    previewPages = await app.pageCanvases.count()
    await app.showPage(0)
    await page.waitForTimeout(2000)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.detach()
    await page.waitForTimeout(1000)
    memory.phase('settled after studies')
    await page.waitForTimeout(2000)
    settledBreakdown = await memory.breakdown()
    await checkpoint('settled after studies')

    // Guides: edges at detail 100, face and pose on every photo, both models downloaded.
    memory.phase('guides')
    const guidesStart = Date.now()
    await app.goToStep('Studies')
    await app.pickStudiesImage('synthetic-01.jpg')
    const guides = new GuidesSection(page, app.linesSection)
    await guides.set('Edge outline', true)
    await guides.detail.focus()
    await page.keyboard.press('End')
    await expect(guides.detail).toHaveAttribute('aria-valuetext', '100%')
    await guides.set('Face construction', true)
    await guides.set('Body pose', true)
    await guides.download('face')
    await guides.download('pose')
    await expect(guides.status('Body pose', 'No person found in this image.')).toBeVisible({
      timeout: 60_000,
    })
    await checkpoint('one photo')
    await app.applyLinesToAll()
    await expect(
      page.getByRole('status').filter({ hasText: 'Line settings copied to 21 images.' }),
    ).toBeAttached()
    await app.goToStep('Export')
    await expect(page.getByRole('button', { name: 'Create PDF' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
      { timeout: 300_000 },
    )
    guidesMs = Date.now() - guidesStart
    await checkpoint('guides done')
    memory.phase('preview with guides')
    await app.goToStep('Studies')
    await app.pickStudiesImage('synthetic-22.jpg')
    await expect(guides.status('Edge outline', 'Outline traced.')).toBeVisible()
    await expect(guides.status('Face construction', 'No face found in this image.')).toBeVisible()
    await expect(guides.status('Body pose', 'No person found in this image.')).toBeVisible()
    await app.goToStep('Preview')
    await app.expectPreviewPages(3)
    await app.expectPreviewSettled(300_000)
    await checkpoint('preview with guides')

    memory.phase('idle release')
    await page.waitForTimeout(IDLE_RELEASE_WAIT_MS)
    const gc = await page.context().newCDPSession(page)
    await gc.send('HeapProfiler.collectGarbage')
    await gc.detach()
    await page.waitForTimeout(1000)
    memory.phase('settled after guides')
    await page.waitForTimeout(2000)
    await checkpoint('settled after guides')
    workers = summarizeLandmarkWorkers(await workerLog(page))

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
    checkpoints,
    guidesMs,
    workers,
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
  const lineStrokes = info.pages.flatMap((p) => p.lineStrokes)
  expect(lineStrokes).toHaveLength(66 * 2)
  const solid = lineStrokes.filter((s) => s.dashPt.length === 0)
  expect(solid).toHaveLength(66)
  // The edge outline at detail 100 nears MAX_EDGE_VERTICES on every noisy photo; composition alone is a few hundred ops.
  expect(Math.min(...solid.map((s) => s.path.length))).toBeGreaterThan(2000)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(crashed).toEqual([])
  // M4-R5a: one landmarker at a time; M4-R6: the worker is released when idle.
  expect(workers.maxAlive).toBe(1)
  expect(workers.modelsPerWorker.map((m) => m.length)).toEqual(
    Array<number>(workers.workers).fill(1),
  )
  expect(new Set(workers.modelsPerWorker.flat())).toEqual(new Set(['face', 'pose']))
  expect(workers.alive).toBe(0)
  expect.soft(peaks.studies, 'studies').toBeLessThan(AFTER_IMPORT_BUDGET_MB)
  expect
    .soft(peaks['settled after studies'], 'settled after studies')
    .toBeLessThan(AFTER_IMPORT_BUDGET_MB)
  expect.soft(peaks.guides, 'guides').toBeLessThan(AFTER_IMPORT_BUDGET_MB)
  expect
    .soft(peaks['preview with guides'], 'preview with guides')
    .toBeLessThan(AFTER_IMPORT_BUDGET_MB)
  expect
    .soft(peaks['settled after guides'], 'settled after guides')
    .toBeLessThanOrEqual((peaks['settled after studies'] ?? NaN) + SETTLED_GUIDES_GROWTH_MB)
  expect.soft(peaks.export, 'export').toBeLessThan(EXPORT_PEAK_BUDGET_MB)
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
    ...(await app.outsideLinesSection(await page.getByRole('slider').all())),
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

test('L-P1 phone: the always-open Lines section in the Studies step, lines in the preview and in the PDF', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsPng])
  await app.expectImages(2)
  await app.goToStep('Studies')
  await app.pickStudiesImage('quadrants.jpg')
  const step = page.getByRole('region', { name: 'Step 3 of 5: Studies' })
  await expect(step.locator('details, summary, [aria-expanded]')).toHaveCount(0)
  await expect(app.linesHeading).toBeVisible()
  await expect(app.linesCount).toHaveCount(0)
  await expect(page.getByText('Lines for quadrants.jpg')).toBeVisible()
  await expect(app.linesSection.getByRole('switch')).toHaveCount(6 + 3)
  for (const s of await app.linesSection.getByRole('switch').all()) await expect(s).toBeVisible()
  await expect(app.linesSection.getByLabel('Colour', { exact: true })).toBeVisible()
  await expect(app.lineHex).toBeVisible()
  await expect(app.linesSection.getByRole('slider')).toHaveCount(2)
  for (const s of await app.linesSection.getByRole('slider').all()) await expect(s).toBeVisible()
  await expect(app.linesApplyButton).toBeVisible()

  await app.lineSwitch('Rule of thirds').click()
  await app.lineSwitch('Centre lines').click()
  await expect(app.linesCount).toHaveText('2 on')
  await expect(app.linesCount).toBeVisible()
  await expect(app.linesSection).toHaveAccessibleName('Lines')

  const applyButtons = page.getByRole('button', { name: /apply/i })
  await expect(applyButtons).toHaveCount(2)
  await expect(applyButtons.nth(0)).toHaveAccessibleName('Apply to all images')
  await expect(applyButtons.nth(1)).toHaveAccessibleName('Apply lines to all images')
  await expect(applyButtons.nth(0)).toBeVisible()
  await expect(applyButtons.nth(1)).toBeVisible()

  await app.linesSection.getByLabel('Colour', { exact: true }).fill('#1f3fbf')
  await expect(app.lineHex).toHaveValue('#1f3fbf')
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
  const strokes = (await summarizePdf(bytes)).pages.flatMap((p) => p.lineStrokes)
  expect(strokes.map((s) => s.dashPt.length > 0)).toEqual([false, true])
  for (const s of strokes) {
    expect(s.colour.space).toBe('rgb')
    s.colour.values.forEach((v, i) => {
      expect(v).toBeCloseTo((LINE_COLOUR[i] ?? NaN) / 255, 2)
    })
    expect(s.opacity).toBe(1)
  }
})

test('L-P2 phone: every Lines control is at least 44 x 44 px, with 16 px text in the count and hex fields', async ({
  page,
}) => {
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsPng])
  await app.expectImages(2)
  await app.goToStep('Studies')
  await app.setLineSwitch('Grid', true)
  await app.setLineSwitch('Golden spiral', true)
  const section = app.linesSection
  const switches = await section.getByRole('switch').all()
  const fields = [
    section.getByRole('textbox', { name: 'Columns', exact: true }),
    section.getByRole('textbox', { name: 'Rows', exact: true }),
    section.getByRole('textbox', { name: 'Colour hex code', exact: true }),
  ]
  const radios = await section
    .getByRole('radiogroup', { name: 'Spiral starts at' })
    .getByRole('radio')
    .all()
  const sliders = await section.getByRole('slider').all()
  const targets = [
    ...switches,
    ...fields,
    ...radios,
    section.getByLabel('Colour', { exact: true }),
    ...sliders,
    app.linesApplyButton,
  ]
  expect([switches.length, radios.length, sliders.length, targets.length]).toEqual([
    6 + 3,
    4,
    2,
    6 + 3 + 3 + 4 + 1 + 2 + 1,
  ])
  await expectTouchTargets(targets)
  await expectNoFocusZoom(fields)
})

test('L-P3 phone: every Lines control is reached and works from the keyboard, with no disclosure to open', async ({
  page,
}, testInfo) => {
  // WebKit on macOS moves Tab focus to buttons only with Alt held (no "full keyboard access").
  const webkit = testInfo.project.name === 'mobile-webkit'
  const tab = webkit ? 'Alt+Tab' : 'Tab'
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsPng])
  await app.expectImages(2)
  await app.goToStep('Studies')
  await page.getByRole('button', { name: 'Apply to all images', exact: true }).focus()
  await page.keyboard.press(tab)
  const grid = app.lineSwitch('Grid')
  await expect(grid).toBeFocused()
  await page.keyboard.press('Space')
  await expect(grid).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press(tab)
  const cols = app.linesSection.getByRole('textbox', { name: 'Columns', exact: true })
  await expect(cols).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(cols).toHaveValue('5')
  await page.keyboard.press(tab)
  await expect(app.linesSection.getByRole('textbox', { name: 'Rows', exact: true })).toBeFocused()
  for (const name of ['Rule of thirds', 'Diagonals & armature', 'Golden ratio'] as const) {
    await page.keyboard.press(tab)
    await expect(app.lineSwitch(name)).toBeFocused()
  }
  await page.keyboard.press(tab)
  const spiral = app.lineSwitch('Golden spiral')
  await expect(spiral).toBeFocused()
  await page.keyboard.press('Space')
  await expect(spiral).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press(tab)
  const corners = app.linesSection.getByRole('radiogroup', { name: 'Spiral starts at' })
  await expect(corners.getByRole('radio', { name: 'Top left', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight', { delay: 50 })
  await expect(corners.getByRole('radio', { name: 'Top right', exact: true })).toBeChecked()
  await page.keyboard.press(tab)
  await expect(app.lineSwitch('Centre lines')).toBeFocused()
  for (const name of ['Edge outline', 'Face construction', 'Body pose']) {
    await page.keyboard.press(tab)
    await expect(app.linesSection.getByRole('switch', { name, exact: true })).toBeFocused()
  }
  await page.keyboard.press(tab)
  await expect(app.lineHex).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('#1F3FBF')
  await page.keyboard.press('Enter')
  await expect(app.lineHex).toHaveValue('#1f3fbf')
  await expect(app.linesSection.getByLabel('Colour', { exact: true })).toHaveValue('#1f3fbf')
  await expect(app.linesCount).toHaveText('2 on')
  // WebKit leaves <input type=color> out of the Tab order; the hex box above covers it.
  if (!webkit) {
    await page.keyboard.press(tab)
    await expect(app.linesSection.getByLabel('Colour', { exact: true })).toBeFocused()
  }
  await page.keyboard.press(tab)
  const thickness = app.linesSection.getByRole('slider', { name: 'Thickness' })
  await expect(thickness).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(thickness).toHaveAttribute('aria-valuetext', /^0\.40? mm$/)
  await page.keyboard.press(tab)
  const opacity = app.linesSection.getByRole('slider', { name: 'Opacity' })
  await expect(opacity).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(opacity).toHaveAttribute('aria-valuetext', '91%')
  await page.keyboard.press(tab)
  await expect(app.linesApplyButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('status').filter({ hasText: 'Line settings copied to 1 image.' }),
  ).toBeAttached()
})

// --- M4: guides from the photo on the phone ---

const GUIDE_COLOUR = '#ff00ff'
const GUIDE_RGB = [0xff, 0x00, 0xff]
const PORTRAIT_PX_W = 1361
/** Real face and pose detection runs on CI only in mobile-chromium (C1-R1). */
const detectsLandmarks = (project: string) => project === 'mobile-chromium'

/** Share (0..1) of a preview tile's canvas pixels drawn in the guide colour (within 60 of it). */
async function guideColourShare(tile: Locator): Promise<number> {
  const box = await tile.boundingBox()
  const canvas = tile.locator('xpath=ancestor::figure').locator('canvas')
  const cbox = await canvas.boundingBox()
  if (!box || !cbox) throw new Error('tile or canvas not laid out')
  const rect: [number, number, number, number] = [
    (box.x - cbox.x) / cbox.width,
    (box.y - cbox.y) / cbox.height,
    box.width / cbox.width,
    box.height / cbox.height,
  ]
  return canvas.evaluate(
    (
      c: {
        width: number
        height: number
        getContext(id: '2d'): {
          getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
        } | null
      },
      [[fx, fy, fw, fh], [r, g, b]]: [number[], number[]],
    ) => {
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('canvas is not 2d')
      if (c.width === 0 || c.height === 0)
        throw new Error('page canvas is released: show the page first')
      const x = Math.ceil(c.width * fx)
      const y = Math.ceil(c.height * fy)
      const w = Math.floor(c.width * fw) - 1
      const h = Math.floor(c.height * fh) - 1
      const d = ctx.getImageData(x, y, w, h).data
      let hits = 0
      for (let i = 0; i < d.length; i += 4)
        if (Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b) < 60) hits++
      return hits / (w * h)
    },
    [rect, GUIDE_RGB] as [number[], number[]],
  )
}

const TRACING = 'Tracing the outline…'
const TRACED = 'Outline traced.'

type GuidePhoto = 'portrait' | 'figure' | 'grey'

/**
 * The PDF's non-registration strokes clipped to each of G-P1's photos. The grey PNG is the one
 * Flate image; portrait.jpg is the JPEG whose long side is 2048 / 1361 of its short side.
 */
function strokesByPhoto(info: PdfSummary): Record<GuidePhoto, PdfStroke[]> {
  const out: Record<GuidePhoto, PdfStroke[]> = { portrait: [], figure: [], grey: [] }
  for (const p of info.pages)
    for (const d of p.draws) {
      const aspect = Math.max(d.wPt, d.hPt) / Math.min(d.wPt, d.hPt)
      const photo: GuidePhoto =
        d.filter === 'FlateDecode'
          ? 'grey'
          : Math.abs(aspect - 2048 / PORTRAIT_PX_W) < 0.02
            ? 'portrait'
            : 'figure'
      out[photo].push(
        ...p.lineStrokes.filter(
          (s) =>
            s.clip !== null &&
            Math.abs(s.clip.x - d.xPt) < 0.5 &&
            Math.abs(s.clip.y - d.yPt) < 0.5 &&
            Math.abs(s.clip.w - d.wPt) < 0.5 &&
            Math.abs(s.clip.h - d.hPt) < 0.5,
        ),
      )
    }
  return out
}

test('G-P1 phone: guides in the always-open Lines card, the download, statuses, Export waiting, the preview and the PDF', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const real = detectsLandmarks(testInfo.project.name)
  const app = startApp(page)
  const ai = recordAiRequests(page)
  await app.goto()
  await app.upload([GUIDE_PHOTOS.portrait, GUIDE_PHOTOS.figure, FIXTURES.flatGrey])
  await app.expectImages(3)
  await app.goToStep('Studies')
  await app.pickStudiesImage('portrait.jpg')
  const guides = new GuidesSection(page, app.linesSection)
  await expect(guides.section).toBeVisible()
  await expect(
    guides.section.getByRole('heading', { level: 4, name: 'Guides from the photo' }),
  ).toBeVisible()
  await expect(guides.section.getByText('On device', { exact: true })).toBeVisible()
  await app.setLineStyle({ colour: GUIDE_COLOUR, widthMm: 2, opacityPct: 100 })
  await app.applyLinesToAll()
  await expect(
    page.getByRole('status').filter({ hasText: 'Line settings copied to 2 images.' }),
  ).toBeAttached()

  await guides.set('Face construction', true)
  await expect(guides.status('Face construction', 'One-time download: 15.2 MB')).toBeVisible()
  await expect(guides.downloadButton('face')).toBeVisible()
  expect(ai).toEqual([])

  const hold = await holdModel(page, 'face')
  await guides.downloadButton('face').click()
  await expect(guides.progress('face')).toBeVisible()
  // The visible amount is hidden from screen readers; the bar speaks it in words (owner Q18, default).
  const amount = guides.status('Face construction', /^\d+\.\d of 15\.2 MB$/)
  await expect(amount).toBeVisible()
  await expect(amount).toHaveAttribute('aria-hidden', 'true')
  await expect(guides.progress('face')).toHaveAttribute(
    'aria-valuetext',
    /^\d+\.\d of 15\.2 megabytes$/,
  )
  await expect.poll(hold.held).toBe(1)

  await app.goToStep('Export')
  const create = page.getByRole('button', { name: 'Create PDF' })
  await expect(create).toHaveAttribute('aria-disabled', 'true')
  await expect(create).toHaveAccessibleDescription('Finding guides in your photos…')
  await expect(
    page
      .getByRole('region', { name: 'Step 5 of 5: Export' })
      .getByText('Finding guides in your photos…'),
  ).toBeVisible()
  hold.release()
  await app.goToStep('Studies')
  await expect(guides.progress('face')).toHaveCount(0, { timeout: 60_000 })
  await expect(guides.downloadButton('face')).toHaveCount(0)

  if (real) {
    await expect(
      guides.status('Face construction', 'Face guides on. Brow, eye, nose and chin lines added.'),
    ).toBeVisible({ timeout: 60_000 })
    await app.pickStudiesImage('figure.jpg')
    await guides.set('Body pose', true)
    await expect(guides.status('Body pose', /^One-time download: \d+\.\d MB$/)).toBeVisible()
    await guides.download('pose')
    await expect(guides.status('Body pose', 'Pose lines on.')).toBeVisible({ timeout: 60_000 })
    await app.pickStudiesImage('flat-grey.png')
    await guides.set('Face construction', true)
    await expect(guides.status('Face construction', 'No face found in this image.')).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      guides.status('Face construction', 'Face guides work best with a clear front or ¾ view.'),
    ).toBeVisible()
    await expect(guides.switch('Face construction')).toHaveAttribute('aria-checked', 'true')
  } else {
    // CI's WebKit has no WebGL in a worker: the flow stops after the download and exports the edge outline.
    await guides.set('Face construction', false)
    await guides.set('Edge outline', true)
    await expect(guides.status('Edge outline', 'Outline traced.')).toBeVisible({ timeout: 60_000 })
  }

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('region', { name: 'Step 4 of 5: Preview' })).toBeVisible()
  await app.expectPreviewPages(1)
  await app.expectPreviewSettled(60_000)
  const portraitGuide = real ? 'Face construction' : 'Edge outline'
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`^portrait\\.jpg, .*, lines: ${portraitGuide}$`) }),
  ).toHaveCount(1)
  expect(await guideColourShare(app.tile('portrait.jpg'))).toBeGreaterThan(0.002)
  expect(await guideColourShare(app.tile('flat-grey.png'))).toBe(0)
  if (real) expect(await guideColourShare(app.tile('figure.jpg'))).toBeGreaterThan(0.002)

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(create).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 })
  const { bytes } = await app.exportPdf('step')
  const strokes = strokesByPhoto(await summarizePdf(bytes))
  expect(strokes.portrait).toHaveLength(1)
  expect(strokes.portrait[0]?.dashPt).toEqual([])
  expect(strokes.portrait[0]?.path.length ?? 0).toBeGreaterThan(60)
  expect(strokes.figure).toHaveLength(real ? 1 : 0)
  expect(strokes.grey).toHaveLength(0)
  expect(new Set(ai).size).toBe(ai.length)
  expect(ai).toHaveLength(real ? 4 : 3)
})

test('G-P3 phone: every Guides control is at least 44 x 44 px, and the section has no text field to zoom', async ({
  page,
}) => {
  const app = startApp(page)
  await app.goto()
  await app.upload([GUIDE_PHOTOS.portrait])
  await app.expectImages(1)
  await app.goToStep('Studies')
  const guides = new GuidesSection(page, app.linesSection)
  for (const name of ['Edge outline', 'Face construction', 'Body pose'] as const)
    await guides.set(name, true)
  const switches = await guides.section.getByRole('switch').all()
  expect(switches).toHaveLength(3)
  await expectTouchTargets([
    ...switches,
    guides.detail,
    guides.downloadButton('face'),
    guides.downloadButton('pose'),
  ])

  await failModelOnce(page, 'face')
  await guides.downloadButton('face').click()
  const failed = guides.group('Face construction').getByRole('alert')
  await expect(failed).toContainText("Couldn't download the face model")
  await expect(failed).toContainText('Check your connection and try again. Other lines still work.')
  await expect(failed.getByRole('button')).toHaveCount(0)
  const faceGroup = guides.group('Face construction')
  const tryAgain = faceGroup.getByRole('button', { name: 'Try again', exact: true })
  const turnOff = faceGroup.getByRole('button', { name: 'Turn off face guides', exact: true })
  await expectTouchTargets([tryAgain, turnOff])
  // iOS zooms on focus only into a text control under 16 px (MIN_INPUT_FONT_PX); the section has none.
  await expect(
    guides.section.getByRole('textbox').or(guides.section.getByRole('spinbutton')),
  ).toHaveCount(0)
  await expect(guides.section.getByRole('combobox')).toHaveCount(0)
  await turnOff.click()
  await expect(guides.switch('Face construction')).toHaveAttribute('aria-checked', 'false')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`G-P4 phone: axe on the Studies step with the guides in the box, progress and found states (${scheme})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ colorScheme: scheme })
    const app = startApp(page)
    await app.goto()
    await app.upload([GUIDE_PHOTOS.portrait])
    await app.expectImages(1)
    await app.goToStep('Studies')
    const guides = new GuidesSection(page, app.linesSection)
    await guides.set('Edge outline', true)
    await guides.set('Face construction', true)
    await expect(guides.downloadButton('face')).toBeVisible()
    await expect(guides.status('Edge outline', 'Outline traced.')).toBeVisible({ timeout: 30_000 })
    await expectNoAxeViolations(page)

    const hold = await holdModel(page, 'face')
    await guides.downloadButton('face').click()
    await expect(guides.progress('face')).toBeVisible()
    await expect.poll(hold.held).toBe(1)
    await expectNoAxeViolations(page)
    hold.release()
    await expect(guides.progress('face')).toHaveCount(0, { timeout: 60_000 })

    if (detectsLandmarks(testInfo.project.name)) {
      await expect(
        guides.status('Face construction', 'Face guides on. Brow, eye, nose and chin lines added.'),
      ).toBeVisible({ timeout: 60_000 })
      await expectNoAxeViolations(page)
    }
  })
}

test('G-P5 phone: the Guides controls work from the keyboard, and focus stays on the switch when its box goes', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  // WebKit on macOS moves Tab focus to buttons only with Alt held (no "full keyboard access").
  const tab = testInfo.project.name === 'mobile-webkit' ? 'Alt+Tab' : 'Tab'
  const app = startApp(page)
  await app.goto()
  await app.upload([GUIDE_PHOTOS.portrait])
  await app.expectImages(1)
  await app.goToStep('Studies')
  const guides = new GuidesSection(page, app.linesSection)
  await app.lineSwitch('Centre lines').focus()
  await watchTexts(page, [TRACING])
  await watchAnnouncements(app.linesSection.getByRole('status'))
  const tracings = async () => (await textLog(page)).filter((e) => e.text === TRACING).length

  await page.keyboard.press(tab)
  await expect(guides.switch('Edge outline')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(guides.switch('Edge outline')).toHaveAttribute('aria-checked', 'true')
  await expect(guides.status('Edge outline', TRACED)).toBeVisible({ timeout: 30_000 })
  expect(await tracings()).toBe(1)
  // Switching the outline on speaks both messages.
  await expect.poll(() => announcements(page)).toEqual([TRACING, TRACED])
  await page.keyboard.press(tab)
  await expect(guides.detail).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(guides.detail).toHaveAttribute('aria-valuetext', '51%')
  // The new Detail traces the outline again (after the 80 ms settle).
  await expect.poll(tracings, { timeout: 30_000 }).toBe(2)
  await expect(guides.status('Edge outline', TRACED)).toBeVisible({ timeout: 30_000 })
  // After a Detail change only the result is spoken (owner Q19, default).
  await expect.poll(() => announcements(page)).toEqual([TRACING, TRACED, TRACED])

  await page.keyboard.press(tab)
  await expect(guides.switch('Face construction')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(guides.switch('Face construction')).toHaveAttribute('aria-checked', 'true')
  await expect(guides.downloadButton('face')).toBeVisible()
  await page.keyboard.press(tab)
  await expect(guides.downloadButton('face')).toBeFocused()
  const hold = await holdModel(page, 'face')
  await page.keyboard.press('Enter')
  await expect(guides.progress('face')).toBeVisible()
  await expect(guides.switch('Face construction')).toBeFocused()
  hold.release()
  await expect(guides.progress('face')).toHaveCount(0, { timeout: 60_000 })

  await page.keyboard.press(tab)
  await expect(guides.switch('Body pose')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(guides.switch('Body pose')).toHaveAttribute('aria-checked', 'true')
  await expect(guides.downloadButton('pose')).toBeVisible()
  await page.keyboard.press(tab)
  await expect(guides.downloadButton('pose')).toBeFocused()
  await failModelOnce(page, 'pose')
  await page.keyboard.press('Enter')
  const failed = guides.group('Body pose').getByRole('alert')
  await expect(failed).toContainText("Couldn't download the pose model")
  await expect(failed.getByRole('button')).toHaveCount(0)
  await expect(guides.switch('Body pose')).toBeFocused()
  const poseGroup = guides.group('Body pose')
  await page.keyboard.press(tab)
  await expect(poseGroup.getByRole('button', { name: 'Try again', exact: true })).toBeFocused()
  await page.keyboard.press(tab)
  const turnOff = poseGroup.getByRole('button', { name: 'Turn off pose guides', exact: true })
  await expect(turnOff).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(guides.switch('Body pose')).toHaveAttribute('aria-checked', 'false')
  await expect(guides.switch('Body pose')).toBeFocused()
})

const FINDING_FACES = 'Finding faces…'
const FACE_FOUND = 'Face guides on. Brow, eye, nose and chin lines added.'
const NO_FACE = 'No face found in this image.'
/** CI bound for one photo's edge outline on the phone (budget < 1500 ms, M4 overview). */
const EDGE_OUTLINE_CI_BOUND_MS = 3000

test('G-P6 phone timing: one 24 MP photo’s edge outline (CI bound 3000 ms) and face detection, recorded', async ({
  page,
}, testInfo) => {
  test.skip(
    !detectsLandmarks(testInfo.project.name),
    'recorded on mobile-chromium, the phone project with real face detection on CI (C1-R1)',
  )
  test.setTimeout(180_000)
  const app = startApp(page)
  await app.goto()
  const [photo] = await syntheticJpegs(page, 1, PHOTO.w, PHOTO.h, { noisy: true })
  await app.upload([
    photo,
    { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: readFileSync(GUIDE_PHOTOS.portrait) },
    { name: 'flat-grey.png', mimeType: 'image/png', buffer: readFileSync(FIXTURES.flatGrey) },
  ])
  await app.expectImages(3)
  await app.goToStep('Studies')
  await app.pickStudiesImage('synthetic-01.jpg')
  const guides = new GuidesSection(page, app.linesSection)
  await watchTexts(page, [TRACING, TRACED, FINDING_FACES, FACE_FOUND, NO_FACE])

  await guides.set('Edge outline', true)
  await expect(guides.status('Edge outline', TRACED)).toBeVisible({ timeout: 30_000 })

  await app.pickStudiesImage('portrait.jpg')
  await guides.set('Face construction', true)
  await guides.download('face')
  await expect(guides.status('Face construction', FACE_FOUND)).toBeVisible({ timeout: 60_000 })
  await app.pickStudiesImage('flat-grey.png')
  await guides.set('Face construction', true)
  await expect(guides.status('Face construction', NO_FACE)).toBeVisible({ timeout: 60_000 })

  const log = await textLog(page)
  const edgeMs = interval(log, TRACING, TRACED)
  const firstFaceMs = interval(log, FINDING_FACES, FACE_FOUND, 0)
  const nextFaceMs = interval(log, FINDING_FACES, NO_FACE, 1)
  const report = JSON.stringify({ edgeMs, firstFaceMs, nextFaceMs })
  console.log(`guide timings (${testInfo.project.name}): ${report}`)
  testInfo.annotations.push({ type: 'guide-timings', description: report })
  expect(edgeMs).toBeLessThan(EDGE_OUTLINE_CI_BOUND_MS)
})
