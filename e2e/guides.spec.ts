import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { edgeOutline } from '../src/features/lines/edges/outline.ts'
import { stillLife } from '../src/features/lines/edges/test-support/synthetic.ts'
import { fromCrop, fromRotated } from '../src/features/lines/guides/map.ts'
import { poseFigure } from '../src/features/lines/guides/pose.ts'
import { resolveCrop } from '../src/features/render/crop.ts'
import { DEFAULT_EDITS, type ImageEdits } from '../src/shared/model/image.ts'
import { DEFAULT_LINES, type LineSettings } from '../src/shared/model/lines.ts'
import { AppPage, type GuideKind } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import {
  AI_ASSET_PATHS,
  DOWNLOAD_PATHS,
  FIGURE,
  FIXTURE_FACE,
  FIXTURE_POSE,
  MODEL_PATHS,
  PORTRAIT,
  appearances,
  buildPaths,
  countAppearances,
  exportSettled,
  guideTileLines,
  installWorkerPostCounter,
  maxLiveWorkers,
  previewMismatches,
  rgbPng,
  sourceToPage,
  subpaths,
  watchConsoleErrors,
  workerPosts,
} from './support/guides.ts'
import { hexRgb, isTurned, strokeMismatches, trimOf, type RectMm } from './support/line-geometry.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { guideStrokes, summarizePdf, type PdfPageSummary } from './support/pdf.ts'
import { paintedPixels } from './support/png.ts'
import { runOnly } from './support/projects.ts'

// The e2e tsconfig has no DOM lib; the few browser globals used inside evaluate.
declare const document: { activeElement: unknown }

test.use({
  viewport: { width: 1280, height: 900 },
  // CI's Linux Firefox has no WebGL (C1-R1). Turned off here too, so a local run takes CI's path.
  launchOptions: { firefoxUserPrefs: { 'webgl.disabled': true } },
})

const REAL_DETECTION =
  'real face and pose detection runs on CI in chromium only (C1-R1: no WebGL in CI Firefox, none in the CI WebKit worker)'
const NO_BOX_WITHOUT_WEBGL =
  'without WebGL no download is offered (owner Q15), and CI Firefox has no WebGL'
const GREEN = '#00ff00'
const STYLE = { colour: GREEN, widthMm: 1, opacityPct: 100 }

let guard: NetworkGuard | undefined
let consoleErrors: (() => string[]) | undefined

function startApp(page: Page, allowConsole?: (text: string) => boolean): AppPage {
  guard = guardNetwork(page)
  consoleErrors = watchConsoleErrors(page, allowConsole)
  return new AppPage(page)
}

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  expect(consoleErrors?.() ?? []).toEqual([])
  guard = undefined
  consoleErrors = undefined
})

/** A4 in mm, the photos added, the first one selected, the Lines tab open. */
async function withPhotos(
  page: Page,
  files: Parameters<AppPage['upload']>[0],
  count: number,
  allowConsole?: (text: string) => boolean,
): Promise<AppPage> {
  const app = startApp(page, allowConsole)
  await app.goto()
  await page.getByRole('radio', { name: 'mm', exact: true }).click()
  await app.setPaper('A4')
  await app.upload(files)
  await app.expectImages(count, 60_000)
  await app.expectPreviewPages(1)
  await app.openGuides()
  return app
}

async function select(app: AppPage, name: string): Promise<void> {
  await app.selectButton(name).click()
  await expect(app.linesPanel.getByText(`Lines for ${name}`)).toBeVisible()
}

/** Switches a face or pose guide on and downloads its model when the box offers it. */
async function guideWithModel(app: AppPage, kind: 'face' | 'pose'): Promise<void> {
  await app.setGuide(kind, true)
  if ((await app.expectGuideSettled(kind)) === 'box') await app.downloadModel(kind)
}

const linesWith = (patch: Partial<LineSettings>): LineSettings => ({
  ...DEFAULT_LINES,
  ...patch,
  style: { ...DEFAULT_LINES.style, ...STYLE },
})

async function pdfPage(bytes: Buffer): Promise<PdfPageSummary> {
  const info = await summarizePdf(bytes)
  expect(info.pageCount).toBe(1)
  const p = info.pages.at(0)
  if (!p) throw new Error('no page')
  return p
}

const pathOf = (url: string) => new URL(url).pathname
const isHttp = (url: string) => /^https?:/.test(url)

/** A build file no app code requests, fetched by the test from inside a dedicated worker. */
const CANARY = '/artistica/robots.txt'

interface WorkerWindow {
  location: { origin: string }
  Blob: new (parts: string[], opts: { type: string }) => unknown
  URL: { createObjectURL(b: unknown): string; revokeObjectURL(u: string): void }
  Worker: new (url: string) => { onmessage: (() => void) | null; terminate(): void }
}

async function fetchFromWorker(path: string): Promise<void> {
  const w = globalThis as unknown as WorkerWindow
  const src = `fetch(${JSON.stringify(w.location.origin + path)}).then(() => postMessage(0))`
  const url = w.URL.createObjectURL(new w.Blob([src], { type: 'text/javascript' }))
  const worker = new w.Worker(url)
  await new Promise<void>((resolve) => {
    worker.onmessage = () => {
      resolve()
    }
  })
  worker.terminate()
  w.URL.revokeObjectURL(url)
}

async function editSheet(app: AppPage, name: string, act: (sheet: Locator) => Promise<void>) {
  await app.editButton(name).click()
  const sheet = app.page.getByRole('dialog')
  await act(sheet)
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)
}

test.describe('exit criterion 2 and unsupported (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('G-X2 nothing is uploaded: same-origin GETs with no body; the only new URLs are the four AI assets, each once', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(240_000)
    await installWorkerPostCounter(page)
    const app = await withPhotos(page, [FIXTURES.portraitJpg, FIXTURES.figureJpg], 2)
    const shellDone = guard?.mark() ?? 0
    await select(app, PORTRAIT.name)
    await app.setGuide('edges', true)
    const offered = browserName !== 'firefox'
    for (const kind of ['face', 'pose'] as const) {
      await app.setGuide(kind, true)
      const settled = await app.expectGuideSettled(kind)
      expect(settled).toBe(offered ? 'box' : 'unsupported')
      if (offered) await app.downloadModel(kind)
    }
    for (const kind of ['edges', 'face', 'pose'] as const) await app.expectGuideSettled(kind)
    const downloaded = guard?.mark() ?? 0
    await app.applyLinesToAll()
    await app.setDetail(70)
    await editSheet(app, PORTRAIT.name, async (sheet) => {
      await sheet.getByRole('button', { name: 'Rotate right 90°' }).click()
    })
    await exportSettled(app, ['edges', 'face', 'pose'])

    const all = guard?.requestsSince(0) ?? []
    const http = all.filter((r) => isHttp(r.url))
    const build = buildPaths()
    const origin = new URL(page.url()).origin
    expect(http.length).toBeGreaterThan(0)
    for (const r of http) {
      const u = new URL(r.url)
      expect({
        url: r.url,
        method: r.method,
        body: r.body,
        origin: u.origin,
        query: u.search,
      }).toEqual({ url: r.url, method: 'GET', body: false, origin, query: '' })
      expect(build.has(u.pathname), `${u.pathname} is a build file`).toBe(true)
    }
    const after = (guard?.requestsSince(shellDone) ?? []).filter((r) => isHttp(r.url))
    for (const path of AI_ASSET_PATHS)
      expect(
        after.filter((r) => pathOf(r.url) === path).length,
        `${path} fetched ${offered ? 'once' : 'never'}`,
      ).toBe(offered ? 1 : 0)
    // No AI asset is fetched again while detecting, editing and exporting; only the app's own
    // lazy worker chunks may load then.
    const late = (guard?.requestsSince(downloaded) ?? []).filter((r) => isHttp(r.url))
    expect(late.filter((r) => AI_ASSET_PATHS.includes(pathOf(r.url)))).toEqual([])
    // One landmarker at a time (M4-R5a): the face engine's worker ends before the pose one starts.
    const landmarkWorkers = await maxLiveWorkers(page, 'landmark.worker')
    expect(landmarkWorkers).toBeLessThanOrEqual(1)
    if (browserName === 'chromium') expect(landmarkWorkers).toBe(1)
    if (browserName === 'chromium') expect(guard?.seen('landmark.worker-')).toBeGreaterThan(0)
    // A blind spot is not a pass: a request made inside a dedicated worker must reach the guard.
    const canaries = guard?.seen(CANARY) ?? 0
    await page.evaluate(fetchFromWorker, CANARY)
    const visible = await expect
      .poll(() => (guard?.seen(CANARY) ?? 0) > canaries, { timeout: 5000 })
      .toBe(true)
      .then(
        () => true,
        () => false,
      )
    test.skip(!visible, 'worker requests are invisible to Playwright on this engine')
  })

  test('G-U1 without WebGL: the Q15 note, no download offered, no detection request; the edge outline still works', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'firefox', 'runs where WebGL is off: firefox (C1-R1)')
    test.setTimeout(120_000)
    const app = await withPhotos(page, FIXTURES.portraitJpg, 1)
    for (const kind of ['face', 'pose'] as const) {
      await app.setGuide(kind, true)
      expect(await app.expectGuideSettled(kind)).toBe('unsupported')
      await expect(
        app
          .guideGroup(kind)
          .getByText('Face and pose guides need WebGL, which this browser has turned off.'),
      ).toBeVisible()
      await expect(app.guideGroup(kind).getByRole('button')).toHaveCount(0)
      await expect(app.guideSwitch(kind)).toHaveAttribute('aria-checked', 'true')
    }
    await app.setGuide('edges', true)
    expect(await app.expectGuideSettled('edges')).toBe('found')
    const p = await pdfPage(await exportSettled(app, ['edges', 'face', 'pose']))
    expect(p.lineStrokes).toHaveLength(1)
    expect(guideStrokes(p)[0]?.ops.length).toBeGreaterThan(20)
    for (const path of AI_ASSET_PATHS) expect(guard?.seen(path), path).toBe(0)
    expect(guard?.seen('landmark')).toBe(0)
    expect(guard?.seen('vision_bundle')).toBe(0)
  })
})

/** The tile of a one-image page, with its trim and whether the engine turned it. */
function onlyTile(p: PdfPageSummary, photo: { pxW: number; pxH: number }) {
  expect(p.draws).toHaveLength(1)
  const d = p.draws.at(0)
  if (!d) throw new Error('no draw')
  return { trim: trimOf(d, p.heightPt), turned: isTurned(d, photo.pxW, photo.pxH) }
}

const pageWidthMm = (p: PdfPageSummary) => p.widthPt / (72 / 25.4)

/** The guide off for the selected photo, then the settled preview (the "bare" read). */
const guideOff = (app: AppPage, kind: GuideKind) => async () => {
  await app.setGuide(kind, false)
  await app.expectPreviewSettled()
}

test.describe('guides from a real detection (chromium)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', REAL_DETECTION)
  })

  test('G-D1 face construction: the PDF stroke equals the pure geometry of the recorded landmarks; eye line on the eyes; the preview draws it', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page, FIXTURES.portraitJpg, 1)
    await guideWithModel(app, 'face')
    expect(await app.expectGuideSettled('face')).toBe('found')
    await app.setLineStyle(STYLE)
    const p = await pdfPage(await exportSettled(app, ['face']))
    const { trim, turned } = onlyTile(p, PORTRAIT)
    const img = { pxW: PORTRAIT.pxW, pxH: PORTRAIT.pxH, edits: DEFAULT_EDITS }
    const want = guideTileLines(
      { ...img, lines: linesWith({ face: true }) },
      { faces: [FIXTURE_FACE], poses: null, edges: null },
      trim,
      turned,
    )
    expect(strokeMismatches(p.lineStrokes, want, p.heightPt, 1e-6)).toEqual([])

    // The eye line: a segment through the irises' midpoint, parallel to the eye axis.
    const at = (i: number) => {
      const q = FIXTURE_FACE.points.at(i)
      if (!q) throw new Error(`no landmark ${String(i)}`)
      return sourceToPage(img, { x: q.x * img.pxW, y: q.y * img.pxH }, trim, turned)
    }
    const [l, r] = [at(468), at(473)]
    const eyes = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }
    const [o1, o2] = [at(33), at(263)]
    const axis = Math.atan2(o2.y - o1.y, o2.x - o1.x)
    const ops = guideStrokes(p)[0]?.ops ?? []
    const eyeLine = ops.findIndex((op, i) => {
      const prev = i === 0 ? undefined : ops.at(i - 1)
      if (op.op !== 'L' || prev === undefined) return false
      const mid = { x: (prev.x + op.x) / 2, y: (prev.y + op.y) / 2 }
      const angle = Math.atan2(op.y - prev.y, op.x - prev.x)
      const off = Math.abs(Math.sin(angle - axis))
      return Math.hypot(mid.x - eyes.x, mid.y - eyes.y) <= 2 && off <= Math.sin(Math.PI / 180)
    })
    expect(eyeLine).toBeGreaterThan(0)
    // The cranium circle: a move then exactly 4 cubic arcs.
    expect(subpaths(ops)[0]?.map((op) => op.op)).toEqual(['M', 'C', 'C', 'C', 'C'])

    const check = await previewMismatches(
      app,
      pageWidthMm(p),
      [want],
      hexRgb(GREEN),
      guideOff(app, 'face'),
    )
    testInfo.annotations.push({
      type: 'preview-samples',
      description: JSON.stringify(check.counts),
    })
    for (const n of check.counts.flat()) expect(n).toBeGreaterThanOrEqual(10)
    expect(check.failures).toEqual([])
  })

  test('G-D2 pose figure: the PDF stroke equals the pure figure of the recorded landmarks; joints are 4-arc circles of radius width / 2', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page, FIXTURES.figureJpg, 1)
    await guideWithModel(app, 'pose')
    expect(await app.expectGuideSettled('pose')).toBe('found')
    await app.setLineStyle(STYLE)
    const p = await pdfPage(await exportSettled(app, ['pose']))
    const { trim, turned } = onlyTile(p, FIGURE)
    const img = { pxW: FIGURE.pxW, pxH: FIGURE.pxH, edits: DEFAULT_EDITS }
    const want = guideTileLines(
      { ...img, lines: linesWith({ pose: true }) },
      { faces: null, poses: [FIXTURE_POSE], edges: null },
      trim,
      turned,
    )
    expect(strokeMismatches(p.lineStrokes, want, p.heightPt, 1e-6)).toEqual([])

    const joints = poseFigure(FIXTURE_POSE, img).joints.length
    expect(joints).toBeGreaterThanOrEqual(12)
    const r = STYLE.widthMm / 2
    const dots = subpaths(guideStrokes(p)[0]?.ops ?? []).filter((sp) => {
      if (sp.map((op) => op.op).join('') !== 'MCCCC') return false
      const top = sp.at(0)
      const bottom = sp.at(2)
      return top !== undefined && bottom !== undefined && Math.abs(bottom.y - top.y - 2 * r) < 1e-6
    })
    expect(dots).toHaveLength(joints)

    const check = await previewMismatches(
      app,
      pageWidthMm(p),
      [want],
      hexRgb(GREEN),
      guideOff(app, 'pose'),
    )
    testInfo.annotations.push({
      type: 'preview-samples',
      description: JSON.stringify(check.counts),
    })
    for (const n of check.counts.flat()) expect(n).toBeGreaterThanOrEqual(10)
    expect(check.failures).toEqual([])
  })
})

interface RangeEl {
  value: string
  dispatchEvent(e: unknown): boolean
}
interface RangeWindow {
  Event: new (type: string, init: { bubbles: boolean }) => unknown
  HTMLInputElement: { prototype: object }
}
interface ButtonEl {
  getAttribute(name: string): string | null
}

/**
 * Sets a range input to each value in turn, 10 ms apart (a drag faster than the 80 ms settle), and
 * returns Export's `aria-disabled` read after each step.
 */
async function dragTo(
  slider: Locator,
  values: readonly number[],
  exportButton: Locator,
): Promise<(string | null)[]> {
  const button = await exportButton.elementHandle()
  return slider.evaluate(
    async (el: RangeEl, arg: { list: number[]; button: ButtonEl | null }) => {
      const w = globalThis as unknown as RangeWindow
      // React tracks a range's value through the prototype setter, so a plain assignment is ignored.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value')?.set
      const exportDisabled: (string | null)[] = []
      for (const v of arg.list) {
        setter?.call(el, String(v))
        el.dispatchEvent(new w.Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 10))
        exportDisabled.push(arg.button ? arg.button.getAttribute('aria-disabled') : 'no button')
      }
      return exportDisabled
    },
    { list: [...values], button: button as unknown as ButtonEl | null },
  )
}

/** Path vertices of the only guide stroke on a page (every M and L op is one). */
const vertices = (p: PdfPageSummary): number => {
  const strokes = guideStrokes(p)
  expect(strokes).toHaveLength(1)
  return strokes[0]?.ops.length ?? 0
}

test.describe('edge outline (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('G-D3 more Detail, more vertices; at most 4000 at 100; one tracing per settled Detail', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    await installWorkerPostCounter(page)
    const app = await withPhotos(page, FIXTURES.portraitJpg, 1)
    await app.setGuide('edges', true)
    await app.setDetail(20)
    const at20 = vertices(await pdfPage(await exportSettled(app, ['edges'])))
    await app.setDetail(80)
    const at80 = vertices(await pdfPage(await exportSettled(app, ['edges'])))
    await app.setDetail(100)
    const at100 = vertices(await pdfPage(await exportSettled(app, ['edges'])))
    testInfo.annotations.push({
      type: 'vertices',
      description: JSON.stringify({ at20, at80, at100 }),
    })
    expect(at80).toBeGreaterThan(at20)
    expect(at100).toBeGreaterThanOrEqual(at80)
    expect(at100).toBeLessThanOrEqual(4000)

    await app.expectGuideSettled('edges')
    await countAppearances(page, ['Tracing the outline…'])
    const before = await workerPosts(page, 'edges.worker')
    expect(before).toBeGreaterThanOrEqual(3)
    await expect(app.exportButton).toBeEnabled()
    const drag = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40]
    // Export closes with the first change, before the detail settles (M4-R18).
    expect(await dragTo(app.detailSlider, drag, app.exportButton)).toEqual(drag.map(() => 'true'))
    await expect(app.detailSlider).toHaveAttribute('aria-valuetext', '40%')
    await expect(app.exportButton).toBeEnabled({ timeout: 60_000 })
    expect(await app.expectGuideSettled('edges')).toBe('found')
    expect(await appearances(page, 'Tracing the outline…')).toBe(1)
    // One outline for the settled value: one message to the edge worker.
    expect((await workerPosts(page, 'edges.worker')) - before).toBe(1)
  })

  test("G-D4b the browser's edge outline of a synthetic photo equals node's golden, exactly", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const { rgba, w, h } = stillLife()
    const file = { name: 'still-life.png', mimeType: 'image/png', buffer: rgbPng(rgba, w, h) }
    const app = await withPhotos(page, file, 1)
    await app.setLineStyle(STYLE)
    await app.setGuide('edges', true)
    expect(await app.expectGuideSettled('edges')).toBe('found')
    const p = await pdfPage(await exportSettled(app, ['edges']))
    const { trim, turned } = onlyTile(p, { pxW: w, pxH: h })
    const img = { pxW: w, pxH: h, edits: DEFAULT_EDITS }
    const crop = resolveCrop(img)
    const golden = edgeOutline(rgba, w, h, DEFAULT_LINES.edges.detailPct)
    expect(golden.length).toBeGreaterThan(3)
    const want = guideTileLines(
      {
        ...img,
        lines: linesWith({ edges: { on: true, detailPct: DEFAULT_LINES.edges.detailPct } }),
      },
      {
        faces: null,
        poses: null,
        edges: { polylines: golden.map((line) => line.map((q) => fromCrop(q, crop, w, h))) },
      },
      trim,
      turned,
    )
    expect(strokeMismatches(p.lineStrokes, want, p.heightPt, 1e-6)).toEqual([])
  })
})

/** Each tile's guide ops relative to its trim, keyed by the photo's aspect (its identity here). */
function relativeStrokes(p: PdfPageSummary): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const strokes = guideStrokes(p)
  expect(strokes).toHaveLength(p.draws.length)
  p.draws.forEach((d, i) => {
    const trim: RectMm = trimOf(d, p.heightPt)
    const key = (Math.max(d.wPt, d.hPt) / Math.min(d.wPt, d.hPt)).toFixed(4)
    const ops = strokes[i]?.ops ?? []
    out.set(
      key,
      ops.flatMap((op) => {
        const xy = [op.x - trim.x, op.y - trim.y]
        return op.op === 'C'
          ? [op.x1 - trim.x, op.y1 - trim.y, op.x2 - trim.x, op.y2 - trim.y, ...xy]
          : xy
      }),
    )
  })
  return out
}

test.describe('determinism (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('G-D4a Remove all and the same photos in the other order: the same guide strokes, exactly', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(240_000)
    const real = browserName === 'chromium'
    const app = await withPhotos(page, [FIXTURES.portraitJpg, FIXTURES.figureJpg], 2)
    const run = async (first: string) => {
      await select(app, first)
      await app.setLineStyle(STYLE)
      await app.setGuide('edges', true)
      if (real) for (const kind of ['face', 'pose'] as const) await guideWithModel(app, kind)
      await app.applyLinesToAll()
      return relativeStrokes(await pdfPage(await exportSettled(app, ['edges', 'face', 'pose'])))
    }
    const a = await run(PORTRAIT.name)
    await app.removeAll()
    await app.expectImages(0)
    await app.upload([FIXTURES.figureJpg, FIXTURES.portraitJpg])
    await app.expectImages(2)
    await app.openGuides()
    const b = await run(FIGURE.name)
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort())
    expect(a.size).toBe(2)
    for (const [key, ops] of a) {
      const other = b.get(key) ?? []
      expect(other.length, key).toBe(ops.length)
      const worst = Math.max(...ops.map((v, i) => Math.abs(v - (other[i] ?? NaN))))
      expect(worst, key).toBeLessThanOrEqual(1e-9)
    }
  })
})

interface ImgEl {
  src: string
  decode(): Promise<void>
  naturalWidth: number
  naturalHeight: number
}
interface CanvasEl {
  width: number
  height: number
  getContext(id: '2d'): {
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
    drawImage(i: ImgEl, x: number, y: number): void
  } | null
  toDataURL(type: string): string
}
interface PaintWindow {
  Image: new () => ImgEl
  document: { createElement(tag: 'canvas'): CanvasEl }
}

/** portrait.jpg turned 90° anticlockwise, as a lossless PNG drawn by the page itself. */
async function sidewaysPortrait(
  page: Page,
): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const b64 = readFileSync(FIXTURES.portraitJpg).toString('base64')
  const png = await page.evaluate(async (data) => {
    const w = globalThis as unknown as PaintWindow
    const img = new w.Image()
    img.src = `data:image/jpeg;base64,${data}`
    await img.decode()
    const c = w.document.createElement('canvas')
    c.width = img.naturalHeight
    c.height = img.naturalWidth
    const g = c.getContext('2d')
    if (!g) throw new Error('canvas is not 2d')
    g.setTransform(0, -1, 1, 0, 0, img.naturalWidth)
    g.drawImage(img, 0, 0)
    return c.toDataURL('image/png').split(',')[1] ?? ''
  }, b64)
  return { name: 'sideways.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }
}

test.describe('downloads (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'firefox', NO_BOX_WITHOUT_WEBGL)
  })

  test('G-D5 no download without a click: the box after "Apply lines to all" on every photo, and after a reload nothing is fetched', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page, [FIXTURES.portraitJpg, FIXTURES.figureJpg], 2)
    await select(app, PORTRAIT.name)
    await app.setGuide('face', true)
    expect(await app.expectGuideSettled('face')).toBe('box')
    await expect(app.guideGroup('face').getByText('One-time download: 15.2 MB')).toBeVisible()
    await app.applyLinesToAll()
    await select(app, FIGURE.name)
    await expect(app.guideSwitch('face')).toHaveAttribute('aria-checked', 'true')
    expect(await app.expectGuideSettled('face')).toBe('box')
    // Waiting for a click: nothing is fetched, and the box does not hold Export (M4-R18).
    await expect(app.exportButton).toBeEnabled()
    await page.waitForTimeout(1500)
    for (const path of AI_ASSET_PATHS) expect(guard?.seen(path), path).toBe(0)

    await app.downloadModel('face')
    for (const path of DOWNLOAD_PATHS.face) expect(guard?.seen(path), path).toBe(1)
    expect(guard?.seen(MODEL_PATHS.pose)).toBe(0)
    await select(app, PORTRAIT.name)
    expect(await app.expectGuideSettled('face')).not.toBe('box')

    // Switches are not remembered (owner Q8): a photo added after a reload starts with none.
    page.on('dialog', (d) => void d.accept())
    await page.reload()
    await app.upload(FIXTURES.portraitJpg)
    await app.expectImages(1)
    await app.openGuides()
    for (const kind of ['edges', 'face', 'pose'] as const)
      await expect(app.guideSwitch(kind)).toHaveAttribute('aria-checked', 'false')
    await page.waitForTimeout(1000)
    for (const path of DOWNLOAD_PATHS.face) expect(guard?.seen(path), path).toBe(1)
    expect(guard?.seen(MODEL_PATHS.pose)).toBe(0)
  })

  test('G-D7 a failed download shows the E6 alert; "Turn off face guides" turns it off; "Try again" downloads', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const model = `**${MODEL_PATHS.face}`
    let calls = 0
    await page.route(model, async (route) => {
      calls++
      if (calls === 1) await route.abort('failed')
      else await route.continue()
    })
    // The aborted request is logged by the browser as a failed load.
    const app = await withPhotos(page, FIXTURES.portraitJpg, 1, (text) =>
      /Failed to load resource|face_landmarker/.test(text),
    )
    await app.setGuide('face', true)
    expect(await app.expectGuideSettled('face')).toBe('box')
    await app.guideGroup('face').getByRole('button', { name: 'Download & turn on' }).click()
    const alert = app.guideGroup('face').getByRole('alert')
    await expect(alert).toContainText("Couldn't download the face model")
    await expect(alert).toContainText(
      'Check your connection and try again. Other lines still work.',
    )
    expect(await app.guideStatus('face')).toBe('download-failed')
    await expect(app.exportButton).toBeEnabled()

    // By keyboard: Safari does not focus a button on click, and focus returns only from a focused one.
    await alert.getByRole('button', { name: 'Turn off face guides' }).focus()
    await page.keyboard.press('Enter')
    await expect(app.guideSwitch('face')).toHaveAttribute('aria-checked', 'false')
    await expect(app.guideSwitch('face')).toBeFocused()

    await app.setGuide('face', true)
    await expect(alert).toContainText("Couldn't download the face model")
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect
      .poll(() => app.guideStatus('face'), { timeout: 60_000 })
      .toMatch(/^(running|found|none|failed)$/)
    expect(await app.expectGuideSettled('face')).not.toBe('download-failed')
    expect(calls).toBe(2)
    expect(guard?.seen(MODEL_PATHS.face)).toBe(2)
  })
})

test.describe('guides with real detections (chromium)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', REAL_DETECTION)
  })

  test('G-D6 nothing found: the notes, the switches stay on, nothing printed', async ({ page }) => {
    test.setTimeout(120_000)
    const app = await withPhotos(page, FIXTURES.flatGrey, 1)
    for (const kind of ['face', 'pose'] as const) await guideWithModel(app, kind)
    expect(await app.expectGuideSettled('face')).toBe('none')
    expect(await app.expectGuideSettled('pose')).toBe('none')
    for (const [kind, texts] of [
      [
        'face',
        ['No face found in this image.', 'Face guides work best with a clear front or ¾ view.'],
      ],
      [
        'pose',
        ['No person found in this image.', 'Pose lines work best when the whole body is in view.'],
      ],
    ] as const)
      for (const text of texts) await expect(app.guideGroup(kind)).toContainText(text)
    for (const kind of ['face', 'pose'] as const)
      await expect(app.guideSwitch(kind)).toHaveAttribute('aria-checked', 'true')
    const p = await pdfPage(await exportSettled(app, ['face', 'pose']))
    expect(p.lineStrokes).toEqual([])
  })

  test('G-D8 rotate: one new detection and the guides on the face; flip: none, mirrored; crop the face out: no face lines', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const app = startApp(page)
    await installWorkerPostCounter(page)
    await app.goto()
    const sideways = await sidewaysPortrait(page)
    await page.getByRole('radio', { name: 'mm', exact: true }).click()
    await app.setPaper('A4')
    await app.upload(sideways)
    await app.expectImages(1)
    await app.openGuides()
    await app.setLineStyle(STYLE)
    await guideWithModel(app, 'face')
    // A face lying on its side is not found; turned upright it is.
    expect(await app.expectGuideSettled('face')).toBe('none')
    await countAppearances(page, ['Finding faces…'])

    const exportFace = async (edits: ImageEdits) => {
      const p = await pdfPage(await exportSettled(app, ['face']))
      const d = p.draws.at(0)
      if (!d) throw new Error('no draw')
      const img = { pxW: PORTRAIT.pxH, pxH: PORTRAIT.pxW, edits }
      const want = tileLinesOrNull(
        img,
        trimOf(d, p.heightPt),
        isTurned(d, PORTRAIT.pxW, PORTRAIT.pxH),
      ) // the upright picture
      return { p, want, trim: trimOf(d, p.heightPt) }
    }
    const faceInSource = {
      points: FIXTURE_FACE.points.map((q) => fromRotated(q, 90)),
    }
    const tileLinesOrNull = (
      img: { pxW: number; pxH: number; edits: ImageEdits },
      trim: RectMm,
      turned: boolean,
    ) =>
      guideTileLines(
        { ...img, lines: linesWith({ face: true }) },
        { faces: [faceInSource], poses: null, edges: null },
        trim,
        turned,
      )

    await editSheet(app, sideways.name, async (sheet) => {
      await sheet.getByRole('button', { name: 'Rotate right 90°' }).click()
    })
    expect(await app.expectGuideSettled('face')).toBe('found')
    expect(await appearances(page, 'Finding faces…')).toBe(1)
    const rotated = await exportFace({ ...DEFAULT_EDITS, rotation: 90 })
    expect(strokeMismatches(rotated.p.lineStrokes, rotated.want, rotated.p.heightPt, 1e-6)).toEqual(
      [],
    )
    const landmarkPosts = await workerPosts(page, 'landmark.worker')
    expect(landmarkPosts).toBeGreaterThan(0)

    await editSheet(app, sideways.name, async (sheet) => {
      await sheet.getByRole('button', { name: 'Flip horizontal' }).click()
    })
    await app.expectPreviewSettled()
    expect(await appearances(page, 'Finding faces…')).toBe(1)
    const flipped = await exportFace({ ...DEFAULT_EDITS, rotation: 90, flipH: true })
    expect(strokeMismatches(flipped.p.lineStrokes, flipped.want, flipped.p.heightPt, 1e-6)).toEqual(
      [],
    )
    // Mirrored across the picture's vertical axis, op for op: on the page that is the trim's
    // vertical centre line, or its horizontal one when the engine turned the picture.
    const turned = isTurned(flipped.p.draws[0], PORTRAIT.pxW, PORTRAIT.pxH)
    const before = guideStrokes(rotated.p)[0]?.ops ?? []
    const after = guideStrokes(flipped.p)[0]?.ops ?? []
    expect(after).toHaveLength(before.length)
    const t = flipped.trim
    const worst = Math.max(
      ...before.map((op, i) => {
        const m = after.at(i)
        if (!m) return Infinity
        return turned
          ? Math.max(Math.abs(op.x - m.x), Math.abs(2 * t.y + t.h - op.y - m.y))
          : Math.max(Math.abs(2 * t.x + t.w - op.x - m.x), Math.abs(op.y - m.y))
      }),
    )
    expect(worst).toBeLessThanOrEqual(1e-6)

    // Crop to the lower part of the upright picture: the face is outside it.
    await editSheet(app, sideways.name, async (sheet) => {
      await sheet.getByTestId('crop-area').focus()
      for (let i = 0; i < 120; i++) await page.keyboard.press('Shift+ArrowUp')
      for (let i = 0; i < 220; i++) await page.keyboard.press('ArrowDown')
      await expect(sheet.getByTestId('crop-readout')).toHaveText(/^Crop 848 × 1361 px at 1200, 0$/)
    })
    await app.expectPreviewSettled()
    expect(await appearances(page, 'Finding faces…')).toBe(1)
    const cropped = await pdfPage(await exportSettled(app, ['face']))
    expect(cropped.lineStrokes).toEqual([])
    // Neither the flip nor the crop sent the landmark worker anything.
    expect(await workerPosts(page, 'landmark.worker')).toBe(landmarkPosts)
  })
})

interface ProbeWindow {
  __paints: { start: number; frames: number[] }
  performance: { now(): number }
  requestAnimationFrame(cb: () => void): void
  CanvasRenderingContext2D: { prototype: { fillRect: unknown } }
  document: {
    addEventListener(type: string, cb: () => void, opts: { capture: boolean; once: boolean }): void
  }
}
type Method = (this: unknown, ...args: unknown[]) => unknown

/** Records the frame after every full repaint of a sheet canvas (as X13-L in layout-export). */
async function installPaintProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = globalThis as unknown as ProbeWindow
    w.__paints = { start: 0, frames: [] }
    const fillRect = w.CanvasRenderingContext2D.prototype.fillRect as Method
    w.CanvasRenderingContext2D.prototype.fillRect = function (
      this: { canvas: { width: number; height: number; isConnected: boolean } },
      ...args: unknown[]
    ) {
      const c = this.canvas
      if (c.isConnected && args.join() === [0, 0, c.width, c.height].join())
        w.requestAnimationFrame(() => {
          w.__paints.frames.push(w.performance.now())
        })
      return fillRect.apply(this, args)
    }
  })
}

async function armPaintProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = globalThis as unknown as ProbeWindow
    const p = { start: 0, frames: [] as number[] }
    w.__paints = p
    w.document.addEventListener(
      'input',
      () => {
        p.start = w.performance.now()
      },
      { capture: true, once: true },
    )
  })
}

/** Milliseconds from the armed input to the frame after the last sheet repaint (quiet for 500 ms). */
async function paintMs(page: Page, sheets: number): Promise<number> {
  const read = () =>
    page.evaluate(() => {
      const p = (globalThis as unknown as ProbeWindow).__paints
      return { start: p.start, frames: [...p.frames] }
    })
  await expect
    .poll(async () => {
      const p = await read()
      return p.start > 0 && p.frames.length >= sheets
    })
    .toBe(true)
  let before = JSON.stringify(await read())
  for (;;) {
    await page.waitForTimeout(500)
    const now = JSON.stringify(await read())
    if (now === before) break
    before = now
  }
  const p = await read()
  return Math.round(Math.max(...p.frames) - p.start)
}

const RUNNING = ['Tracing the outline…', 'Finding faces…', 'Finding the pose…']

test.describe('timing and the export gate', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('G-D9 20 photos with every guide drawn: a thickness change redraws within 1000 ms (CI bound; target 200 ms) and detects nothing', async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(300_000)
    const real = browserName === 'chromium'
    const files = Array.from({ length: 20 }, (_, i) => {
      const portrait = i % 2 === 0
      return {
        name: `${portrait ? 'portrait' : 'figure'}-${String(i + 1).padStart(2, '0')}.jpg`,
        mimeType: 'image/jpeg',
        buffer: readFileSync(portrait ? FIXTURES.portraitJpg : FIXTURES.figureJpg),
      }
    })
    const app = startApp(page)
    await installPaintProbe(page)
    await app.goto()
    await app.upload(files)
    await app.expectImages(20, 120_000)
    await app.expectPreviewPages(1)
    await app.openGuides()
    await select(app, 'portrait-01.jpg')
    await app.setGuide('edges', true)
    if (real) for (const kind of ['face', 'pose'] as const) await guideWithModel(app, kind)
    await app.applyLinesToAll()
    await expect(app.exportButton).toBeEnabled({ timeout: 120_000 })
    await app.expectPreviewSettled(60_000)
    const sheets = await app.pageCanvases.count()
    await countAppearances(page, RUNNING)
    const mark = guard?.mark() ?? 0

    await armPaintProbe(page)
    await app.lineSlider('Thickness').fill('1.2')
    const ms = await paintMs(page, sheets)
    testInfo.annotations.push({ type: 'thickness-redraw-ms', description: String(ms) })
    console.log(`guides thickness redraw: ${String(ms)} ms over ${String(sheets)} sheets`)
    expect(ms).toBeLessThan(1000)
    for (const text of RUNNING) expect(await appearances(page, text), text).toBe(0)
    expect((guard?.requestsSince(mark) ?? []).filter((r) => isHttp(r.url))).toEqual([])
  })

  test('G-D10 Export waits while a model downloads and a detection runs, and opens when the guides appear', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', REAL_DETECTION)
    test.setTimeout(120_000)
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    // Held at the start, well under the 30 s stall timeout (DOWNLOAD_STALL_MS).
    await page.route(`**${MODEL_PATHS.face}`, async (route) => {
      await held
      await route.continue()
    })
    const app = await withPhotos(page, FIXTURES.portraitJpg, 1)
    await app.setGuide('face', true)
    expect(await app.expectGuideSettled('face')).toBe('box')
    await expect(app.exportButton).toBeEnabled()
    await app.guideGroup('face').getByRole('button', { name: 'Download & turn on' }).click()
    await expect(app.guideGroup('face').getByRole('progressbar')).toBeVisible()
    await expect(app.exportButton).toBeDisabled()
    await expect(app.exportButton).toHaveAccessibleDescription('Finding guides in your photos…')
    await page.waitForTimeout(2000)
    await expect(app.exportButton).toBeDisabled()
    release()
    expect(await app.expectGuideSettled('face')).toBe('found')
    await expect(app.exportButton).toBeEnabled()
  })
})

/** Holds every request for a URL until `release` (well under the 30 s download stall timeout). */
async function holdRoute(page: Page, path: string): Promise<() => void> {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**${path}`, async (route) => {
    await held
    await route.continue()
  })
  return release
}

test.describe('accessibility of the guides section', () => {
  runOnly('chromium', 'firefox', 'webkit')

  for (const scheme of ['light', 'dark'] as const) {
    test(`G-A1 axe on every section state (${scheme})`, async ({ page, browserName }) => {
      test.setTimeout(240_000)
      await page.emulateMedia({ colorScheme: scheme })
      const offered = browserName !== 'firefox'
      const real = browserName === 'chromium'
      const releaseFace = offered ? await holdRoute(page, MODEL_PATHS.face) : () => undefined
      let poseCalls = 0
      await page.route(`**${MODEL_PATHS.pose}`, async (route) => {
        poseCalls++
        await route.abort('failed')
      })
      const app = await withPhotos(page, [FIXTURES.portraitJpg, FIXTURES.flatGrey], 2, (text) =>
        /Failed to load resource|pose_landmarker/.test(text),
      )
      await select(app, PORTRAIT.name)
      await app.setGuide('edges', true)
      expect(await app.expectGuideSettled('edges')).toBe('found')
      await app.setGuide('face', true)
      expect(await app.expectGuideSettled('face')).toBe(offered ? 'box' : 'unsupported')
      await expectNoAxeViolations(page)
      if (offered) {
        await app.guideGroup('face').getByRole('button', { name: 'Download & turn on' }).click()
        await expect(app.guideGroup('face').getByRole('progressbar')).toBeVisible()
        expect(await app.guideStatus('face')).toBe('downloading')
        await expectNoAxeViolations(page)
        releaseFace()
        const settled = await app.expectGuideSettled('face')
        if (real) expect(settled).toBe('found')
        await expectNoAxeViolations(page)

        await app.setGuide('pose', true)
        expect(await app.expectGuideSettled('pose')).toBe('box')
        await app.downloadModel('pose')
        expect(await app.guideStatus('pose')).toBe('download-failed')
        await expect(app.guideGroup('pose').getByRole('alert')).toBeVisible()
        expect(poseCalls).toBe(1)
        await expectNoAxeViolations(page)
      } else {
        await app.setGuide('pose', true)
        expect(await app.expectGuideSettled('pose')).toBe('unsupported')
        await expectNoAxeViolations(page)
      }
      if (real) {
        await select(app, 'flat-grey.png')
        await app.setGuide('face', true)
        expect(await app.expectGuideSettled('face')).toBe('none')
        await expectNoAxeViolations(page)
      }
    })
  }

  test('G-K1 keyboard only: Tab to the section, Space toggles, Enter downloads, arrows move Detail', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(150_000)
    const app = await withPhotos(page, FIXTURES.portraitJpg, 1)
    // Safari moves focus to buttons with Option+Tab only.
    const TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
    const tabTo = async (target: Locator) => {
      for (let i = 0; i < 40; i++) {
        if (await target.evaluate((el) => el === document.activeElement)) return
        await page.keyboard.press(TAB)
      }
      await expect(target).toBeFocused()
    }
    const linesTab = page.getByRole('tab', { name: 'Lines' })
    await linesTab.focus()
    await expect(linesTab).toBeFocused()

    await tabTo(app.guideSwitch('edges'))
    await page.keyboard.press('Space')
    await expect(app.guideSwitch('edges')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator(':focus-visible')).toHaveCount(1)
    await tabTo(app.detailSlider)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(app.detailSlider).toHaveAttribute('aria-valuetext', '53%')
    expect(await app.expectGuideSettled('edges')).toBe('found')

    await tabTo(app.guideSwitch('face'))
    await page.keyboard.press('Space')
    await expect(app.guideSwitch('face')).toHaveAttribute('aria-checked', 'true')
    if (browserName === 'firefox') {
      expect(await app.expectGuideSettled('face')).toBe('unsupported')
      return
    }
    expect(await app.expectGuideSettled('face')).toBe('box')
    const download = app.guideGroup('face').getByRole('button', { name: 'Download & turn on' })
    await tabTo(download)
    await expect(page.locator(':focus-visible')).toHaveCount(1)
    await page.keyboard.press('Enter')
    // The button leaves with focus on it; focus goes back to its switch (E1).
    await expect(app.guideSwitch('face')).toBeFocused()
    expect(await app.expectGuideSettled('face')).not.toMatch(/^(box|download-failed)$/)
    for (const path of DOWNLOAD_PATHS.face) expect(guard?.seen(path), path).toBe(1)
  })

  test('G-F1 forced colours: the badge, the download box and the progress bar (border and fill) stay visible', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'forced-colours emulation is chromium only')
    test.setTimeout(120_000)
    await page.emulateMedia({ forcedColors: 'active' })
    const release = await holdRoute(page, MODEL_PATHS.face)
    const app = await withPhotos(page, FIXTURES.portraitJpg, 1)
    const border = (l: Locator) =>
      l.evaluate((el) => {
        const s = (
          globalThis as unknown as {
            getComputedStyle(e: unknown): { borderTopStyle: string; borderTopWidth: string }
          }
        ).getComputedStyle(el)
        return `${s.borderTopStyle} ${s.borderTopWidth}`
      })
    const badge = app.guidesSection.getByText('On device', { exact: true })
    expect(await border(badge)).toBe('solid 1px')

    await app.setGuide('face', true)
    expect(await app.expectGuideSettled('face')).toBe('box')
    const box = app.guideGroup('face').locator('.lines-ai-box')
    expect(await border(box)).toBe('dashed 1px')

    await app.guideGroup('face').getByRole('button', { name: 'Download & turn on' }).click()
    const bar = app.guideGroup('face').getByRole('progressbar')
    await expect(bar).toBeVisible()
    expect(await border(bar)).toBe('solid 1px')
    // The runtime arrives while the model is held, so the fill covers part of the track.
    await expect
      .poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 30_000 })
      .toBeGreaterThan(20)
    const size = await bar.boundingBox()
    if (!size) throw new Error('no progress bar box')
    const [fill, track] = await paintedPixels(bar, [
      [size.width * 0.1, size.height / 2],
      [size.width * 0.97, size.height / 2],
    ])
    expect(Math.max(...[0, 1, 2].map((i) => Math.abs(fill[i] - track[i])))).toBeGreaterThan(60)
    release()
    await app.expectGuideSettled('face')
  })
})
