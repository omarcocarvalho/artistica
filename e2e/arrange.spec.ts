import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import {
  ArrangeArea,
  expectedMarks,
  pdfMarksMm,
  rectMismatches,
  sameRect,
  segmentMismatches,
  type PlacedBox,
  type PreviewSheet,
  type RectMm,
} from './support/arrange.ts'
import { FIXTURES } from './support/fixtures.ts'
import { announcements, exportSettled, watchAnnouncements } from './support/guides.ts'
import {
  isTurned,
  lineSettings,
  strokeMismatches,
  tileLinesFor,
  trimOf,
  type TileLines,
} from './support/line-geometry.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import {
  strokeToMm,
  summarizePdf,
  type MmPathOp,
  type PdfStroke,
  type PdfSummary,
} from './support/pdf.ts'
import { runOnly } from './support/projects.ts'
import { arm, installPerfProbe, readUpdate } from './support/perf.ts'
import { mixedJpegs, syntheticJpegs, type UploadFile } from './support/synthetic.ts'

test.use({ viewport: { width: 1280, height: 1400 } })

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

const SAFE_AREA_MM = 5
const PORTRAIT = { name: 'portrait.jpg', pxW: 1361, pxH: 2048 }

/** Synthetic photos whose shapes all differ, even turned, so no two tie in the packer. */
const SHAPES = [
  { name: 'a-4x3.jpg', pxW: 1600, pxH: 1200 },
  { name: 'b-16x9.jpg', pxW: 1600, pxH: 900 },
  { name: 'c-1x1.jpg', pxW: 1600, pxH: 1600 },
  { name: 'd-5x4.jpg', pxW: 1600, pxH: 1280 },
  { name: 'e-16x10.jpg', pxW: 1600, pxH: 1000 },
  { name: 'f-7x5.jpg', pxW: 1600, pxH: 1143 },
  { name: 'g-2x1.jpg', pxW: 1600, pxH: 800 },
  { name: 'h-5x3.jpg', pxW: 1600, pxH: 960 },
] as const

async function shapes(page: Page, n: number): Promise<UploadFile[]> {
  const out: UploadFile[] = []
  for (const s of SHAPES.slice(0, n)) {
    const file = (await syntheticJpegs(page, 1, s.pxW, s.pxH)).at(0)
    if (!file) throw new Error('no synthetic photo')
    out.push({ ...file, name: s.name })
  }
  return out
}

function photoSize(file: string): { pxW: number; pxH: number } {
  const shape = file === PORTRAIT.name ? PORTRAIT : SHAPES.find((s) => s.name === file)
  if (!shape) throw new Error(`unknown photo ${file}`)
  return shape
}

async function start(page: Page): Promise<{ app: AppPage; arrange: ArrangeArea }> {
  guard = guardNetwork(page)
  const app = new AppPage(page)
  await app.goto()
  await page.getByRole('radio', { name: 'mm', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'mm', exact: true })).toBeChecked()
  return { app, arrange: new ArrangeArea(page) }
}

/** One photo at a time, so the list (and the layout's tie-breaks) keep this order. */
async function load(app: AppPage, files: readonly (string | UploadFile)[]): Promise<void> {
  const before = await app.imageRows.count()
  for (const [i, f] of files.entries()) {
    await app.upload(f)
    await app.expectImages(before + i + 1)
  }
  await app.expectPreviewPages(1)
  await app.expectPreviewSettled()
}

/** portrait.jpg and five shapes, a-4x3.jpg and b-16x9.jpg with three study versions. */
async function sixPhotos(page: Page, app: AppPage): Promise<void> {
  await load(app, [FIXTURES.portraitJpg, ...(await shapes(page, 5))])
  await app.openStudiesTab()
  for (const name of ['a-4x3.jpg', 'b-16x9.jpg']) {
    await app.selectButton(name).click()
    await app.setVersions(['Original', 'Blurred', 'Values'])
  }
  await app.expectPreviewSettled()
}

const THIRDS = lineSettings({ thirds: true })

/** The base file name of a tile button ("name" or "name, Version"). */
const fileOf = (tileName: string) => tileName.split(', ')[0] ?? tileName

type PdfPage = PdfSummary['pages'][number]

interface DrawnTile {
  readonly file: string
  readonly trim: RectMm
  /** The pure thirds geometry for this trim. */
  readonly thirds: TileLines
  /** The PDF strokes drawn for this tile: lines are batched per tile, in draw order. */
  readonly strokes: readonly PdfStroke[]
}

/** The page's tiles as drawn in the PDF, each named by the preview tile with the same trim. */
function drawnTiles(sheet: PreviewSheet, p: PdfPage): DrawnTile[] {
  const tiles = p.draws.map((d) => {
    const trim = trimOf(d, p.heightPt)
    const file = fileOf(sheet.boxes.find((b) => sameRect(b.rect, trim))?.name ?? '')
    const size = photoSize(file)
    return { file, trim, thirds: tileLinesFor(THIRDS, trim, isTurned(d, size.pxW, size.pxH)) }
  })
  let at = 0
  return tiles.map((t) => {
    const strokes = p.lineStrokes.slice(at, at + t.thirds.strokes.length)
    at += t.thirds.strokes.length
    return { ...t, strokes }
  })
}

/** Maps a path from one trim box to another (the geometry is relative to the tile). */
function mapOps(ops: readonly MmPathOp[], from: RectMm, to: RectMm): MmPathOp[] {
  const sx = to.w / from.w
  const sy = to.h / from.h
  const x = (v: number) => to.x + (v - from.x) * sx
  const y = (v: number) => to.y + (v - from.y) * sy
  return ops.map((o) =>
    o.op === 'C'
      ? { op: 'C', x1: x(o.x1), y1: y(o.y1), x2: x(o.x2), y2: y(o.y2), x: x(o.x), y: y(o.y) }
      : { op: o.op, x: x(o.x), y: y(o.y) },
  )
}

function opsClose(a: readonly MmPathOp[], b: readonly MmPathOp[], tol: number): boolean {
  if (a.length !== b.length) return false
  return a.every((o, i) => {
    const p = b.at(i)
    if (p?.op !== o.op) return false
    const ka = Object.values(o).filter((v) => typeof v === 'number')
    const kb = Object.values(p).filter((v) => typeof v === 'number')
    return ka.every((v, k) => Math.abs(v - (kb[k] ?? NaN)) <= tol)
  })
}

const GUTTER_MM = 6

/** Pairs of blocks on one page whose trim boxes are closer than the gutter (M5-R9). */
function gutterViolations(boxes: readonly PlacedBox[], gutter: number): string[] {
  const out: string[] = []
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      if (a.page !== b.page) continue
      const apart =
        a.rect.x + a.rect.w + gutter <= b.rect.x + 0.01 ||
        b.rect.x + b.rect.w + gutter <= a.rect.x + 0.01 ||
        a.rect.y + a.rect.h + gutter <= b.rect.y + 0.01 ||
        b.rect.y + b.rect.h + gutter <= a.rect.y + 0.01
      if (!apart) out.push(`${a.name} and ${b.name} on page ${String(a.page + 1)}`)
    }
  })
  return out
}

const rectOf = (boxes: readonly PlacedBox[], file: string): PlacedBox => {
  const b = boxes.find((x) => x.name === file)
  if (!b) throw new Error(`no box for ${file}`)
  return b
}

test.describe('manual layout, preview equals PDF (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('B-X1 after a move, a swap, a resize and a move to page 2, the PDF equals the preview: images, crop marks, lines and guides', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { app, arrange } = await start(page)
    await sixPhotos(page, app)
    await app.openLinesTab()
    await app.setLineSwitch('Rule of thirds', true)
    await app.applyLinesToAll()
    await app.selectButton(PORTRAIT.name).click()
    await app.openGuides()
    await app.setGuide('edges', true)
    const before = await summarizePdf(await exportSettled(app, ['edges']))
    const autoSheets = await arrange.sheets()

    await arrange.enter()
    const start0 = await arrange.blockBoxes()
    expect(start0.map((b) => b.name).sort()).toEqual([
      'a-4x3.jpg',
      'b-16x9.jpg',
      'c-1x1.jpg',
      'd-5x4.jpg',
      'e-16x10.jpg',
      PORTRAIT.name,
    ])

    // Resize: the bottom-right handle of e-16x10 (page 1), its top-left corner fixed.
    const e0 = rectOf(start0, 'e-16x10.jpg')
    expect(e0.page).toBe(0)
    await arrange.block('e-16x10.jpg').click()
    await arrange.dragHandle('e-16x10.jpg', 'br', -e0.rect.w / 2, -e0.rect.h / 2)
    await arrange.expectAnnouncement(/^e-16x10\.jpg, .*, page 1, /)
    const e1 = await arrange.blockOf('e-16x10.jpg')
    expect(e1.rect.w).toBeLessThan(e0.rect.w * 0.6)
    expect(e1.rect.x).toBeCloseTo(e0.rect.x, 3)
    expect(e1.rect.y).toBeCloseTo(e0.rect.y, 3)

    // Move to page 2: the toolbar's single-pointer control for the selected photo.
    await arrange.moveToPage.selectOption({ label: 'Page 2' })
    await arrange.expectAnnouncement(/^e-16x10\.jpg, .*, page 2, /)
    expect((await arrange.blockOf('e-16x10.jpg')).page).toBe(1)

    // Move: drag portrait.jpg up its column, into the room e-16x10 left.
    const p0 = await arrange.blockOf(PORTRAIT.name)
    expect(p0.page).toBe(0)
    await arrange.dragBlockTo(PORTRAIT.name, 0, p0.rect.x, 40)
    await arrange.expectAnnouncement(/^portrait\.jpg, .*, page 1, /)
    const p1 = await arrange.blockOf(PORTRAIT.name)
    expect(p1.page).toBe(0)
    expect(Math.abs(p1.rect.y - 40)).toBeLessThanOrEqual(2)
    expect(p1.rect.w).toBeCloseTo(p0.rect.w, 3)

    // Swap: drop c-1x1 on d-5x4's centre (both on page 2).
    const c0 = await arrange.blockOf('c-1x1.jpg')
    const d0 = await arrange.blockOf('d-5x4.jpg')
    expect([c0.page, d0.page]).toEqual([1, 1])
    await arrange.dragBlockTo(
      'c-1x1.jpg',
      1,
      d0.rect.x + (d0.rect.w - c0.rect.w) / 2,
      d0.rect.y + (d0.rect.h - c0.rect.h) / 2,
    )
    await arrange.expectAnnouncement(/^c-1x1\.jpg, .*, page 2, /)
    const c1 = await arrange.blockOf('c-1x1.jpg')
    const d1 = await arrange.blockOf('d-5x4.jpg')
    expect(c1.rect.x).toBeCloseTo(d0.rect.x, 3)
    expect(c1.rect.y).toBeCloseTo(d0.rect.y, 3)
    expect(d1.rect.x).toBeCloseTo(c0.rect.x, 3)
    expect(d1.rect.y).toBeCloseTo(c0.rect.y, 3)

    const arranged = await arrange.blockBoxes()
    await arrange.exit()
    await app.expectPreviewSettled()
    const sheets = await arrange.sheets()
    const after = await summarizePdf(await exportSettled(app, ['edges']))

    // Images: one placement per preview hit area, equal within 0.01 mm, page by page.
    expect(after.pageCount).toBe(sheets.length)
    const errors: string[] = []
    after.pages.forEach((p, i) => {
      const sheet = sheets.at(i)
      if (!sheet) throw new Error(`no preview page ${String(i + 1)}`)
      expect(p.widthPt / (72 / 25.4)).toBeCloseTo(sheet.size.w, 2)
      errors.push(
        ...rectMismatches(
          `page ${String(i + 1)} images`,
          p.draws.map((d) => trimOf(d, p.heightPt)),
          sheet.boxes.map((b) => b.rect),
        ),
      )
      errors.push(
        ...segmentMismatches(
          pdfMarksMm(p),
          expectedMarks(
            sheet.boxes.map((b) => b.rect),
            sheet.size,
            SAFE_AREA_MM,
          ),
        ).map((m) => `page ${String(i + 1)}: ${m}`),
      )
    })
    expect(errors).toEqual([])

    // The tiles sit inside the blocks the arrangement showed (every version of a photo together).
    for (const s of sheets)
      for (const t of s.boxes) {
        const b = rectOf(arranged, fileOf(t.name))
        expect(b.page, t.name).toBe(t.page)
        expect(t.rect.x).toBeGreaterThanOrEqual(b.rect.x - 0.01)
        expect(t.rect.y).toBeGreaterThanOrEqual(b.rect.y - 0.01)
        expect(t.rect.x + t.rect.w).toBeLessThanOrEqual(b.rect.x + b.rect.w + 0.01)
        expect(t.rect.y + t.rect.h).toBeLessThanOrEqual(b.rect.y + b.rect.h + 0.01)
      }

    // Lines: every tile but portrait.jpg's draws the pure thirds geometry for its new trim.
    // portrait.jpg (thirds and the edge outline) draws what it drew before, mapped to its new trim.
    const portraitBefore = autoSheets.flatMap((s) => s.boxes).find((b) => b.name === PORTRAIT.name)
    const beforePage = before.pages.at(portraitBefore?.page ?? -1)
    const autoSheet = autoSheets.at(portraitBefore?.page ?? -1)
    if (!beforePage || !autoSheet) throw new Error('portrait was not on a page before')
    const was = drawnTiles(autoSheet, beforePage).find((t) => t.file === PORTRAIT.name)
    if (!was) throw new Error('portrait was not drawn before')
    const wasOps = was.strokes.map((st) => strokeToMm(st, beforePage.heightPt))
    const cmds = (ops: readonly (readonly unknown[])[]) => ops.reduce((n, o) => n + o.length, 0)
    expect(cmds(wasOps), 'the edge outline is drawn with the thirds').toBeGreaterThan(
      cmds(was.thirds.strokes.map((st) => st.cmds)),
    )
    const lineErrors: string[] = []
    let portraitDrawn = 0
    for (const [i, p] of after.pages.entries()) {
      const sheet = sheets.at(i)
      if (!sheet) continue
      for (const t of drawnTiles(sheet, p)) {
        if (t.file !== PORTRAIT.name) {
          lineErrors.push(
            ...strokeMismatches(t.strokes, t.thirds, p.heightPt).map(
              (m) => `page ${String(i + 1)} ${t.file}: ${m}`,
            ),
          )
          continue
        }
        portraitDrawn++
        expect(t.strokes).toHaveLength(wasOps.length)
        wasOps.forEach((ops, j) => {
          const got = t.strokes.at(j)
          if (!got || !opsClose(strokeToMm(got, p.heightPt), mapOps(ops, was.trim, t.trim), 0.01))
            lineErrors.push(`portrait stroke ${String(j)} did not follow its tile`)
        })
      }
    }
    expect(lineErrors).toEqual([])
    expect(portraitDrawn).toBe(1)
  })
})

/** Shrinks, moves across pages, nudges, swaps and drags: the same script gives the same pages. */
async function arrangeScript(app: AppPage, arrange: ArrangeArea): Promise<void> {
  await arrange.enter()
  await arrange.block('e-16x10.jpg').click()
  await arrange.width.fill('40')
  await arrange.width.press('Enter')
  await arrange.expectAnnouncement(/^e-16x10\.jpg, 25 × 40 mm, page 1, /)
  await arrange.moveToPage.selectOption({ label: 'Page 2' })
  await arrange.expectAnnouncement(/^e-16x10\.jpg, .*, page 2, /)
  await arrange.block(PORTRAIT.name).focus()
  for (let i = 0; i < 5; i++) await app.page.keyboard.press('ArrowUp')
  await arrange.expectAnnouncement(/^portrait\.jpg, .*, page 1, .*, 117 mm from the top\.$/)
  await arrange.block('c-1x1.jpg').focus()
  await app.page.keyboard.press('Enter')
  await arrange.block('d-5x4.jpg').focus()
  await app.page.keyboard.press('Enter')
  await arrange.expectAnnouncement(/^c-1x1\.jpg, .*, page 2, /)
  const p = await arrange.blockOf(PORTRAIT.name)
  await arrange.dragBlockTo(PORTRAIT.name, 0, p.rect.x, 40)
  await arrange.expectAnnouncement(/^portrait\.jpg, .*, 40 mm from the top\.$/)
  await arrange.exit()
  await app.expectPreviewSettled()
}

async function pdfBytes(app: AppPage): Promise<Buffer> {
  await app.expectPreviewSettled()
  await expect(app.exportButton).toBeEnabled()
  const { bytes } = await app.exportPdf()
  await app.page.keyboard.press('Escape')
  await expect(app.page.getByRole('dialog')).toHaveCount(0)
  return bytes
}

test.describe('manual layout, determinism and re-run (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('B-D1 the same photos and the same arranging in two fresh contexts give byte-identical PDFs', async ({
    browser,
    page,
  }) => {
    test.setTimeout(300_000)
    const photos = await shapes(page, 5)
    const runs: Buffer[] = []
    for (let k = 0; k < 2; k++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } })
      try {
        const tab = await context.newPage()
        const own = guardNetwork(tab)
        const app = new AppPage(tab)
        await app.goto()
        await tab.getByRole('radio', { name: 'mm', exact: true }).click()
        await load(app, [FIXTURES.portraitJpg, ...photos])
        await app.openStudiesTab()
        for (const name of ['a-4x3.jpg', 'b-16x9.jpg']) {
          await app.selectButton(name).click()
          await app.setVersions(['Original', 'Blurred', 'Values'])
        }
        await app.expectPreviewSettled()
        await arrangeScript(app, new ArrangeArea(tab))
        runs.push(await pdfBytes(app))
        expect(own.violations()).toEqual([])
      } finally {
        await context.close()
      }
    }
    const a = runs.at(0)
    const b = runs.at(1)
    if (!a || !b) throw new Error('two runs expected')
    expect(a.includes('/CreationDate')).toBe(false)
    expect(a.includes('/ModDate')).toBe(false)
    expect(b.equals(a)).toBe(true)
    const info = await summarizePdf(a)
    expect(info.pageCount).toBe(2)
    expect(info.pages.map((p) => p.draws.length)).toEqual([4, 6])
  })

  test('B-D2 Re-run auto layout (confirmed) gives the automatic PDF byte for byte', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { app, arrange } = await start(page)
    await sixPhotos(page, app)
    const auto = await pdfBytes(app)
    await expect(arrange.rerun).toBeDisabled()
    await arrangeScript(app, arrange)
    const arranged = await pdfBytes(app)
    expect(arranged.equals(auto)).toBe(false)

    await arrange.rerun.click()
    const dialog = page.getByRole('dialog', {
      name: 'Re-run auto layout? Your moves and size changes will be lost.',
    })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(arrange.rerun).toBeEnabled()
    expect((await pdfBytes(app)).equals(arranged)).toBe(true)

    await arrange.rerunAuto()
    await arrange.expectAnnouncement('Photos arranged automatically.')
    await expect(arrange.undo).toBeDisabled()
    expect((await pdfBytes(app)).equals(auto)).toBe(true)
  })
})

test.describe('manual layout through photo and setting changes (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('B-D3 added photos pack around the arranged ones, a removed photo leaves its gap (M5-R14)', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { app, arrange } = await start(page)
    const photos = await shapes(page, 8)
    await load(app, photos.slice(0, 4))
    await arrange.enter()
    await arrange.block('c-1x1.jpg').focus()
    await page.keyboard.press('ArrowDown')
    await arrange.expectAnnouncement(/^c-1x1\.jpg, .*, 132 mm from the top\.$/)
    const arranged = await arrange.blockBoxes()
    expect((await arrange.sheets()).length).toBe(1)

    await load(app, photos.slice(4))
    await expect(arrange.blocks).toHaveCount(8)
    await app.expectPreviewSettled()
    const after = await arrange.blockBoxes()
    const added = after.filter((b) => !arranged.some((a) => a.name === b.name))
    expect(added.map((b) => b.name).sort()).toEqual(photos.slice(4).map((f) => f.name))
    expect(
      added.some((b) => b.page === 0),
      'free space on page 1 is used first',
    ).toBe(true)
    expect(
      added.some((b) => b.page === 1),
      'then a new page',
    ).toBe(true)
    expect((await arrange.sheets()).length).toBe(2)
    expect(gutterViolations(after, GUTTER_MM)).toEqual([])
    for (const b of arranged) {
      const now = rectOf(after, b.name)
      expect(now.page, b.name).toBe(b.page)
      expect(sameRect(now.rect, b.rect), b.name).toBe(true)
    }
    await expect(arrange.rerun).toBeEnabled()

    const gone = rectOf(after, 'c-1x1.jpg')
    await app.removeButton('c-1x1.jpg').click()
    await expect(arrange.blocks).toHaveCount(7)
    await app.expectPreviewSettled()
    const left = await arrange.blockBoxes()
    for (const b of after.filter((x) => x.name !== gone.name)) {
      const now = rectOf(left, b.name)
      expect(now.page, b.name).toBe(b.page)
      expect(sameRect(now.rect, b.rect), b.name).toBe(true)
    }
    await expect(arrange.rerun).toBeEnabled()
  })
})

test.describe('manual layout, settings and refusals (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('B-D4 a gutter that still fits keeps the arrangement; wider margins, a new paper and new study versions follow M5-R14', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { app, arrange } = await start(page)
    await load(app, await shapes(page, 4))
    const shrink = async (file: string, width: string) => {
      await arrange.enter()
      await arrange.block(file).click()
      await arrange.width.fill(width)
      await arrange.width.press('Enter')
      await arrange.expectAnnouncement(new RegExp(`^${file.replace('.', '\\.')}, `))
      await expect(arrange.rerun).toBeEnabled()
      await app.expectPreviewSettled()
    }
    const marginsNotice = app.notices.getByText(
      'Your arrangement no longer fits the new margins, so the photos were arranged automatically again.',
    )
    const paperNotice = app.notices.getByText(
      'The paper changed, so the photos were arranged automatically again.',
    )

    await shrink('a-4x3.jpg', '60')
    const kept = await arrange.blockBoxes()
    await app.openPageTab()
    await app.setField('Gutter size', '4')
    await app.expectPreviewSettled()
    expect(await arrange.blockBoxes()).toEqual(kept)
    await expect(arrange.rerun).toBeEnabled()
    await expect(marginsNotice).toHaveCount(0)

    await app.setField('Safe area', '8')
    await expect(marginsNotice).toBeVisible()
    await expect(arrange.rerun).toBeDisabled()
    await expect(arrange.undo).toBeDisabled()
    await app.expectPreviewSettled()
    for (const b of await arrange.blockBoxes()) expect(b.rect.x).toBeGreaterThanOrEqual(13 - 0.01)

    await shrink('a-4x3.jpg', '50')
    await app.setPaper('A5')
    await expect(paperNotice).toBeVisible()
    await expect(arrange.rerun).toBeDisabled()
    await expect(arrange.undo).toBeDisabled()
    await app.expectPreviewSettled()
    for (const s of await arrange.sheets()) expect(s.size).toEqual({ w: 148, h: 210 })

    await shrink('a-4x3.jpg', '40')
    const before = await arrange.blockBoxes()
    const box = rectOf(before, 'c-1x1.jpg')
    await app.selectButton('c-1x1.jpg').click()
    await app.openStudiesTab()
    await app.setVersions(['Original', 'Blurred'])
    await expect
      .poll(async () => (await arrange.blockOf('c-1x1.jpg')).rect.h)
      .not.toBeCloseTo(box.rect.h, 3)
    await app.expectPreviewSettled()
    const refitted = await arrange.blockOf('c-1x1.jpg')
    expect(refitted.page).toBe(box.page)
    expect(refitted.rect.x).toBeCloseTo(box.rect.x, 2)
    expect(refitted.rect.y).toBeCloseTo(box.rect.y, 2)
    expect(refitted.rect.w).toBeLessThanOrEqual(box.rect.w + 0.01)
    expect(refitted.rect.h).toBeLessThanOrEqual(box.rect.h + 0.01)
    const others = (await arrange.blockBoxes()).filter((b) => b.name !== 'c-1x1.jpg')
    expect(others).toEqual(before.filter((b) => b.name !== 'c-1x1.jpg'))
    await expect(arrange.rerun).toBeEnabled()
  })

  test('B-D5 a drop past the margin, a resize into a neighbour and a fixed-size swap that does not fit are refused, said once, and leave the arrangement and Undo as they were', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { app, arrange } = await start(page)
    await load(app, [FIXTURES.portraitJpg, ...(await shapes(page, 5))])
    const fixed = 'c-1x1.jpg'
    await app.editButton(fixed).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio', { name: 'Fixed' }).click()
    await sheet.getByRole('radio', { name: 'Width' }).click()
    await sheet.getByRole('spinbutton', { name: 'Width' }).fill('100')
    await sheet.getByRole('spinbutton', { name: 'Width' }).blur()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
    await app.expectPreviewSettled()

    await arrange.enter()
    await watchAnnouncements(arrange.liveRegion)
    const auto = await arrange.blockBoxes()
    const big = rectOf(auto, fixed)
    expect(big.rect.w).toBeCloseTo(100, 3)
    // X sits a gutter under Y; neither is the fixed photo, which has no handles.
    const pair = auto
      .flatMap((x) => auto.map((y) => ({ x, y })))
      .find(
        ({ x, y }) =>
          x.name !== fixed &&
          x.page === y.page &&
          Math.abs(y.rect.y + y.rect.h + GUTTER_MM - x.rect.y) < 0.01 &&
          Math.min(x.rect.x + x.rect.w, y.rect.x + y.rect.w) - Math.max(x.rect.x, y.rect.x) > 1,
      )
    if (!pair) throw new Error('no photo sits a gutter under another')
    const small = auto.find(
      (b) => b.name !== fixed && (b.rect.w < big.rect.w - 0.01 || b.rect.h < big.rect.h - 0.01),
    )
    if (!small) throw new Error('no place smaller than the fixed photo')
    const other = auto.find((b) => ![fixed, pair.x.name, pair.y.name, small.name].includes(b.name))
    if (!other) throw new Error('no photo left for the valid change')

    await arrange.block(other.name).click()
    await arrange.width.fill('40')
    await arrange.width.press('Enter')
    const placed = new RegExp(`^${other.name.replace('.', '\\.')}, [\\d.]+ × [\\d.]+ mm, page `)
    await arrange.expectAnnouncement(placed)
    await expect(arrange.undo).toBeEnabled()
    await app.expectPreviewSettled()
    const shown = await arrange.blockBoxes()

    // Past the margin: the ghost turns invalid while dragged and the drop is refused.
    await arrange.block(small.name).scrollIntoViewIfNeeded()
    const a = await arrange.sheetBox(small.page)
    const x0 = a.x + (small.rect.x + small.rect.w / 2) * a.ppm
    const y0 = a.y + (small.rect.y + small.rect.h / 2) * a.ppm
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.mouse.move(a.x + (-30 + small.rect.w / 2) * a.ppm, y0, { steps: 12 })
    await expect(arrange.ghost).toHaveClass(/is-invalid/)
    await page.mouse.up()
    await expect(arrange.ghost).toHaveCount(0)
    await arrange.expectAnnouncement("Can't place it there: it would go past the margin.")
    expect(await arrange.blockBoxes()).toEqual(shown)

    // Into a neighbour: X's top-left handle, up and left into Y's gutter.
    await arrange.block(pair.x.name).click()
    await arrange.dragHandle(pair.x.name, 'tl', -15, -15)
    await arrange.expectAnnouncement(
      "Can't make it bigger: another photo or the margin is in the way.",
    )
    expect(await arrange.blockBoxes()).toEqual(shown)

    // A fixed size keeps its size, so it cannot take a smaller place.
    await arrange.block(fixed).click()
    await arrange.swapWith.selectOption({ label: `${small.name}, page ${String(small.page + 1)}` })
    await arrange.expectAnnouncement("Can't swap: a photo doesn't fit the other one's place.")
    expect(await arrange.blockBoxes()).toEqual(shown)

    const log = await announcements(page)
    expect(log).toHaveLength(4)
    expect(log[0]).toMatch(placed)
    expect(log.slice(1)).toEqual([
      "Can't place it there: it would go past the margin.",
      "Can't make it bigger: another photo or the margin is in the way.",
      "Can't swap: a photo doesn't fit the other one's place.",
    ])

    // One undo step: the width change. The refusals added none.
    await expect(arrange.undo).toBeEnabled()
    await arrange.undo.click()
    await arrange.expectAnnouncement('Undone.')
    await expect(arrange.undo).toBeDisabled()
    await app.expectPreviewSettled()
    expect(await arrange.blockBoxes()).toEqual(auto)
  })
})

interface FocusProbe {
  readonly name: string
  readonly visible: boolean
  readonly unobscured: boolean
}
interface FocusDoc {
  activeElement: FocusEl | null
  elementFromPoint(x: number, y: number): FocusEl | null
}
interface FocusEl {
  tagName: string
  textContent: string | null
  getAttribute(n: string): string | null
  matches(sel: string): boolean
  contains(other: FocusEl | null): boolean
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
}

/** The focused element: its name, whether it shows a focus indicator, and whether it is on top. */
async function focusProbe(page: Page): Promise<FocusProbe> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      document: FocusDoc
      innerHeight: number
      innerWidth: number
      getComputedStyle(el: FocusEl): {
        outlineStyle: string
        outlineWidth: string
        boxShadow: string
      }
    }
    const el = g.document.activeElement
    if (!el) return { name: '', visible: false, unobscured: false }
    const s = g.getComputedStyle(el)
    const ring =
      (s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const inView = cx >= 0 && cy >= 0 && cx <= g.innerWidth && cy <= g.innerHeight
    const top = g.document.elementFromPoint(cx, cy)
    return {
      name: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
      visible: el.matches(':focus-visible') && ring,
      unobscured: inView && (top === el || el.contains(top)),
    }
  })
}

test.describe('manual layout by keyboard only (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('B-D6 Tab to Arrange, arrows, Shift + arrows, Enter to swap and the toolbar: focus shown and on top, announcements in order, axe-clean', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(240_000)
    const { app, arrange } = await start(page)
    await load(app, [FIXTURES.portraitJpg, ...(await shapes(page, 3))])
    await watchAnnouncements(arrange.liveRegion)
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
    const back = browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab'
    const steps: FocusProbe[] = []
    const press = async (key: string) => {
      await page.keyboard.press(key)
      steps.push(await focusProbe(page))
    }

    await page.locator('body').click({ position: { x: 2, y: 2 } })
    for (let i = 0; i < 40 && (await focusProbe(page)).name !== 'Arrange'; i++)
      await page.keyboard.press(tab)
    expect((await focusProbe(page)).name).toBe('Arrange')
    await press('Enter')
    await expect(arrange.toggle).toHaveAttribute('aria-pressed', 'true')
    await press(tab)
    expect(steps.at(-1)?.name).toMatch(/^portrait\.jpg, /)
    for (const key of [
      'ArrowRight',
      'Shift+ArrowLeft',
      'Shift+ArrowLeft',
      'ArrowRight',
      'ArrowDown',
      'Shift+ArrowRight',
    ])
      await press(key)
    await press('Enter')
    await press(tab)
    const partner = fileOf(steps.at(-1)?.name ?? '')
    expect(partner).toMatch(/^[a-c]-\w+\.jpg$/)
    await press('Enter')
    await expect(arrange.block(PORTRAIT.name)).toBeFocused()
    await app.expectPreviewSettled()
    await press('Control+z')
    await expect(arrange.block(PORTRAIT.name)).toBeFocused()
    await app.expectPreviewSettled()

    // The selected photo's toolbar controls, reached backwards: focus selects each block it
    // crosses, so they act on the first block in reading order.
    for (let i = 0; i < 6 && steps.at(-1)?.name !== 'Move right'; i++) await press(back)
    await expect(arrange.nudgeButton('Move right')).toBeFocused()
    const label = (await arrange.selectedGroup.getAttribute('aria-label')) ?? ''
    const target = label.replace(/^Selected photo: /, '')
    const first = (await arrange.blockBoxes()).at(0)
    expect(target).toBe(first?.name)
    const other = target === PORTRAIT.name ? partner : PORTRAIT.name
    const otherBox = await arrange.blockOf(other)
    const esc = (f: string) => f.replace('.', '\\.')
    await press('Space')
    await arrange.expectAnnouncement(new RegExp(`^${esc(target)}, .*, page 1, `))
    for (let i = 0; i < 4; i++) await press(back)
    await expect(arrange.width).toBeFocused()
    await arrange.width.fill('60')
    await press('Enter')
    await arrange.expectAnnouncement(new RegExp(`^${esc(target)}, (60 × |[\\d.]+ × 60 mm)`))
    await press(back)
    await expect(arrange.swapWith).toBeFocused()
    await arrange.swapWith.selectOption({ label: `${other}, page 1` })
    await expect
      .poll(async () => (await arrange.blockOf(target)).rect.x)
      .toBeCloseTo(otherBox.rect.x, 3)
    await press(back)
    await expect(arrange.moveToPage).toBeFocused()
    await arrange.moveToPage.selectOption({ label: 'New page' })
    await arrange.expectAnnouncement(new RegExp(`^${esc(target)}, .*, page 2, `))
    await app.expectPreviewSettled()

    expect(steps.length).toBeGreaterThan(15)
    expect(steps.filter((x) => !x.visible || !x.unobscured)).toEqual([])
    expect(await announcements(page)).toEqual([
      "Can't move it further: another photo or the margin is in the way.",
      'portrait.jpg, 91 × 136.9 mm, page 1, 10 mm from the left, 10 mm from the top.',
      'portrait.jpg, 90 × 135.4 mm, page 1, 10 mm from the left, 10 mm from the top.',
      'portrait.jpg, 90 × 135.4 mm, page 1, 11 mm from the left, 10 mm from the top.',
      'portrait.jpg, 90 × 135.4 mm, page 1, 11 mm from the left, 11 mm from the top.',
      'portrait.jpg, 91 × 136.9 mm, page 1, 11 mm from the left, 11 mm from the top.',
      'Picked up portrait.jpg. Move to another photo and press Enter to swap, or Escape to cancel.',
      'portrait.jpg, 76.2 × 114.7 mm, page 1, 108 mm from the left, 138.6 mm from the top.',
      'Undone.',
      'a-4x3.jpg, 92 × 122.6 mm, page 1, 108 mm from the left, 10 mm from the top.',
      'a-4x3.jpg, 45 × 60 mm, page 1, 108 mm from the left, 10 mm from the top.',
      'a-4x3.jpg, 91 × 121.3 mm, page 1, 11 mm from the left, 11 mm from the top.',
      'a-4x3.jpg, 121.3 × 91 mm, page 2, 10 mm from the left, 10 mm from the top.',
    ])

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await expectNoAxeViolations(page)
    }
    if (browserName === 'chromium') {
      await page.emulateMedia({ forcedColors: 'active', colorScheme: 'light' })
      await arrange.block(PORTRAIT.name).focus()
      await page.keyboard.press('Shift+ArrowLeft')
      await arrange.expectAnnouncement(/^portrait\.jpg, /)
      const shown = await focusProbe(page)
      expect(shown.name).toMatch(/^portrait\.jpg, /)
      expect(shown.visible && shown.unobscured).toBe(true)
      await expectNoAxeViolations(page)
    }
  })
})

test.describe('manual layout, scrolling and warnings while arranging (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('a drag keeps its ghost under the pointer when the preview scrolls, and drops on page 2 below the fold', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { app, arrange } = await start(page)
    await sixPhotos(page, app)
    await arrange.enter()
    const e = await arrange.blockOf('e-16x10.jpg')
    expect(e.page).toBe(0)
    await arrange.block('e-16x10.jpg').scrollIntoViewIfNeeded()
    const a = await arrange.sheetBox(0)
    const px = a.x + (e.rect.x + e.rect.w / 2) * a.ppm
    const py = a.y + (e.rect.y + e.rect.h / 2) * a.ppm
    const offset = async (x: number, y: number) => {
      const g = await arrange.ghost.boundingBox()
      if (!g) throw new Error('no ghost')
      return { dx: g.x + g.width / 2 - x, dy: g.y + g.height / 2 - y }
    }
    await page.mouse.move(px, py)
    await page.mouse.down()
    await page.mouse.move(px - 20, py + 20, { steps: 4 })
    await expect(arrange.ghost).toBeVisible()
    const held = await offset(px - 20, py + 20)

    // Wheel the preview until page 2's free corner is in view, the button still held.
    const target = { x: 110, y: 165 }
    const before = await arrange.sheetBox(1)
    const targetY = async () => {
      const b = await arrange.sheetBox(1)
      return b.y + (target.y + e.rect.h / 2) * b.ppm
    }
    for (let i = 0; i < 10 && (await targetY()) > 800; i++) {
      const y = (await arrange.sheetBox(1)).y
      await page.mouse.wheel(0, 250)
      await expect.poll(async () => (await arrange.sheetBox(1)).y).toBeLessThan(y)
    }
    expect(await targetY()).toBeLessThanOrEqual(800)
    expect((await arrange.sheetBox(1)).y).toBeLessThan(before.y - 200)
    const tol = 2 * a.ppm + 2
    await expect
      .poll(async () => {
        const o = await offset(px - 20, py + 20)
        return Math.max(Math.abs(o.dx - held.dx), Math.abs(o.dy - held.dy))
      })
      .toBeLessThanOrEqual(tol)

    const b = await arrange.sheetBox(1)
    const tx = b.x + (target.x + e.rect.w / 2) * b.ppm
    const ty = b.y + (target.y + e.rect.h / 2) * b.ppm
    await page.mouse.move(tx, ty, { steps: 12 })
    const o = await offset(tx, ty)
    expect(Math.abs(o.dx)).toBeLessThanOrEqual(tol)
    expect(Math.abs(o.dy)).toBeLessThanOrEqual(tol)
    await expect(arrange.ghost).not.toHaveClass(/is-invalid/)
    await page.mouse.up()
    await arrange.expectAnnouncement(/^e-16x10\.jpg, .*, page 2, /)
    const moved = await arrange.blockOf('e-16x10.jpg')
    expect(moved.page).toBe(1)
    expect(Math.abs(moved.rect.x - target.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(moved.rect.y - target.y)).toBeLessThanOrEqual(2)
  })

  test('a photo enlarged past 300 DPI on the page shows the low-resolution warning while arranged (M5-R12), axe-clean', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const { app, arrange } = await start(page)
    await load(app, await shapes(page, 1))
    const name = 'a-4x3.jpg'
    const badge = page.locator('main figure').getByText(/^\d+ DPI$/)
    await arrange.enter()
    await expect(badge).toHaveCount(0)
    await expect(arrange.block(name)).not.toHaveAccessibleDescription(/Low resolution/)

    await arrange.block(name).click()
    await arrange.width.fill('170')
    await arrange.width.press('Enter')
    await arrange.expectAnnouncement(/^a-4x3\.jpg, 170 × 127\.5 mm, /)
    await app.expectPreviewSettled()
    // 1600 px over 170 mm.
    const dpi = String(Math.round(1600 / (170 / 25.4)))
    await expect(badge).toHaveText(`${dpi} DPI`)
    await expect(badge).toBeVisible()
    await expect(arrange.block(name)).toHaveAccessibleDescription(
      new RegExp(`Low resolution: ${dpi} DPI`),
    )
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await expectNoAxeViolations(page)
    }

    await arrange.exit()
    await expect(app.tile(name)).toHaveAccessibleDescription(`Low resolution: ${dpi} DPI`)
  })
})

test.describe('manual layout timing (chromium)', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('B-D7 with 20 photos a committed move updates the preview in < 200 ms (M5-R27 marks; CI bound 1000 ms, recorded)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000)
    guard = guardNetwork(page)
    await installPerfProbe(page)
    const app = new AppPage(page)
    const arrange = new ArrangeArea(page)
    await app.goto()
    await page.getByRole('radio', { name: 'mm', exact: true }).click()
    const photos = await mixedJpegs(page, 20, 2000)
    await app.upload(photos)
    await app.expectImages(20, 60_000)
    await app.expectPreviewPages(1)
    await app.expectPreviewSettled(60_000)

    await arrange.enter()
    const first = (await arrange.blockBoxes()).at(0)
    if (!first) throw new Error('no block')
    await arrange.block(first.name).click()
    await arrange.width.fill(String(Math.floor(first.rect.w - 10)))
    await arrange.width.press('Enter')
    await arrange.expectAnnouncement(new RegExp(`^${first.name.replace('.', '\\.')}, `))
    await app.expectPreviewSettled(60_000)
    await page.evaluate(() => {
      ;(globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, 0)
    })
    await arrange.block(first.name).focus()

    const runs: number[] = []
    for (let i = 0; i < 5; i++) {
      await arm(page)
      await page.keyboard.press('ArrowRight')
      const update = await readUpdate(app, 30_000)
      await arrange.expectAnnouncement(
        new RegExp(
          `^${first.name.replace('.', '\\.')}, .*, ${String(i + 1 + Math.round(first.rect.x))} mm from the left, `,
        ),
      )
      runs.push(Math.round(update.updateMs))
    }
    const median = [...runs].sort((x, y) => x - y)[2] ?? NaN
    testInfo.annotations.push({
      type: 'B-D7 committed move, ms',
      description: JSON.stringify({ median, runs }),
    })
    console.log(`B-D7 committed move: median ${String(median)} ms, runs ${JSON.stringify(runs)}`)
    expect(median).toBeLessThan(1000)
  })
})
