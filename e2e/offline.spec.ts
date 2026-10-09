import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_EDITS } from '../src/shared/model/image.ts'
import { DEFAULT_LINES } from '../src/shared/model/lines.ts'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import {
  AI_ASSET_PATHS,
  BASE_PATH,
  FIGURE,
  FIXTURE_FACE,
  FIXTURE_POSE,
  PORTRAIT,
  buildPaths,
  exportSettled,
  findRun,
  guideTileLines,
  pdfTileLines,
  previewProbe,
  readProbe,
  failing,
  GUIDE_SAMPLES,
  watchConsoleErrors,
} from './support/guides.ts'
import { hexRgb, isTurned, rgbDistance, trimOf } from './support/line-geometry.ts'
import { guardNetwork } from './support/network-guard.ts'
import { guideStrokes, summarizePdf } from './support/pdf.ts'
import { runOnly } from './support/projects.ts'

// The e2e tsconfig has no DOM lib; the browser globals used inside evaluate.
declare const navigator: { serviceWorker: { ready: Promise<{ active: unknown }> } }
declare const caches: {
  keys(): Promise<string[]>
  open(name: string): Promise<{ keys(): Promise<{ url: string }[]> }>
}

runOnly('chromium', 'firefox', 'webkit')
test.use({
  viewport: { width: 1280, height: 900 },
  // The only spec where the app's service worker runs (M4-R20).
  serviceWorkers: 'allow',
  // CI's Linux Firefox has no WebGL (C1-R1). Turned off here too, so a local run takes CI's path.
  launchOptions: { firefoxUserPrefs: { 'webgl.disabled': true } },
})

const GREEN = '#00ff00'
const STYLE = { colour: GREEN, widthMm: 1, opacityPct: 100 }

/** Every Cache Storage entry, as cache name → request paths. */
async function cacheContents(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {}
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      out[name] = (await cache.keys()).map((r) => r.url)
    }
    return out
  })
}

test('G-X1 works offline once the models are cached: reload from the service worker, add photos, guides in the preview and the PDF', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit fails an offline reload through a service worker ("WebKit encountered an internal error", C1-R1); the owner checks WebKit offline on the iPhone at sign-off',
  )
  test.setTimeout(240_000)
  const real = browserName === 'chromium'
  const guard = guardNetwork(page)
  const consoleErrors = watchConsoleErrors(page)
  // The service worker's own requests (its precache) are reported on the context in chromium.
  const contextRequests: { url: string; method: string; body: boolean }[] = []
  context.on('request', (r) => {
    contextRequests.push({ url: r.url(), method: r.method(), body: r.postDataBuffer() !== null })
  })
  const app = new AppPage(page)
  await app.goto()
  expect(
    await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.active !== null)),
  ).toBe(true)

  // Online: download both models where they are offered (CI Firefox has no WebGL: owner Q15).
  await app.upload(FIXTURES.portraitJpg)
  await app.expectImages(1)
  await app.openGuides()
  for (const kind of ['face', 'pose'] as const) {
    await app.setGuide(kind, true)
    const offered = await app.expectGuideSettled(kind)
    expect(offered).toBe(real ? 'box' : 'unsupported')
    if (offered === 'box') await app.downloadModel(kind)
  }
  await app.removeAll()
  await app.expectImages(0)

  // Offline: the page comes from the service worker.
  await context.setOffline(true)
  const offlineFrom = guard.mark()
  const response = await page.reload()
  expect(response?.fromServiceWorker()).toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: 'Artistica' })).toBeAttached()
  await page.getByRole('radio', { name: 'mm', exact: true }).click()
  await app.setPaper('A4')
  await app.upload([FIXTURES.portraitJpg, FIXTURES.figureJpg])
  await app.expectImages(2)
  await app.openGuides()
  await app.selectButton(PORTRAIT.name).click()
  await app.setLineStyle(STYLE)
  for (const kind of ['edges', 'face', 'pose'] as const) await app.setGuide(kind, true)
  await app.applyLinesToAll()
  const want = real ? 'found' : 'unsupported'
  expect(await app.expectGuideSettled('face')).toBe(want)
  expect(await app.expectGuideSettled('edges')).toBe('found')
  await app.selectButton(FIGURE.name).click()
  expect(await app.expectGuideSettled('pose')).toBe(want)
  expect(await app.expectGuideSettled('edges')).toBe('found')
  for (const kind of ['face', 'pose'] as const)
    expect(await app.guideStatus(kind)).not.toMatch(/^(box|downloading|download-failed)$/)

  const bytes = await exportSettled(app, ['edges', 'face', 'pose'])
  const info = await summarizePdf(bytes)
  expect(info.pageCount).toBe(1)
  const p = info.pages[0]
  expect(p.draws).toHaveLength(2)
  const strokes = guideStrokes(p)
  expect(strokes).toHaveLength(2)
  const photos = p.draws.map((d) =>
    Math.abs(d.wPt / d.hPt - PORTRAIT.pxW / PORTRAIT.pxH) < 0.01 ||
    Math.abs(d.hPt / d.wPt - PORTRAIT.pxW / PORTRAIT.pxH) < 0.01
      ? PORTRAIT
      : FIGURE,
  )
  expect(new Set(photos.map((ph) => ph.name)).size).toBe(2)
  p.draws.forEach((d, i) => {
    const photo = photos[i]
    const ops = strokes[i]?.ops ?? []
    expect(ops.length, `${photo.name} has guide strokes`).toBeGreaterThan(20)
    if (!real) return
    // The face on the portrait and the pose on the figure equal the recorded detections.
    const trim = trimOf(d, p.heightPt)
    const turned = isTurned(d, photo.pxW, photo.pxH)
    const img = { pxW: photo.pxW, pxH: photo.pxH, edits: DEFAULT_EDITS }
    const only =
      photo === PORTRAIT
        ? { faces: [FIXTURE_FACE], poses: null, edges: null }
        : { faces: null, poses: [FIXTURE_POSE], edges: null }
    const lines = {
      ...DEFAULT_LINES,
      face: photo === PORTRAIT,
      pose: photo === FIGURE,
      style: { ...DEFAULT_LINES.style, ...STYLE },
    }
    const part = guideTileLines({ ...img, lines }, only, trim, turned).strokes[0]?.cmds ?? []
    expect(part.length).toBeGreaterThan(0)
    expect(
      findRun(ops, part, 1e-6),
      `${photo.name}: the recorded guide in the PDF`,
    ).toBeGreaterThanOrEqual(0)
  })

  // The preview draws the line colour along what the PDF drew, on both tiles.
  const tiles = p.draws.map((d, i) =>
    pdfTileLines(p, i, trimOf(d, p.heightPt), GREEN, STYLE.widthMm),
  )
  const probe = await previewProbe(app, p.widthPt / (72 / 25.4), tiles, GUIDE_SAMPLES)
  const lit = await readProbe(app, probe)
  const counts = probe.tiles.map((t) => t.on.length)
  testInfo.annotations.push({ type: 'preview-on-samples', description: JSON.stringify(counts) })
  for (const n of counts) expect(n).toBeGreaterThanOrEqual(10)
  const colour = hexRgb(GREEN)
  expect(
    probe.tiles.flatMap((t, k) =>
      failing(
        `tile ${String(k)} on`,
        t.on,
        lit[k]?.on ?? [],
        (px) => rgbDistance(px, colour) <= 60,
      ),
    ),
  ).toEqual([])

  // Nothing left the device: offline, every request was a same-origin GET of a build file.
  const build = buildPaths()
  const origin = new URL(page.url()).origin
  const offline = guard.requestsSince(offlineFrom).filter((r) => /^https?:/.test(r.url))
  expect(offline.length).toBeGreaterThan(0)
  for (const r of [...guard.requestsSince(0), ...contextRequests].filter((q) =>
    /^https?:/.test(q.url),
  )) {
    const u = new URL(r.url)
    expect(
      {
        method: r.method,
        body: r.body,
        origin: u.origin,
        query: u.search,
        build: build.has(u.pathname),
      },
      r.url,
    ).toEqual({
      method: 'GET',
      body: false,
      origin,
      query: '',
      build: true,
    })
  }
  for (const path of AI_ASSET_PATHS)
    expect(
      offline.filter((r) => new URL(r.url).pathname === path),
      path,
    ).toEqual([])

  // G-P2 with the shell: only the AI cache and the app shell, holding only AI assets and build files.
  const cached = await cacheContents(page)
  for (const [name, urls] of Object.entries(cached)) {
    expect(name).toMatch(/^(artistica-ai-v1|artistica-shell-.+)$/)
    for (const url of urls) {
      const u = new URL(url)
      expect(u.origin, url).toBe(origin)
      if (name === 'artistica-ai-v1') expect(AI_ASSET_PATHS, url).toContain(u.pathname)
      else expect(build.has(u.pathname), url).toBe(true)
    }
  }
  // The shell holds the app page and every script and stylesheet the app can load, lazy workers
  // included; only the AI runtime stays out of it (C3's cache holds it). Firefox can answer an
  // offline reload from its HTTP cache too, so this is what proves its shell on firefox.
  const shell = Object.entries(cached).filter(([n]) => n.startsWith('artistica-shell-'))
  expect(shell).toHaveLength(1)
  const shellPaths = new Set(shell.flatMap(([, urls]) => urls.map((u) => new URL(u).pathname)))
  const needed = [...build].filter(
    (path) =>
      path === `${BASE_PATH}app/index.html` ||
      (/\/assets\/.+\.(js|css)$/.test(path) && !AI_ASSET_PATHS.includes(path)),
  )
  expect(needed.length).toBeGreaterThan(10)
  expect(needed.filter((path) => !shellPaths.has(path))).toEqual([])
  expect(Object.entries(cached).find(([n]) => n === 'artistica-ai-v1')?.[1].length ?? 0).toBe(
    real ? 4 : 0,
  )

  expect(guard.violations()).toEqual([])
  expect(consoleErrors()).toEqual([])
})
