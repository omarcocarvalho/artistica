import type { Page } from '@playwright/test'

export interface WorkerEvent {
  /** `performance.now()` in the page. */
  readonly t: number
  readonly ev: 'new' | 'terminate' | 'post' | 'prepare'
  /** One per worker created after the probe was installed, from 1; 0 for any other worker. */
  readonly id: number
  readonly url: string
  /** The worker script's name without its hash (`edges.worker`, `landmark.worker`), or `other`. */
  readonly name: string
  /** The model of a Comlink `prepare(model, …)` call. */
  readonly model?: string
}

/**
 * Logs, in the page, synchronously and in order: each dedicated worker the page creates or
 * terminates, every message posted to it, and each Comlink `prepare(model, …)` call among those
 * messages (logged as a `post` followed by a `prepare`). Install before navigating.
 */
export async function installWorkerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Entry {
      t: number
      ev: 'new' | 'terminate' | 'post' | 'prepare'
      id: number
      url: string
      name: string
      model?: string
    }
    interface Tag {
      id: number
      url: string
      name: string
    }
    type Method = (this: unknown, ...args: unknown[]) => unknown
    const g = globalThis as unknown as {
      __workerLog: Entry[]
      performance: { now(): number }
      Worker: {
        new (url: unknown, options?: unknown): object
        prototype: { postMessage: unknown; terminate: unknown }
      }
    }
    const log: Entry[] = []
    g.__workerLog = log
    const tags = new WeakMap<object, Tag>()
    const untagged: Tag = { id: 0, url: '', name: 'other' }
    const add = (ev: Entry['ev'], tag: Tag, model?: string) => {
      const entry: Entry = { t: g.performance.now(), ev, ...tag }
      if (model !== undefined) entry.model = model
      log.push(entry)
    }
    let n = 0
    const Native = g.Worker
    g.Worker = new Proxy(Native, {
      construct(target, args: unknown[]) {
        const worker = Reflect.construct(target, args) as object
        const url = String(args[0])
        const tag = { id: ++n, url, name: /([\w-]+\.worker)-/.exec(url)?.[1] ?? 'other' }
        tags.set(worker, tag)
        add('new', tag)
        return worker
      },
    })
    const post = Native.prototype.postMessage as Method
    Native.prototype.postMessage = function (this: object, ...args: unknown[]) {
      const tag = tags.get(this) ?? untagged
      add('post', tag)
      const msg = args[0] as {
        type?: unknown
        path?: unknown
        argumentList?: { value?: unknown }[]
      } | null
      const model = msg?.argumentList?.[0]?.value
      if (
        msg?.type === 'APPLY' &&
        Array.isArray(msg.path) &&
        msg.path[0] === 'prepare' &&
        typeof model === 'string'
      )
        add('prepare', tag, model)
      return post.apply(this, args)
    }
    const terminate = Native.prototype.terminate as Method
    Native.prototype.terminate = function (this: object, ...args: unknown[]) {
      add('terminate', tags.get(this) ?? untagged)
      return terminate.apply(this, args)
    }
  })
}

export async function workerLog(page: Page): Promise<WorkerEvent[]> {
  return page.evaluate(
    () => (globalThis as unknown as { __workerLog?: WorkerEvent[] }).__workerLog ?? [],
  )
}

export async function workerPosts(page: Page, name: string): Promise<number> {
  return (await workerLog(page)).filter((e) => e.ev === 'post' && e.name === name).length
}

/** The most workers that `match` accepts alive at once (created and not yet terminated). */
function peakAlive(log: readonly WorkerEvent[], match: (e: WorkerEvent) => boolean): number {
  const alive = new Set<number>()
  let peak = 0
  for (const e of log) {
    if (!match(e)) continue
    if (e.ev === 'new') alive.add(e.id)
    else if (e.ev === 'terminate') alive.delete(e.id)
    peak = Math.max(peak, alive.size)
  }
  return peak
}

/** The most workers named `name` that were alive at the same time. */
export async function maxLiveWorkers(page: Page, name: string): Promise<number> {
  return peakAlive(await workerLog(page), (e) => e.name === name)
}

export interface LandmarkWorkerSummary {
  /** Landmark workers created. */
  readonly workers: number
  /** Most landmark workers alive at once. */
  readonly maxAlive: number
  /** Landmark workers alive at the end of the log. */
  readonly alive: number
  /** The models prepared in each landmark worker, in creation order. */
  readonly modelsPerWorker: string[][]
}

/** One landmark worker holds one landmarker; never two workers, or two models in one, at once. */
export function summarizeLandmarkWorkers(log: readonly WorkerEvent[]): LandmarkWorkerSummary {
  const landmark = log.filter((e) => e.url.includes('landmark'))
  const alive = new Set<number>()
  const models = new Map<number, Set<string>>()
  for (const e of landmark) {
    if (e.ev === 'new') {
      alive.add(e.id)
      models.set(e.id, new Set())
    } else if (e.ev === 'terminate') alive.delete(e.id)
    else if (e.model !== undefined) models.get(e.id)?.add(e.model)
  }
  return {
    workers: models.size,
    maxAlive: peakAlive(landmark, () => true),
    alive: alive.size,
    modelsPerWorker: [...models.values()].map((s) => [...s]),
  }
}
