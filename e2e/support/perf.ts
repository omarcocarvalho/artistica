import { expect, type Page } from '@playwright/test'
import type { AppPage } from './app.ts'

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
export interface ProbeWindow {
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
export async function installPerfProbe(page: Page): Promise<void> {
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
export async function arm(page: Page): Promise<void> {
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

export interface Update {
  /** Input event to the last visible page's first draw after the new page models (M5-R27). */
  updateMs: number
  /** Input event to the last draw of a visible page, study tiles included. */
  settledMs: number
  /** Worker round trip of the layout call, when the change needed one. */
  layoutMs: number | null
  visiblePages: number
}

/** Waits for the armed change to reach the screen and reads its timings. */
export async function readUpdate(app: AppPage, timeout = 30_000): Promise<Update> {
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
