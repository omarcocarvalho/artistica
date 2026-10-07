import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  FLAT_GREY_H,
  FLAT_GREY_RGB,
  FLAT_GREY_W,
} from '../src/features/images/__fixtures__/flat-grey.ts'
import { PT_PER_MM } from '../src/shared/model/units.ts'
import { AppPage, LINE_TYPE_NAMES, type StudyVersionName } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import {
  distanceToLines,
  firstCurvePoint,
  hexRgb,
  isTurned,
  lineSamples,
  lineSettings,
  rgbDistance,
  strokeMismatches,
  tileLinesFor,
  towards,
  trimOf,
  type TileLines,
  type PointMm,
  type RectMm,
  type EdgeOptions,
  type LineSamples,
  type SampleOptions,
} from './support/line-geometry.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import {
  drawnImageData,
  rectPtToMm,
  strokeToMm,
  summarizePdf,
  type PdfDraw,
  type PdfImageData,
  type PdfSummary,
} from './support/pdf.ts'
import { inspectPdf } from '../src/features/render/pdf/inspect.ts'
import { runOnly } from './support/projects.ts'

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

const GREY = 'flat-grey.png'
const RAMP = 'value-ramp.png'
const BLUE = '#1f3fbf'

/** Loads the photos on A4 with the unit in mm (the default follows the browser locale), then opens Lines. */
async function withPhotos(page: Page, files: string[] = [FIXTURES.flatGrey]): Promise<AppPage> {
  const app = startApp(page)
  await app.goto()
  await page.getByRole('radio', { name: 'mm', exact: true }).click()
  await app.setPaper('A4')
  await app.upload(files)
  await app.expectImages(files.length)
  await app.expectPreviewPages(1)
  await app.openLinesTab()
  return app
}

/** Exports, closes the dialog and returns the bytes with their summary. */
async function exported(app: AppPage): Promise<{ bytes: Buffer; info: PdfSummary }> {
  const { bytes } = await app.exportPdf()
  await app.page.keyboard.press('Escape')
  await expect(app.page.getByRole('dialog')).toHaveCount(0)
  return { bytes, info: await summarizePdf(bytes) }
}

function firstPage(info: PdfSummary): PdfSummary['pages'][number] {
  expect(info.pages.length).toBeGreaterThan(0)
  return info.pages[0]
}

/** Same images (content and resource name), same draw boxes, same crop marks. */
async function expectSameSheet(a: Buffer, b: Buffer): Promise<void> {
  const [ia, ib] = await Promise.all([summarizePdf(a), summarizePdf(b)])
  expect(ib.imageCount).toBe(ia.imageCount)
  expect(ib.pages.map((p) => p.draws)).toEqual(ia.pages.map((p) => p.draws))
  expect(ib.pages.map((p) => [p.strokes, p.markSegments])).toEqual(
    ia.pages.map((p) => [p.strokes, p.markSegments]),
  )
  const da = (await drawnImageData(a)).flat()
  const db = (await drawnImageData(b)).flat()
  expect(da.length).toBeGreaterThan(0)
  expect(db).toHaveLength(da.length)
  const meta = ({ name, filter, widthPx, heightPx }: PdfImageData) => ({
    name,
    filter,
    widthPx,
    heightPx,
  })
  expect(db.map(meta)).toEqual(da.map(meta))
  da.forEach((d, i) => {
    expect(Buffer.from(d.data).equals(Buffer.from(db[i]?.data ?? []))).toBe(true)
  })
}

interface PreviewProbe {
  readonly pxPerMm: number
  /** Per tile, in tile order. */
  readonly tiles: readonly LineSamples[]
}

async function pxPerMm(app: AppPage, info: PdfSummary): Promise<number> {
  return (await app.sheetScale(0, firstPage(info).widthPt / PT_PER_MM)).pxPerMm
}

/** Where to look on the first sheet for each tile's lines (sample points from the PDF geometry). */
async function previewProbe(
  app: AppPage,
  info: PdfSummary,
  tiles: readonly TileLines[],
  opts: SampleOptions,
  edge?: Omit<EdgeOptions, 'pxPerMm'>,
): Promise<PreviewProbe> {
  const k = await pxPerMm(app, info)
  const o = edge ? { ...opts, edge: { ...edge, pxPerMm: k } } : opts
  return { pxPerMm: k, tiles: tiles.map((t) => lineSamples(t, o)) }
}

type Px = [number, number, number, number]

/** The first sheet's pixels at points in page mm. */
function pixelsAt(app: AppPage, k: number, points: readonly PointMm[]): Promise<Px[]> {
  return app.sheetPixels(
    0,
    points.map((p) => [p.x * k, p.y * k] as const),
  )
}

/** The sheet's pixels at every probe point, in the probe's order. */
async function readProbe(
  app: AppPage,
  probe: PreviewProbe,
): Promise<{ on: Px[]; off: Px[]; edge: Px[] }[]> {
  const pixels = await pixelsAt(
    app,
    probe.pxPerMm,
    probe.tiles.flatMap((t) => [...t.on, ...t.off, ...t.edge]),
  )
  let i = 0
  const take = (n: number) => {
    i += n
    return pixels.slice(i - n, i)
  }
  return probe.tiles.map((t) => ({
    on: take(t.on.length),
    off: take(t.off.length),
    edge: take(t.edge.length),
  }))
}

/** Messages for the points whose pixel fails `ok`. */
function failing(
  label: string,
  points: readonly PointMm[],
  pixels: readonly Px[],
  ok: (px: Px, i: number) => boolean,
): string[] {
  return points.flatMap((p, i) => {
    const px = pixels[i]
    return ok(px, i) ? [] : [`${label} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) mm = ${String(px)}`]
  })
}

/** The pure geometry for each drawn tile of the first page (flat-grey photos only). */
function expectedTiles(info: PdfSummary, lines: Parameters<typeof tileLinesFor>[0]): TileLines[] {
  const p = firstPage(info)
  return p.draws.map((d) =>
    tileLinesFor(lines, trimOf(d, p.heightPt), isTurned(d, FLAT_GREY_W, FLAT_GREY_H)),
  )
}

/** Every tile has one stroke per batch and they equal the pure geometry. */
function strokeErrors(info: PdfSummary, tiles: readonly TileLines[]): string[] {
  const p = firstPage(info)
  let at = 0
  return tiles.flatMap((t, i) => {
    const got = p.lineStrokes.slice(at, at + t.strokes.length)
    at += t.strokes.length
    return strokeMismatches(got, t, p.heightPt).map((m) => `tile ${String(i)}: ${m}`)
  })
}

const EXIT_LINES = lineSettings({
  grid: { on: true, cols: 4, rows: 5 },
  thirds: true,
  armature: true,
  golden: true,
  spiral: { on: true, corner: 'topRight' },
  centre: true,
  style: { colour: BLUE, widthMm: 1.5, opacityPct: 100 },
})

const EXIT_SAMPLES: SampleOptions = {
  stepMm: 4,
  crossMm: 3,
  offsetMm: 2.5,
  clearMm: 2,
  edgeMm: 1.5,
  dashMarginMm: 1,
}

const EXIT_EDGE = { marginPx: 0.9, endMm: 3 }

test.describe('exit criterion (all browsers)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  for (const versions of [['Original'], ['Original', 'Blurred', 'Values']] as const) {
    test(`L-X1 the lines in the PDF match the preview exactly and stay sharp (${String(versions.length)} tile${versions.length > 1 ? 's' : ''})`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      const app = await withPhotos(page)
      if (versions.length > 1) {
        await app.openStudiesTab()
        await app.setVersions(versions as readonly StudyVersionName[])
        await app.openLinesTab()
      }
      await app.setAllLineSwitches(true)
      await app.setGrid(4, 5)
      await app.setSpiralCorner('Top right')
      await app.setLineStyle({ colour: BLUE, widthMm: 1.5, opacityPct: 100 })
      await app.expectPreviewSettled()

      const on = await exported(app)
      expect(on.info.pageCount).toBe(1)
      const page0 = firstPage(on.info)
      expect(page0.draws).toHaveLength(versions.length)

      expect(page0.lineStrokes).toHaveLength(2 * versions.length)
      const tiles = expectedTiles(on.info, EXIT_LINES)
      for (const t of tiles)
        expect(t.strokes.map((s) => s.dashMm.length > 0)).toEqual([false, true])
      expect(strokeErrors(on.info, tiles)).toEqual([])

      // Preview = PDF: the sheet shows the line colour along every PDF path and the photo beside
      // it, which is what the same pixel shows once the lines are off.
      const line = hexRgb(BLUE)
      const probe = await previewProbe(app, on.info, tiles, EXIT_SAMPLES, EXIT_EDGE)
      const lit = await readProbe(app, probe)
      await app.setAllLineSwitches(false)
      await app.expectPreviewSettled()
      const bare = await readProbe(app, probe)
      const counts = probe.tiles.map((t) => [t.on.length, t.off.length, t.edge.length])
      testInfo.annotations.push({ type: 'preview-samples', description: JSON.stringify(counts) })
      for (const n of counts.flat()) expect(n).toBeGreaterThanOrEqual(40)
      const failures = probe.tiles.flatMap((t, k) => {
        const l = lit[k]
        const b = bare[k]
        return [
          ...failing(`tile ${String(k)} on`, t.on, l.on, (px) => rgbDistance(px, line) <= 60),
          ...failing(
            `tile ${String(k)} on, lines off`,
            t.on,
            b.on,
            (px) => rgbDistance(px, line) > 60,
          ),
          ...failing(
            `tile ${String(k)} off`,
            t.off,
            l.off,
            (px, i) => rgbDistance(px, b.off[i] ?? []) <= 30,
          ),
          ...failing(
            `tile ${String(k)} past the edge`,
            t.edge,
            l.edge,
            (px, i) => rgbDistance(px, b.edge[i] ?? []) <= 30,
          ),
        ]
      })
      expect(failures).toEqual([])
      const original = probe.tiles[0]
      const originalBare = bare[0]
      expect(
        failing(
          'original is the flat grey',
          [...original.on, ...original.off],
          [...originalBare.on, ...originalBare.off],
          (px) => rgbDistance(px, FLAT_GREY_RGB) <= 30,
        ),
      ).toEqual([])

      // Vector, not pixels: with every line off the same images are drawn, byte for byte.
      const off = await exported(app)
      expect(firstPage(off.info).lineStrokes).toEqual([])
      await expectSameSheet(on.bytes, off.bytes)
    })
  }
})

const tileBox = (d: PdfDraw, info: PdfSummary): RectMm => trimOf(d, firstPage(info).heightPt)

/** M3-R3, written out independently: a frame point on the page, the tile turned 90° clockwise or not. */
function frameToPage(u: number, v: number, trim: RectMm, turned: boolean): PointMm {
  return turned ? { x: trim.x + trim.w - v, y: trim.y + u } : { x: trim.x + u, y: trim.y + v }
}

const CORNERS = [
  ['Top left', 'topLeft', 0, 0],
  ['Top right', 'topRight', 1, 0],
  ['Bottom left', 'bottomLeft', 0, 1],
  ['Bottom right', 'bottomRight', 1, 1],
] as const

const STYLE_1MM = { colour: BLUE, widthMm: 1, opacityPct: 100 }

test.describe('lines on desktop (all browsers)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('L-D1 opacity below 100% is an ExtGState /CA; at 100% there is none; the images never change', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page)
    await app.setAllLineSwitches(true)
    await app.setLineStyle({ colour: BLUE, widthMm: 1, opacityPct: 90 })
    await app.expectPreviewSettled()
    const at90 = await exported(app)
    const tiles = expectedTiles(
      at90.info,
      lineSettings({
        ...EXIT_LINES,
        spiral: { on: true, corner: 'topLeft' },
        style: { colour: BLUE, widthMm: 1, opacityPct: 90 },
      }),
    )
    expect(firstPage(at90.info).lineStrokes.map((s) => s.opacity)).toEqual([0.9, 0.9])
    expect(strokeErrors(at90.info, tiles)).toEqual([])

    // The preview blends the same way: 90% of the line colour over the grey.
    const blend = hexRgb(BLUE).map((c, i) => 0.9 * c + 0.1 * (FLAT_GREY_RGB[i] ?? 0))
    const probe = await previewProbe(app, at90.info, tiles, EXIT_SAMPLES)
    const [lit] = await readProbe(app, probe)
    const onPoints = probe.tiles[0]?.on ?? []
    expect(onPoints.length).toBeGreaterThanOrEqual(40)
    expect(
      failing(
        '90% on',
        onPoints,
        lit.on,
        (px) => rgbDistance(px, blend) <= 6 && rgbDistance(px, hexRgb(BLUE)) >= 12,
      ),
    ).toEqual([])

    await app.setAllLineSwitches(false)
    await app.expectPreviewSettled()
    const none = await exported(app)
    await expectSameSheet(at90.bytes, none.bytes)

    await app.setAllLineSwitches(true)
    await app.setLineStyle({ opacityPct: 100 })
    await app.expectPreviewSettled()
    const at100 = await exported(app)
    expect(firstPage(at100.info).lineStrokes.map((s) => s.opacity)).toEqual([1, 1])
    const content = (await inspectPdf(at100.bytes)).pages[0]?.content ?? ''
    expect(content).toMatch(/ RG\b/)
    expect(content).not.toMatch(/\sgs\b/)
    await expectSameSheet(at100.bytes, none.bytes)
  })

  test('L-D2 the spiral starts at the chosen corner of the picture, in the PDF and the preview', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const app = await withPhotos(page)
    await app.setLineSwitch('Golden spiral', true)
    await app.setLineStyle(STYLE_1MM)
    const line = hexRgb(BLUE)
    for (const [name, corner, fu, fv] of CORNERS) {
      await app.setSpiralCorner(name)
      await app.expectPreviewSettled()
      const { info } = await exported(app)
      const p = firstPage(info)
      const [draw] = p.draws
      const trim = tileBox(draw, info)
      const turned = isTurned(draw, FLAT_GREY_W, FLAT_GREY_H)
      const settings = (c: (typeof CORNERS)[number][1]) =>
        lineSettings({ spiral: { on: true, corner: c }, style: STYLE_1MM })
      const want = tileLinesFor(settings(corner), trim, turned)
      expect(strokeErrors(info, [want])).toEqual([])
      const [stroke] = p.lineStrokes
      const [first] = strokeToMm(stroke, p.heightPt)
      const start = frameToPage(
        fu * (turned ? trim.h : trim.w),
        fv * (turned ? trim.w : trim.h),
        trim,
        turned,
      )
      expect(first.op).toBe('M')
      expect(first.x).toBeCloseTo(start.x, 2)
      expect(first.y).toBeCloseTo(start.y, 2)

      // Early on its outer arc the spiral is in the chosen corner's part of the picture; where the
      // other corners' spirals would be at that point, the photo shows.
      const near = firstCurvePoint(want, 0.15)
      const others: PointMm[] = []
      for (const [, c] of CORNERS) {
        if (c === corner) continue
        const q = firstCurvePoint(tileLinesFor(settings(c), trim, turned), 0.15)
        if (distanceToLines(want, q) >= 2) others.push(q)
      }
      expect(others.length).toBeGreaterThanOrEqual(2)
      const [onPx, ...offPx] = await pixelsAt(app, await pxPerMm(app, info), [near, ...others])
      expect(rgbDistance(onPx, line), `${name}: on the spiral`).toBeLessThanOrEqual(60)
      for (const px of offPx)
        expect(rgbDistance(px, FLAT_GREY_RGB), `${name}: elsewhere`).toBeLessThanOrEqual(30)
    }
  })

  test('L-D3 the Lines tab follows a tile clicked on the preview and edits only that image', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = await withPhotos(page, [FIXTURES.flatGrey, FIXTURES.valueRamp])
    await expect(app.linesPanel.getByText(GREY, { exact: true })).toBeVisible()
    await app.tile(RAMP).click()
    await expect(app.tile(RAMP)).toHaveAttribute('aria-pressed', 'true')
    await expect(app.linesPanel.getByText(RAMP, { exact: true })).toBeVisible()
    await app.setLineSwitch('Rule of thirds', true)
    await app.setLineStyle(STYLE_1MM)
    await app.expectPreviewSettled()

    await app.tile(GREY).click()
    await expect(app.linesPanel.getByText(GREY, { exact: true })).toBeVisible()
    await expect(app.lineSwitch('Rule of thirds')).toHaveAttribute('aria-checked', 'false')
    await expect(app.lineColour).toHaveValue('#e0457b')

    const line = hexRgb(BLUE)
    expect(rgbDistance(await app.tilePixel(app.tile(RAMP), 1 / 3, 0.25), line)).toBeLessThanOrEqual(
      60,
    )
    expect(
      rgbDistance(await app.tilePixel(app.tile(GREY), 1 / 3, 0.25), FLAT_GREY_RGB),
    ).toBeLessThanOrEqual(30)

    const { info } = await exported(app)
    const p = firstPage(info)
    expect(p.draws).toHaveLength(2)
    const aspect = (d: PdfDraw) => Math.max(d.wPt, d.hPt) / Math.min(d.wPt, d.hPt)
    const ramp = p.draws.find((d) => Math.abs(aspect(d) - 1.5) < 0.01)
    if (!ramp) throw new Error('no 3:2 tile for the ramp')
    expect(p.lineStrokes).toHaveLength(1)
    const clip = p.lineStrokes[0]?.clip
    if (!clip) throw new Error('no clip')
    const got = rectPtToMm(clip, p.heightPt)
    const want = tileBox(ramp, info)
    for (const key of ['x', 'y', 'w', 'h'] as const) expect(got[key]).toBeCloseTo(want[key], 2)
  })

  test('L-D12 a line thinner than a device pixel keeps its geometry and dash lengths; only its width floors', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000)
    const app = await withPhotos(page)
    await app.setLineSwitch('Rule of thirds', true)
    await app.setLineSwitch('Centre lines', true)
    await app.setLineStyle({ colour: BLUE, widthMm: 0.1, opacityPct: 100 })
    await app.expectPreviewSettled()
    const { info } = await exported(app)
    const thin = lineSettings({ thirds: true, centre: true, style: { ...STYLE_1MM, widthMm: 0.1 } })
    const tiles = expectedTiles(info, thin)
    expect(strokeErrors(info, tiles)).toEqual([])

    const probe = await previewProbe(app, info, tiles, {
      stepMm: 2,
      crossMm: 1.5,
      offsetMm: 1,
      clearMm: 0.8,
      edgeMm: 1,
      dashMarginMm: 0.35,
    })
    expect(0.1 * probe.pxPerMm).toBeLessThan(1)
    testInfo.annotations.push({ type: 'px-per-mm', description: probe.pxPerMm.toFixed(3) })
    const [lit] = await readProbe(app, probe)
    const t = probe.tiles[0]
    expect(t.on.length).toBeGreaterThanOrEqual(40)
    expect(t.off.length).toBeGreaterThanOrEqual(40)
    const line = hexRgb(BLUE)
    const cover = (px: Px) => towards(px, FLAT_GREY_RGB, line)
    expect([
      ...failing('thin on', t.on, lit.on, (px) => cover(px) >= 0.35),
      ...failing('thin off or in a gap', t.off, lit.off, (px) => cover(px) <= 0.15),
    ]).toEqual([])
  })

  test('L-D4 Apply lines to all copies every line setting and no study; the studies apply copies no line', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page, [FIXTURES.flatGrey, FIXTURES.valueRamp])
    const select = async (name: string) => {
      await app.expectPreviewSettled()
      await app.tile(name).click()
      await expect(app.tile(name)).toHaveAttribute('aria-pressed', 'true')
    }
    await select(RAMP)
    await app.openStudiesTab()
    await expect(app.studiesPanel.getByText(RAMP, { exact: true })).toBeVisible()
    await app.setVersions(['Original', 'Blurred'])
    await expect(app.studyTile(RAMP, 'Blurred')).toBeVisible()

    await select(GREY)
    await app.openLinesTab()
    await expect(app.linesPanel.getByText(GREY, { exact: true })).toBeVisible()
    await app.setLineSwitch('Rule of thirds', true)
    await app.setLineSwitch('Centre lines', true)
    await app.setLineStyle({ colour: BLUE, widthMm: 1, opacityPct: 80 })
    await app.applyLinesToAll()
    await expect(
      page.getByRole('status').filter({ hasText: 'Line settings copied to 1 image.' }),
    ).toBeAttached()

    await select(RAMP)
    await expect(app.linesPanel.getByText(RAMP, { exact: true })).toBeVisible()
    for (const name of LINE_TYPE_NAMES)
      await expect(app.lineSwitch(name)).toHaveAttribute(
        'aria-checked',
        String(name === 'Rule of thirds' || name === 'Centre lines'),
      )
    await expect(app.lineColour).toHaveValue(BLUE)
    await expect(app.lineSlider('Thickness')).toHaveValue('1')
    await expect(app.lineSlider('Opacity')).toHaveValue('80')
    await app.openStudiesTab()
    await expect(app.versionChip('Blurred')).toHaveAttribute('aria-pressed', 'true')

    // The other way round: the ramp's own lines survive the studies' Apply to all (D7).
    await app.openLinesTab()
    await app.setLineSwitch('Golden ratio', true)
    await select(GREY)
    await app.openStudiesTab()
    await expect(app.studiesPanel.getByText(GREY, { exact: true })).toBeVisible()
    await app.setVersions(['Original', 'Values'])
    await app.applyStudiesToAll()
    await expect(
      page.getByRole('status').filter({ hasText: 'Study settings copied to 1 image.' }),
    ).toBeAttached()
    await expect(app.studyTile(RAMP, 'Values')).toBeVisible()
    await select(RAMP)
    await app.openLinesTab()
    await expect(app.linesPanel.getByText(RAMP, { exact: true })).toBeVisible()
    await expect(app.lineSwitch('Golden ratio')).toHaveAttribute('aria-checked', 'true')
    await select(GREY)
    await expect(app.linesPanel.getByText(GREY, { exact: true })).toBeVisible()
    await expect(app.lineSwitch('Golden ratio')).toHaveAttribute('aria-checked', 'false')

    await app.expectPreviewSettled()
    const { info } = await exported(app)
    const p = firstPage(info)
    expect(p.draws).toHaveLength(4)
    expect(p.lineStrokes).toHaveLength(8)
    for (const s of p.lineStrokes) expect(s.opacity).toBeCloseTo(0.8, 6)
  })

  test('L-D5 a reload remembers the line style, grid size and corner, never the types (owner Q7)', async ({
    page,
  }) => {
    const app = await withPhotos(page)
    await app.setLineSwitch('Grid', true)
    await app.setGrid(3, 3)
    await app.setLineSwitch('Golden spiral', true)
    await app.setSpiralCorner('Bottom left')
    await app.setLineStyle({ colour: '#2a9d3c', widthMm: 0.8, opacityPct: 70 })
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('artistica:settings')))
      .toContain('"opacityPct":70')

    page.on('dialog', (d) => void d.accept())
    await page.reload()
    await expect(app.imageRows).toHaveCount(0)
    await app.upload(FIXTURES.valueRamp)
    await app.expectImages(1)
    await app.openLinesTab()
    await expect(app.linesPanel.getByText(RAMP, { exact: true })).toBeVisible()
    for (const name of LINE_TYPE_NAMES)
      await expect(app.lineSwitch(name)).toHaveAttribute('aria-checked', 'false')
    await expect(app.lineColour).toHaveValue('#2a9d3c')
    await expect(app.lineSlider('Thickness')).toHaveValue('0.8')
    await expect(app.lineSlider('Opacity')).toHaveValue('70')
    await app.setLineSwitch('Grid', true)
    await expect(app.gridField('Columns')).toHaveValue('3')
    await expect(app.gridField('Rows')).toHaveValue('3')
    await app.setLineSwitch('Golden spiral', true)
    await expect(app.spiralCorner('Bottom left')).toHaveAttribute('aria-checked', 'true')
  })

  test('L-D6 keyboard only: reach the Lines tab, switch, type a count, pick a corner, type a colour, move a slider', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000)
    const app = await withPhotos(page)
    // Safari moves focus to buttons with Option+Tab only.
    const TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
    const tabTo = async (target: Locator) => {
      for (let i = 0; i < 30; i++) {
        if (await target.evaluate((el) => el === document.activeElement)) return
        await page.keyboard.press(TAB)
      }
      await expect(target).toBeFocused()
    }
    const linesTab = page.getByRole('tab', { name: 'Lines' })
    const pageTab = page.getByRole('tab', { name: 'Page' })
    await pageTab.click()
    await pageTab.focus()
    await expect(pageTab).toBeFocused()
    await page.keyboard.press('ArrowRight', { delay: 50 })
    await expect(page.getByRole('tab', { name: 'Studies' })).toBeFocused()
    await page.keyboard.press('ArrowRight', { delay: 50 })
    await expect(linesTab).toBeFocused()
    await expect(linesTab).toHaveAttribute('aria-selected', 'true')

    await tabTo(app.lineSwitch('Grid'))
    await page.keyboard.press('Space')
    await expect(app.lineSwitch('Grid')).toHaveAttribute('aria-checked', 'true')
    await tabTo(app.gridField('Columns'))
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('3')
    await page.keyboard.press('Enter')
    await expect(app.gridField('Columns')).toHaveValue('3')
    await tabTo(app.lineSwitch('Golden spiral'))
    await page.keyboard.press('Space')
    await tabTo(app.spiralCorner('Top left'))
    // A plain press moves focus without selecting in chromium (Radix radio group).
    await page.keyboard.press('ArrowRight', { delay: 50 })
    await expect(app.spiralCorner('Top right')).toHaveAttribute('aria-checked', 'true')
    await tabTo(app.lineHex)
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('#1F3FBF')
    await page.keyboard.press('Enter')
    await expect(app.lineHex).toHaveValue(BLUE)
    await expect(app.lineColour).toHaveValue(BLUE)
    await tabTo(app.lineSlider('Thickness'))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(app.lineSlider('Thickness')).toHaveAttribute('aria-valuetext', '0.45 mm')
    await expect(page.locator(':focus-visible')).toHaveCount(1)

    await app.expectPreviewSettled()
    const { info } = await exported(app)
    const tiles = expectedTiles(
      info,
      lineSettings({
        grid: { on: true, cols: 3, rows: 5 },
        spiral: { on: true, corner: 'topRight' },
        style: { colour: BLUE, widthMm: 0.45 },
      }),
    )
    expect(strokeErrors(info, tiles)).toEqual([])
  })

  test('L-D7 the same photos and lines give the same PDF whatever order they are added in', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const grey = readFileSync(FIXTURES.flatGrey)
    const file = (name: string) => ({ name, mimeType: 'image/png', buffer: grey })
    const sheetOf = async (names: string[]): Promise<string> => {
      await app.upload(names.map(file))
      await app.expectImages(2)
      await app.expectPreviewPages(1)
      await app.openLinesTab()
      await app.tile('a.png').click()
      await expect(app.linesPanel.getByText('a.png', { exact: true })).toBeVisible()
      await app.setLineSwitch('Rule of thirds', true)
      await app.setLineSwitch('Golden spiral', true)
      await app.setLineSwitch('Centre lines', true)
      await app.expectPreviewSettled()
      const { info } = await exported(app)
      const r = (n: number) => Math.round(n * 1000) / 1000
      return JSON.stringify(
        info.pages.map((p) => ({
          draws: p.draws.map((d) => [d.xPt, d.yPt, d.wPt, d.hPt].map(r)),
          lines: p.lineStrokes.map((s) => [
            s.clip && [s.clip.x, s.clip.y, s.clip.w, s.clip.h].map(r),
            strokeToMm(s, p.heightPt).map((op) =>
              Object.values(op).map((v) => (typeof v === 'number' ? r(v) : v)),
            ),
          ]),
        })),
      )
    }
    const app = startApp(page)
    await app.goto()
    await page.getByRole('radio', { name: 'mm', exact: true }).click()
    await app.setPaper('A4')
    const first = await sheetOf(['a.png', 'b.png'])
    page.on('dialog', (d) => void d.accept())
    await page.reload()
    await expect(app.imageRows).toHaveCount(0)
    const second = await sheetOf(['b.png', 'a.png'])
    expect(second).toBe(first)
    expect(first).toContain('"lines":[[')
  })

  test('L-D8 lines are print content: they show with the guides off, and print', async ({
    page,
  }) => {
    const app = await withPhotos(page)
    await app.setLineSwitch('Rule of thirds', true)
    await app.setLineStyle(STYLE_1MM)
    await app.setSwitch('Guides', false)
    await expect(page.getByRole('switch', { name: 'Guides' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    await app.expectPreviewSettled()
    expect(
      rgbDistance(await app.tilePixel(app.tile(GREY), 1 / 3, 0.25), hexRgb(BLUE)),
    ).toBeLessThanOrEqual(60)
    const { info } = await exported(app)
    expect(firstPage(info).lineStrokes).toHaveLength(1)
  })

  test('L-D9 with bleed the lines stop at the cut line, in the PDF and the preview', async ({
    page,
  }) => {
    const app = await withPhotos(page)
    await page.getByRole('tab', { name: 'Page' }).click()
    await app.setSwitch('Bleed', true)
    await app.setField('Bleed amount', '3')
    await app.openLinesTab()
    await app.setLineSwitch('Golden spiral', true)
    const style = { ...STYLE_1MM, widthMm: 2 }
    await app.setLineStyle(style)
    await app.expectPreviewSettled()
    const { info } = await exported(app)
    const p = firstPage(info)
    const [draw] = p.draws
    const box = tileBox(draw, info)
    const trim = { x: box.x + 3, y: box.y + 3, w: box.w - 6, h: box.h - 6 }
    const want = tileLinesFor(
      lineSettings({ spiral: { on: true }, style }),
      trim,
      isTurned(draw, FLAT_GREY_W, FLAT_GREY_H),
    )
    expect(strokeErrors(info, [want])).toEqual([])

    // The spiral's outer arc leaves its corner along an edge of the picture, so half of its
    // 2 mm width would lie in the bleed: just inside the edge is the line, just outside the photo.
    const q = firstCurvePoint(want, 0.03)
    const edges = [
      { d: q.y - trim.y, out: { x: q.x, y: trim.y - 0.5 }, in: { x: q.x, y: trim.y + 0.5 } },
      {
        d: trim.y + trim.h - q.y,
        out: { x: q.x, y: trim.y + trim.h + 0.5 },
        in: { x: q.x, y: trim.y + trim.h - 0.5 },
      },
      { d: q.x - trim.x, out: { x: trim.x - 0.5, y: q.y }, in: { x: trim.x + 0.5, y: q.y } },
      {
        d: trim.x + trim.w - q.x,
        out: { x: trim.x + trim.w + 0.5, y: q.y },
        in: { x: trim.x + trim.w - 0.5, y: q.y },
      },
    ].sort((a, b) => a.d - b.d)
    const edge = edges[0]
    expect(edge.d).toBeLessThan(0.3)
    const [inside, bleed] = await pixelsAt(app, await pxPerMm(app, info), [edge.in, edge.out])
    expect(rgbDistance(inside, hexRgb(BLUE))).toBeLessThanOrEqual(60)
    expect(rgbDistance(bleed, FLAT_GREY_RGB)).toBeLessThanOrEqual(30)
  })

  test('L-D10 a line toggle on the selected photo of 20 redraws the preview fast (recorded; CI bound 1000 ms)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page, [
      FIXTURES.flatGrey,
      ...Array<string>(19).fill(FIXTURES.quadrantsJpg),
    ])
    await app.tile(GREY).click()
    await expect(app.linesPanel.getByText(GREY, { exact: true })).toBeVisible()
    await app.expectPreviewSettled()
    const tile = await app.tile(GREY).boundingBox()
    const figure = app.tile(GREY).locator('xpath=ancestor::figure')
    const canvas = await figure.locator('canvas').boundingBox()
    if (!tile || !canvas) throw new Error('tile or sheet not laid out')
    const fx = (tile.x + tile.width / 3 - canvas.x) / canvas.width
    const fy = (tile.y + tile.height / 4 - canvas.y) / canvas.height
    await figure.locator('canvas').evaluate(
      (c: TimedCanvas, [x, y, grey]: [number, number, number[]]) => {
        const w = globalThis as unknown as TimerWindow
        const g = c.getContext('2d')
        if (!g) throw new Error('canvas is not 2d')
        const t = { start: 0, end: 0 }
        w.__lineTimer = t
        w.document.addEventListener(
          'click',
          () => {
            t.start = w.performance.now()
            const tick = () => {
              const d = g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data
              const far = Math.hypot(d[0] - grey[0], d[1] - grey[1], d[2] - grey[2])
              if (far > 60) t.end = w.performance.now()
              else w.requestAnimationFrame(tick)
            }
            w.requestAnimationFrame(tick)
          },
          { capture: true, once: true },
        )
      },
      [fx, fy, [...FLAT_GREY_RGB]] as [number, number, number[]],
    )
    await app.lineSwitch('Rule of thirds').click()
    const read = () =>
      page.evaluate(() => {
        const t = (globalThis as unknown as TimerWindow).__lineTimer
        return t && t.end > 0 ? t.end - t.start : null
      })
    await expect.poll(read, { timeout: 5_000 }).not.toBeNull()
    const ms = Math.round((await read()) ?? NaN)
    testInfo.annotations.push({ type: 'line-toggle-preview-ms', description: String(ms) })
    console.log(`line toggle preview ms (${testInfo.project.name}): ${String(ms)}`)
    expect(ms).toBeLessThan(1000)
  })

  test('L-D11 the colour input takes a typed hex in every engine and stores it lowercase', async ({
    page,
  }) => {
    const app = await withPhotos(page)
    await app.setLineSwitch('Centre lines', true)
    await app.lineColour.fill('#1f3fbf')
    await expect(app.lineHex).toHaveValue('#1f3fbf')
    const storedColour = () =>
      page.evaluate(
        () =>
          (
            JSON.parse(localStorage.getItem('artistica:settings') ?? '{}') as {
              state?: { lineDefaults?: { style?: { colour?: string } } }
            }
          ).state?.lineDefaults?.style?.colour,
      )
    await expect.poll(storedColour).toBe('#1f3fbf')
    await app.lineColour.fill('#AABBCC')
    await expect(app.lineHex).toHaveValue('#aabbcc')
    await expect.poll(storedColour).toBe('#aabbcc')
    await app.expectPreviewSettled()
    const { info } = await exported(app)
    const [stroke] = firstPage(info).lineStrokes
    expect(stroke.colour.values.map((v) => Math.round(v * 255))).toEqual([0xaa, 0xbb, 0xcc])
  })
})

interface TimedCanvas {
  width: number
  height: number
  getContext(id: '2d'): {
    getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
  } | null
}
interface TimerWindow {
  __lineTimer?: { start: number; end: number }
  performance: { now(): number }
  requestAnimationFrame(cb: () => void): void
  document: {
    addEventListener(type: string, cb: () => void, opts: { capture: boolean; once: boolean }): void
  }
}
declare const document: { activeElement: unknown }
declare const localStorage: { getItem(key: string): string | null }
