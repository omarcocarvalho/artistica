import { existsSync } from 'node:fs'
import { PDFDocument, cmyk, rgb } from '@pdfme/pdf-lib'
import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import {
  findOverflow,
  findPseudoLeak,
  findUntranslated,
  labelInName,
  pageLanguage,
  REFLOW_VIEWPORT,
  setLanguage,
} from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { mmToPt, summarizePdf } from './support/pdf.ts'
import { solidGrayPng } from './support/png.ts'
import { runOnly } from './support/projects.ts'
import { syntheticJpegs } from './support/synthetic.ts'
import { installWorkerProbe, maxLiveWorkers, workerLog, workerPosts } from './support/workers.ts'

interface FetchHost {
  fetch(url: string, init?: { method?: string; body?: string }): Promise<unknown>
}

test.describe('support helpers (chromium)', () => {
  runOnly('chromium')

  test('summarizePdf reads page sizes, image draws and vector strokes through the render inspector', async () => {
    const doc = await PDFDocument.create()
    const png = await doc.embedPng(solidGrayPng(4, 4, 128))
    const a4 = doc.addPage([mmToPt(210), mmToPt(297)])
    a4.drawImage(png, { x: 10, y: 10, width: 50, height: 50 })
    a4.drawImage(png, { x: 70, y: 10, width: 50, height: 50 })
    a4.drawLine({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, color: cmyk(1, 1, 1, 1) })
    a4.drawLine({ start: { x: 0, y: 20 }, end: { x: 10, y: 30 }, color: rgb(1, 0, 0) })
    doc.addPage([612, 792])
    const info = await summarizePdf(await doc.save())
    expect(info.pageCount).toBe(2)
    expect(info.imageCount).toBe(1)
    expect(info.pages[0]?.widthPt).toBeCloseTo(595.28, 1)
    expect(info.pages[0]?.heightPt).toBeCloseTo(841.89, 1)
    expect(info.pages[0]?.imagePlacements).toBe(2)
    expect(info.pages[0]?.strokes).toBe(1)
    expect(info.pages[0]?.markSegments).toEqual([{ x1: 0, y1: 0, x2: 10, y2: 10 }])
    expect(info.pages[0]?.markGeometry).toEqual(['0 0', '0 0'])
    expect(info.pages[1]).toMatchObject({ widthPt: 612, heightPt: 792, imagePlacements: 0 })
  })

  test('solidGrayPng writes a valid PNG header with the requested size', () => {
    const png = solidGrayPng(30, 20, 7)
    expect(Buffer.from(png.subarray(1, 4)).toString('ascii')).toBe('PNG')
    expect(Buffer.from(png).readUInt32BE(16)).toBe(30)
    expect(Buffer.from(png).readUInt32BE(20)).toBe(20)
  })

  test("the images feature's fixtures exist where FIXTURES says they do", () => {
    for (const path of Object.values(FIXTURES)) expect(existsSync(path), path).toBe(true)
  })

  test('the app loads with no off-origin or mutating requests (network guard)', async ({
    page,
  }) => {
    const guard = guardNetwork(page)
    const app = new AppPage(page)
    await app.goto()
    await expect(page.getByRole('heading', { name: 'Add some reference photos' })).toBeVisible()
    await expect(page.getByLabel('Paper size')).toHaveValue('A4')
    expect(guard.violations()).toEqual([])
  })

  test('the network guard is strict by default and honours the typed-URL allow-list', async ({
    page,
  }) => {
    await page.route('https://typed.example/**', (route) =>
      route.fulfill({ status: 200, body: 'x' }),
    )
    await page.route('https://other.example/**', (route) =>
      route.fulfill({ status: 200, body: 'x' }),
    )
    const guard = guardNetwork(page)
    await new AppPage(page).goto()
    const host = (u: string, init?: { method?: string; body?: string }) =>
      page.evaluate(([url, i]) => (globalThis as unknown as FetchHost).fetch(url, i as object), [
        u,
        init,
      ] as const)

    guard.allowExternal('https://typed.example/photo.jpg?x=1')
    await host('https://typed.example/photo.jpg?x=1')
    expect(guard.violations()).toEqual([])
    await host('https://typed.example/photo.jpg')

    await host('https://typed.example/photo.jpg', { method: 'POST', body: 'secret' })
    await host('https://other.example/track')
    await host('/artistica/app/', { method: 'POST', body: 'a' })
    expect(guard.violations()).toEqual([
      'GET https://typed.example/photo.jpg',
      'POST https://typed.example/photo.jpg (with body)',
      'GET https://other.example/track',
      'POST http://localhost:' + new URL(page.url()).port + '/artistica/app/ (with body)',
    ])
  })

  test('syntheticJpegs encodes real JPEGs in the page', async ({ page }) => {
    await new AppPage(page).goto()
    const files = await syntheticJpegs(page, 2, 64, 48)
    expect(files.map((f) => f.name)).toEqual(['synthetic-01.jpg', 'synthetic-02.jpg'])
    for (const f of files) expect([...f.buffer.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
  })

  test('the network guard treats any WebSocket as a violation', async ({ page }) => {
    const guard = guardNetwork(page)
    await new AppPage(page).goto()
    await page.evaluate(() => {
      const ws = new (
        globalThis as unknown as { WebSocket: new (u: string) => { onerror: unknown } }
      ).WebSocket('wss://unroutable.invalid/socket')
      ws.onerror = () => undefined
    })
    await expect
      .poll(() => guard.violations())
      .toContain('WEBSOCKET wss://unroutable.invalid/socket')
  })
})

interface TestWorkerWindow {
  Blob: new (parts: string[], opts: { type: string }) => unknown
  URL: { createObjectURL(b: unknown): string; revokeObjectURL(u: string): void }
  Worker: new (url: string) => {
    onmessage: ((e: { data: unknown }) => void) | null
    postMessage(msg: unknown): void
    terminate(): void
  }
}

/** Posts one Comlink-shaped `prepare('face')` to a test worker that echoes it, then terminates it. */
async function prepareOnTestWorker(): Promise<unknown> {
  const w = globalThis as unknown as TestWorkerWindow
  const src = 'onmessage = (e) => postMessage(e.data.argumentList[0].value)'
  const blob = w.URL.createObjectURL(new w.Blob([src], { type: 'text/javascript' }))
  const worker = new w.Worker(`${blob}#selfcheck.worker-0`)
  const reply = await new Promise<unknown>((resolve) => {
    worker.onmessage = (e) => {
      resolve(e.data)
    }
    worker.postMessage({ type: 'APPLY', path: ['prepare'], argumentList: [{ value: 'face' }] })
  })
  worker.terminate()
  w.URL.revokeObjectURL(blob)
  return reply
}

test('the worker probe logs one new, post, prepare and terminate of a test worker under its script name', async ({
  page,
}) => {
  await installWorkerProbe(page)
  await new AppPage(page).goto()
  expect(await page.evaluate(prepareOnTestWorker)).toBe('face')
  const log = (await workerLog(page)).filter((e) => e.name === 'selfcheck.worker')
  expect(log.map((e) => [e.ev, e.model])).toEqual([
    ['new', undefined],
    ['post', undefined],
    ['prepare', 'face'],
    ['terminate', undefined],
  ])
  expect(new Set(log.map((e) => e.id)).size).toBe(1)
  expect(log.map((e) => e.t)).toEqual(log.map((e) => e.t).toSorted((a, b) => a - b))
  expect(await workerPosts(page, 'selfcheck.worker')).toBe(1)
  expect(await maxLiveWorkers(page, 'selfcheck.worker')).toBe(1)
})

/** Two test workers start; the first is terminated twice; two more start while the second lives. */
function overlapTestWorkers(): void {
  const w = globalThis as unknown as TestWorkerWindow
  const blob = w.URL.createObjectURL(new w.Blob([''], { type: 'text/javascript' }))
  const a = new w.Worker(`${blob}#overlap.worker-0`)
  const b = new w.Worker(`${blob}#overlap.worker-0`)
  a.terminate()
  a.terminate()
  const c = new w.Worker(`${blob}#overlap.worker-0`)
  const d = new w.Worker(`${blob}#overlap.worker-0`)
  b.terminate()
  c.terminate()
  d.terminate()
  w.URL.revokeObjectURL(blob)
}

test('the worker probe counts workers alive at once, and a second terminate of one worker once', async ({
  page,
}) => {
  await installWorkerProbe(page)
  await new AppPage(page).goto()
  await page.evaluate(overlapTestWorkers)
  const log = (await workerLog(page)).filter((e) => e.name === 'overlap.worker')
  expect(log.map((e) => [e.ev, e.id - (log[0]?.id ?? 0)])).toEqual([
    ['new', 0],
    ['new', 1],
    ['terminate', 0],
    ['terminate', 0],
    ['new', 2],
    ['new', 3],
    ['terminate', 1],
    ['terminate', 2],
    ['terminate', 3],
  ])
  expect(await maxLiveWorkers(page, 'overlap.worker')).toBe(3)
  expect(await workerPosts(page, 'overlap.worker')).toBe(0)
})

test.describe('localisation probes (D3): each finds what it is for before it is trusted', () => {
  runOnly('chromium')

  async function pseudoApp(page: Page): Promise<NetworkGuard> {
    const guard = guardNetwork(page)
    await new AppPage(page).goto()
    await setLanguage(page, 'pseudo')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('⟦')
    return guard
  }

  /** Adds `html` in a 160 px box at the top of the page. */
  async function plant(page: Page, html: string): Promise<void> {
    await page.evaluate(`(() => {
      const box = document.createElement('div')
      box.dataset.testid = 'planted'
      box.style.width = '160px'
      box.innerHTML = ${JSON.stringify(html)}
      document.body.prepend(box)
    })()`)
  }

  test('the pseudo-locale is on every string of the empty workspace', async ({ page }) => {
    const guard = await pseudoApp(page)
    expect(await page.title()).toContain('⟦')
    expect(await findUntranslated(page)).toEqual([])
    expect(guard.violations()).toEqual([])
  })

  test('findUntranslated reports a planted literal, a literal name, a literal in a <Trans> message and a literal joined to a message', async ({
    page,
  }) => {
    await pseudoApp(page)
    await plant(
      page,
      '<p>Hard-coded words</p><button type="button" aria-label="Close it">⟦X⟧</button>' +
        '<p>⟦Ŝóɱé <strong>ƀóĺď</strong> ŵóŕďš⟧ <em>stray</em></p><input placeholder="Type here">' +
        '<p>⟦Ŝàʋé⟧ (beta)</p><button type="button" aria-label="⟦Ŝàʋé⟧ now">⟦Ŝàʋé⟧</button>' +
        '<p>⟦Ŝàʋé ⟦Ńéšţéď⟧⟧ · 12 mm · photo.jpg</p><p>photo.jpg removed</p>',
    )
    const found = await findUntranslated(page)
    expect(found.filter((f) => f.includes('Hard-coded words'))).toHaveLength(1)
    expect(found.filter((f) => f.startsWith('aria-label "Close it"'))).toHaveLength(1)
    expect(found.filter((f) => f.includes('"stray"'))).toHaveLength(1)
    expect(found.filter((f) => f.startsWith('placeholder "Type here"'))).toHaveLength(1)
    expect(found.filter((f) => f.includes('(beta)'))).toHaveLength(1)
    expect(found.filter((f) => f.startsWith('aria-label "⟦Ŝàʋé⟧ now'))).toHaveLength(1)
    expect(found.filter((f) => f.includes('ƀóĺď') || f.includes('Ńéšţéď'))).toEqual([])
    expect(found.filter((f) => f.includes('photo.jpg removed'))).toHaveLength(1)
    expect(found).toHaveLength(7)
  })

  test('findUntranslated lets numbers, file names, the app name and endonyms through', async ({
    page,
  }) => {
    await pseudoApp(page)
    await plant(
      page,
      '<p>12,5 mm</p><p>quadrants.jpg</p><p>Artistica</p><p>日本語</p><p>3 / 4</p><p>A4</p>',
    )
    expect(await findUntranslated(page)).toEqual([])
  })

  test('findPseudoLeak reports ⟦…⟧ text and names', async ({ page }) => {
    await pseudoApp(page)
    expect((await findPseudoLeak(page)).length).toBeGreaterThan(5)
    await setLanguage(page, 'en')
    expect(await findPseudoLeak(page)).toEqual([])
    await plant(page, '<button type="button" aria-label="⟦Ŝàʋé⟧">Save</button>')
    expect(await findPseudoLeak(page)).toEqual([expect.stringContaining('aria-label "⟦Ŝàʋé⟧"')])
  })

  test('findOverflow reports a planted overflowing chip and clipped text, not a chip that wraps', async ({
    page,
  }) => {
    await pseudoApp(page)
    await plant(
      page,
      '<button type="button" class="ds-chip" style="white-space: nowrap">⟦Ŵáýţóóĺóñĝçĥíƥĺáƀéĺ ĺóŕéɱ íƥšúɱ⟧</button>' +
        '<div style="width: 60px; overflow: hidden; white-space: nowrap">⟦Çĺíƥƥéď ţéẋţ ĥéŕé⟧</div>' +
        '<button type="button" class="ds-chip">⟦Ŵŕáƥƥíñĝ çĥíƥ ţĥáţ ƒíţš⟧</button>',
    )
    const found = (await findOverflow(page)).filter((f) => /Ŵáýţóóĺóñĝ|Çĺíƥƥéď|Ŵŕáƥƥíñĝ/u.test(f))
    expect(found).toEqual([
      expect.stringMatching(/Ŵáýţóóĺóñĝ.*: box /u),
      expect.stringMatching(/Çĺíƥƥéď.*: clipped /u),
    ])
  })

  test('findOverflow reports a column or a wrapping row that scrolls sideways, not a single row of items meant to scroll', async ({
    page,
  }) => {
    await pseudoApp(page)
    await plant(
      page,
      '<div data-probe="column" style="overflow: auto; height: 60px; display: flex; flex-direction: column">' +
        '<div style="width: 400px">⟦Ŵíďé çóñţéñţ⟧</div><p>⟦Ŝĥóŕţ⟧</p></div>' +
        '<div data-probe="block" style="overflow-y: auto; height: 60px"><div style="display: grid">' +
        '<p style="width: 300px">⟦Ĝŕíď çéĺĺ⟧</p></div></div>' +
        '<div data-probe="row" style="display: flex; overflow-x: auto; gap: 8px">' +
        '<span style="flex: none; width: 120px">⟦Ţĥúɱƀ⟧</span><span style="flex: none; width: 120px">⟦Ţĥúɱƀ⟧</span></div>' +
        '<div data-probe="wrapped" style="display: flex; flex-wrap: wrap; overflow-x: auto">' +
        '<span style="flex: none; width: 300px">⟦Ŵŕáƥƥéď⟧</span></div>',
    )
    const found = (await findOverflow(page)).filter((f) => f.includes('scrolls sideways'))
    expect(found).toEqual([
      expect.stringMatching(/Ŵíďé çóñţéñţ.*: scrolls sideways \(400 in 160\)/u),
      expect.stringMatching(/Ĝŕíď çéĺĺ.*: scrolls sideways \(300 in 160\)/u),
      expect.stringMatching(/Ŵŕáƥƥéď.*: scrolls sideways \(300 in 160\)/u),
    ])
  })

  test('labelInName reports a control whose name leaves out its visible text, and only that', async ({
    page,
  }) => {
    await pseudoApp(page)
    const before = await labelInName(page)
    await plant(
      page,
      '<button type="button" aria-label="⟦Ĉĺóšé⟧">⟦Ðíšɱíšš⟧</button>' +
        '<button type="button" aria-label="Change theme: Auto">Auto</button>' +
        '<button type="button" aria-label="photo.jpg"><span aria-hidden="true">Values</span></button>' +
        '<button type="button" aria-label="Remove">Remove all</button>' +
        '<button type="button" aria-label="Remove all images">Remove all</button>',
    )
    const found = await labelInName(page)
    expect(found.slice(before.length)).toEqual([
      expect.stringContaining('shows "⟦Ðíšɱíšš⟧"'),
      expect.stringContaining('shows "Remove all", named "Remove"'),
    ])
  })

  test('labelInName checks form fields and sliders named by aria-label against their visible label', async ({
    page,
  }) => {
    await pseudoApp(page)
    const before = await labelInName(page)
    await plant(
      page,
      '<label for="p-gutter">Image gap</label><input id="p-gutter" aria-label="Gap">' +
        '<label for="p-bleed">Bleed</label><input id="p-bleed" aria-label="Bleed in mm">' +
        '<label>Paper size <select aria-label="Size"><option>Letter</option></select></label>' +
        '<label>Notes <textarea aria-label="Notes for print"></textarea></label>' +
        '<label for="p-hidden" class="sr-only">Hidden words</label><input id="p-hidden" aria-label="Other">' +
        '<label><input type="checkbox" aria-label="Marks"> Crop marks</label>' +
        '<div role="spinbutton" tabindex="0" aria-valuenow="3" aria-label="Copies">Count 3</div>' +
        '<div role="slider" tabindex="0" aria-valuenow="5" aria-label="Blur strength">Blur</div>',
    )
    const found = (await labelInName(page)).slice(before.length)
    expect(found).toEqual([
      expect.stringContaining('shows "Image gap", named "Gap"'),
      expect.stringContaining('shows "Paper size", named "Size"'),
      expect.stringContaining('shows "Crop marks", named "Marks"'),
      expect.stringContaining('shows "Count 3", named "Copies"'),
    ])
  })

  test('the reflow walks run at 320 CSS pixels (WCAG 1.4.10)', () => {
    expect(REFLOW_VIEWPORT.width).toBe(320)
  })

  test('findOverflow reports a box that runs past the viewport at 320 px, once, and not its contents', async ({
    page,
  }) => {
    await page.setViewportSize(REFLOW_VIEWPORT)
    const guard = guardNetwork(page)
    await new AppPage(page).goto()
    const past = async () =>
      (await findOverflow(page)).filter((f) => f.includes('past the viewport'))
    expect(await past()).toEqual([])
    await page.addStyleTag({ content: 'header { min-width: 330px }' })
    expect(await past()).toEqual([
      expect.stringMatching(/> header\.[^>]*: box .* past the viewport \(330 in 320\)$/),
    ])
    expect(guard.violations()).toEqual([])
  })

  test('pageLanguage reads lang and title, and reports a page that scrolls sideways at 320 px', async ({
    page,
  }) => {
    await page.setViewportSize(REFLOW_VIEWPORT)
    const guard = guardNetwork(page)
    await new AppPage(page).goto()
    expect(await pageLanguage(page)).toEqual({ lang: 'en', title: 'Artistica app', sideScroll: 0 })
    await plant(page, '<div style="width: 400px; height: 1px"></div>')
    expect((await pageLanguage(page)).sideScroll).toBeGreaterThanOrEqual(80)
    expect(guard.violations()).toEqual([])
  })

  test('labelInName reads a change between CJK and Latin script as a word boundary, and nothing else', async ({
    page,
  }) => {
    await pseudoApp(page)
    const before = await labelInName(page)
    await plant(
      page,
      '<button type="button" aria-label="quadrants.jpgを選択">quadrants.jpg</button>' +
        '<button type="button" aria-label="Artisticaホーム">Artistica</button>' +
        '<button type="button" aria-label="PDFを作成">PDF</button>' +
        '<button type="button" aria-label="2장 선택됨">2</button>' +
        '<button type="button" aria-label="选中的照片">选中</button>' +
        '<button type="button" aria-label="ホーム">Artistica</button>' +
        '<button type="button" aria-label="Pages setup">Page</button>' +
        '<button type="button" aria-label="Automatic theme">Auto</button>',
    )
    const found = (await labelInName(page)).slice(before.length)
    expect(found).toEqual([
      expect.stringContaining('shows "选中"'),
      expect.stringContaining('shows "Artistica", named "ホーム"'),
      expect.stringContaining('shows "Page"'),
      expect.stringContaining('shows "Auto"'),
    ])
  })
})
