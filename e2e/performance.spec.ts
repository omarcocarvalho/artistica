import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { AppPage, type LineTypeName } from './support/app.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'
import { mixedJpegs, syntheticJpegs, type UploadFile } from './support/synthetic.ts'

/** Spec §3 targets (M5-R27, owner Q11 and Q12 defaults). A miss is fixed, never relaxed. */
const LAYOUT_50_BUDGET_MS = 500
const PREVIEW_UPDATE_BUDGET_MS = 200
const STUDIES_SETTLED_BOUND_MS = 1000
const LARGE_SET_LAYOUT_BUDGET_MS = 2000
const LARGE_SET_LONG_TASK_BUDGET_MS = 1000
const CHANGES_PER_KIND = 5
const PHONE_CPU_SLOWDOWN = 4

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

interface PerfEntry {
  name: string
  t: number
  d: number
  page: number | null
}
interface PerfProbe {
  entries: PerfEntry[]
  longTasks: { t: number; d: number }[]
  t0: number | null
  disarm(): void
  flush(): void
}
interface ProbeElement {
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number }
  parentElement: ProbeElement | null
}
interface ProbeWindow {
  __perf: PerfProbe
  innerWidth: number
  innerHeight: number
  performance: { now(): number }
  getComputedStyle(el: ProbeElement): { overflowX: string; overflowY: string }
  document: {
    querySelector(s: string): unknown
    querySelectorAll(s: string): ProbeElement[]
    addEventListener(
      type: string,
      cb: (e: { timeStamp: number }) => void,
      opts: { capture: boolean; signal: unknown },
    ): void
  }
  AbortController: new () => { signal: unknown; abort(): void }
  PerformanceObserver: new (
    cb: (list: {
      getEntries(): { name: string; startTime: number; duration: number; detail?: unknown }[]
    }) => void,
  ) => {
    observe(opts: { type?: string; entryTypes?: string[]; buffered?: boolean }): void
    takeRecords(): { name: string; startTime: number; duration: number; detail?: unknown }[]
  }
}

/**
 * Collects the app's `artistica:*` marks and measures (M5-R27) and, where the browser reports
 * them, long tasks. Everything stays in the page; the test reads it back.
 */
async function installPerfProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = globalThis as unknown as ProbeWindow
    const probe: PerfProbe = {
      entries: [],
      longTasks: [],
      t0: null,
      disarm: () => undefined,
      flush: () => undefined,
    }
    w.__perf = probe
    const keep = (
      list: { name: string; startTime: number; duration: number; detail?: unknown }[],
    ) => {
      for (const e of list) {
        if (!e.name.startsWith('artistica:')) continue
        const page = (e.detail as { page?: unknown } | null | undefined)?.page
        probe.entries.push({
          name: e.name.slice('artistica:'.length),
          t: e.startTime,
          d: e.duration,
          page: typeof page === 'number' ? page : null,
        })
      }
    }
    const timing = new w.PerformanceObserver((list) => {
      keep(list.getEntries())
    })
    timing.observe({ entryTypes: ['mark', 'measure'] })
    probe.flush = () => {
      keep(timing.takeRecords())
    }
    try {
      new w.PerformanceObserver((list) => {
        for (const e of list.getEntries()) probe.longTasks.push({ t: e.startTime, d: e.duration })
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // Only Chromium reports long tasks.
    }
  })
}

/** The next pointerdown, keydown or input anywhere in the page starts the clock (M5-R27). */
async function arm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = globalThis as unknown as ProbeWindow
    const probe = w.__perf
    probe.flush()
    probe.disarm()
    probe.t0 = null
    const stop = new w.AbortController()
    probe.disarm = () => {
      stop.abort()
    }
    for (const type of ['pointerdown', 'keydown', 'input'])
      w.document.addEventListener(
        type,
        (e) => {
          const now = w.performance.now()
          probe.t0 = e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now
          stop.abort()
        },
        { capture: true, signal: stop.signal },
      )
  })
}

interface Update {
  /** Input event to the last visible page's first draw after the new page models (M5-R27). */
  updateMs: number
  /** Input event to the last draw of a visible page, study tiles included. */
  settledMs: number
  /** Worker round trip of the layout call, when the change needed one. */
  layoutMs: number | null
  visiblePages: number
}

/** Waits for the armed change to reach the screen and reads its timings. */
async function readUpdate(app: AppPage, timeout = 30_000): Promise<Update> {
  const { page } = app
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const probe = (globalThis as unknown as ProbeWindow).__perf
          probe.flush()
          const t0 = probe.t0
          return t0 !== null && probe.entries.some((e) => e.name === 'models:end' && e.t >= t0)
        }),
      { timeout },
    )
    .toBe(true)
  await app.expectPreviewSettled(timeout)
  const r = await page.evaluate(() => {
    const w = globalThis as unknown as ProbeWindow
    const probe = w.__perf
    probe.flush()
    const t0 = probe.t0
    if (t0 === null) return { error: 'no input event' }
    const after = probe.entries.filter((e) => e.t >= t0)
    const modelsEnd = after.filter((e) => e.name === 'models:end').at(-1)?.t
    if (modelsEnd === undefined) return { error: 'no page models after the input' }
    const onScreen = (el: ProbeElement): boolean => {
      let { left, top, right, bottom } = el.getBoundingClientRect()
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = w.getComputedStyle(p)
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
        const c = p.getBoundingClientRect()
        left = Math.max(left, c.left)
        top = Math.max(top, c.top)
        right = Math.min(right, c.right)
        bottom = Math.min(bottom, c.bottom)
      }
      right = Math.min(right, w.innerWidth)
      bottom = Math.min(bottom, w.innerHeight)
      return right > Math.max(left, 0) && bottom > Math.max(top, 0)
    }
    const visible = [...w.document.querySelectorAll('main figure canvas')]
      .map((c, i) => (onScreen(c) ? i : -1))
      .filter((i) => i >= 0)
    const draws = after.filter((e) => e.name === 'draw:end' && e.page !== null)
    const firstDraws: number[] = []
    for (const i of visible) {
      const first = draws.find((e) => e.page === i && e.t >= modelsEnd)
      if (!first) return { error: `visible page ${String(i + 1)} was not redrawn` }
      firstDraws.push(first.t)
    }
    if (firstDraws.length === 0) return { error: 'no visible page' }
    const lastDraw = Math.max(
      ...draws.filter((e) => e.page !== null && visible.includes(e.page)).map((e) => e.t),
    )
    const layout = after.filter((e) => e.name === 'layout').at(-1)
    return {
      updateMs: Math.max(...firstDraws) - t0,
      settledMs: lastDraw - t0,
      layoutMs: layout ? layout.d : null,
      visiblePages: visible.length,
    }
  })
  if ('error' in r) throw new Error(r.error)
  return r
}

/** Each layout measure (worker round trip) that ended after the armed input. */
async function layoutsSinceArm(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const probe = (globalThis as unknown as ProbeWindow).__perf
    probe.flush()
    const t0 = probe.t0 ?? Infinity
    return probe.entries.filter((e) => e.name === 'layout' && e.t >= t0).map((e) => e.d)
  })
}

async function waitForLayout(page: Page, timeout = 30_000): Promise<number> {
  await expect.poll(() => layoutsSinceArm(page), { timeout }).not.toHaveLength(0)
  const all = await layoutsSinceArm(page)
  return all.at(-1) ?? NaN
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] ?? NaN) : ((s[mid - 1] ?? NaN) + (s[mid] ?? NaN)) / 2
}
const round = (ms: number) => Math.round(ms)

function record(testInfo: TestInfo, label: string, figures: Record<string, unknown>): void {
  for (const [type, value] of Object.entries(figures))
    testInfo.annotations.push({
      type,
      description: typeof value === 'string' ? value : JSON.stringify(value),
    })
  console.log(`${label}: ${JSON.stringify(figures)}`)
}

async function start(page: Page): Promise<AppPage> {
  guard = guardNetwork(page)
  await installPerfProbe(page)
  const app = new AppPage(page)
  await app.goto()
  return app
}

async function load(app: AppPage, photos: UploadFile[], timeout = 60_000): Promise<number> {
  const t = Date.now()
  await app.upload(photos)
  await app.expectImages(photos.length, timeout)
  const importMs = Date.now() - t
  await app.expectPreviewPages(1)
  await app.expectPreviewSettled(timeout)
  return importMs
}

const PAPERS = ['Letter', 'A5', 'A3', 'Legal', 'A4'] as const

/** One layout per paper change, each read back as the worker round trip. */
async function paperLayouts(app: AppPage): Promise<number[]> {
  const out: number[] = []
  for (const paper of PAPERS) {
    await arm(app.page)
    await app.setPaper(paper)
    out.push(await waitForLayout(app.page))
    await app.expectPreviewSettled(60_000)
  }
  return out
}

test.describe('§3 timing targets, desktop (chromium asserts)', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('T1 auto layout of 50 images in the worker < 500 ms (median of 5 paper changes)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    const app = await start(page)
    const photos = await mixedJpegs(page, 50, 4000)
    await load(app, photos, 120_000)
    const layouts = await paperLayouts(app)
    const layoutMedianMs = round(median(layouts))
    record(testInfo, 'T1 layout 50', {
      layoutMedianMs,
      layoutsMs: layouts.map(round),
      pages: await app.pageCanvases.count(),
    })
    expect(layouts).toHaveLength(CHANGES_PER_KIND)
    expect(layoutMedianMs).toBeLessThan(LAYOUT_50_BUDGET_MS)
  })

  test('T2 preview update after a setting change with 20 images < 200 ms (median of 5 per kind; studies recorded)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(420_000)
    const app = await start(page)
    const photos = await mixedJpegs(page, 20, 4000)
    await load(app, photos, 120_000)
    const first = photos[0]?.name ?? ''

    const runs: Record<string, Update[]> = {}
    const measure = async (kind: string, change: (i: number) => Promise<void>) => {
      runs[kind] = []
      for (let i = 0; i < CHANGES_PER_KIND; i++) {
        await arm(page)
        await change(i)
        runs[kind].push(await readUpdate(app))
      }
    }

    await measure('paper', (i) => app.setPaper(i % 2 ? 'A4' : 'Letter'))
    await app.setPaper('A4')
    await app.expectPreviewSettled()

    const orientation = page.getByRole('radiogroup', { name: 'Orientation' })
    await measure('orientation', (i) =>
      orientation.getByRole('radio', { name: i % 2 ? 'Portrait' : 'Landscape' }).click(),
    )
    await orientation.getByRole('radio', { name: 'Auto' }).click()
    await app.expectPreviewSettled()

    const gutter = page.getByLabel('Gutter size', { exact: true })
    await gutter.focus()
    await measure('gutter', (i) => gutter.press(i % 2 ? 'ArrowDown' : 'ArrowUp'))
    await gutter.press('ArrowDown')
    await app.expectPreviewSettled()

    const cropMarks = page.getByRole('switch', { name: 'Crop marks' })
    await measure('crop-marks', () => cropMarks.click())
    await app.setSwitch('Crop marks', true)
    await app.expectPreviewSettled()

    await app.openStudiesTab()
    const blurred = app.versionChip('Blurred')
    await measure('study-version', async (i) => {
      const name = photos[i]?.name ?? ''
      await app.selectButton(name).click()
      await expect(page.getByText(`Studies for ${name}`)).toBeVisible()
      await app.expectPreviewSettled()
      await arm(page)
      await blurred.click()
    })
    for (let i = 0; i < CHANGES_PER_KIND; i++) {
      await app.selectButton(photos[i]?.name ?? '').click()
      await app.setVersions(['Original'])
    }
    await app.selectButton(first).click()
    await app.expectPreviewSettled()

    await app.openLinesTab()
    await expect(app.linesPanel.getByText(`Lines for ${first}`)).toBeVisible()
    const lineType: LineTypeName = 'Rule of thirds'
    await measure('line-type', () => app.lineSwitch(lineType).click())
    await app.setLineSwitch(lineType, true)
    await app.expectPreviewSettled()
    const thickness = app.lineSlider('Thickness')
    const widths = ['1', '2']
    await measure('line-width', (i) => thickness.fill(widths[i % 2] ?? '1'))

    const medians = Object.fromEntries(
      Object.entries(runs).map(([kind, rs]) => [kind, round(median(rs.map((r) => r.updateMs)))]),
    )
    const studiesSettledMs = round(median((runs['study-version'] ?? []).map((r) => r.settledMs)))
    record(testInfo, 'T2 preview update 20', {
      previewUpdateMedianMs: medians,
      studiesSettledMs,
      runs: Object.fromEntries(
        Object.entries(runs).map(([kind, rs]) => [
          kind,
          rs.map((r) => ({
            update: round(r.updateMs),
            settled: round(r.settledMs),
            layout: r.layoutMs === null ? null : round(r.layoutMs),
            visible: r.visiblePages,
          })),
        ]),
      ),
    })
    for (const [kind, ms] of Object.entries(medians))
      expect(ms, `${kind} preview update median`).toBeLessThan(PREVIEW_UPDATE_BUDGET_MS)
    expect(studiesSettledMs).toBeLessThan(STUDIES_SETTLED_BOUND_MS)
  })

  test('T3 @slow 100 photos at 12 MP: layout median < 2000 ms and no long task > 1000 ms while scrolling', async ({
    page,
  }, testInfo) => {
    test.setTimeout(600_000)
    const app = await start(page)
    const photos = [
      ...(await syntheticJpegs(page, 50, 4000, 3000)),
      ...(await syntheticJpegs(page, 50, 3000, 4000)),
    ].map((f, i) => ({ ...f, name: `large-${String(i + 1).padStart(3, '0')}.jpg` }))
    const importMs = await load(app, photos, 300_000)
    const layouts = await paperLayouts(app)
    await arm(page)
    await app.setPaper('Letter')
    const update = await readUpdate(app, 60_000)
    await app.setPaper('A4')
    await app.expectPreviewSettled(60_000)
    const pages = await app.pageCanvases.count()

    const scrollFrom = await page.evaluate(() =>
      (globalThis as unknown as ProbeWindow).performance.now(),
    )
    for (let i = 0; i < pages; i++) await app.showPage(i)
    await app.showPage(0)
    const longTasks = await page.evaluate((from) => {
      const probe = (globalThis as unknown as ProbeWindow).__perf
      return probe.longTasks.filter((t) => t.t >= from).map((t) => t.d)
    }, scrollFrom)
    const longestTaskMs = round(Math.max(0, ...longTasks))
    const layoutMedianMs = round(median(layouts))
    record(testInfo, 'T3 large set', {
      importMs,
      layoutMedianMs,
      layoutsMs: layouts.map(round),
      previewUpdateMs: round(update.updateMs),
      pages,
      longTasksWhileScrolling: longTasks.length,
      longestTaskMs,
    })
    expect(layoutMedianMs).toBeLessThan(LARGE_SET_LAYOUT_BUDGET_MS)
    expect(longestTaskMs).toBeLessThan(LARGE_SET_LONG_TASK_BUDGET_MS)
  })
})

test.describe('§3 timing on a phone (mobile-chromium, recorded)', () => {
  runOnly('mobile-chromium')

  test('T1-phone auto layout of 50 images in the worker with a 4x main-thread slowdown (recorded)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000)
    const app = await start(page)
    const photos = await mixedJpegs(page, 50, 4000)
    await app.upload(photos)
    await app.expectImages(50, 120_000)
    await app.goToStep('Page')
    const unthrottled = await paperLayouts(app)
    // Chromium slows only the page's main thread ("Operation is only supported for pages, not
    // workers"), so this figure covers the round trip's main-thread side, not the worker's search.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: PHONE_CPU_SLOWDOWN })
    try {
      const layouts = await paperLayouts(app)
      record(testInfo, 'T1 layout 50 (phone, 4x main-thread slowdown)', {
        layoutMedianMs: round(median(layouts)),
        layoutsMs: layouts.map(round),
        unthrottledMedianMs: round(median(unthrottled)),
      })
      expect(layouts).toHaveLength(CHANGES_PER_KIND)
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      await cdp.detach()
    }
  })
})
