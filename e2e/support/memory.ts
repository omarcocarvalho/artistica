import { execFileSync } from 'node:child_process'
import type { Browser, Page } from '@playwright/test'

/** Every process of a Chromium browser (browser, renderers, GPU, utilities), from Chromium itself. */
async function chromiumProcesses(browser: Browser): Promise<{ id: number; type: string }[]> {
  const cdp = await browser.newBrowserCDPSession()
  try {
    const { processInfo } = (await cdp.send('SystemInfo.getProcessInfo')) as {
      processInfo: { id: number; type: string }[]
    }
    return processInfo.filter((p) => p.id > 0)
  } finally {
    await cdp.detach()
  }
}

/** RSS in MB of each listed process that is still alive (`ps` on macOS and Linux). */
function rssMbByPid(pids: readonly number[]): Map<number, number> {
  const out = execFileSync('ps', ['-axo', 'pid=,rss='], { encoding: 'utf8' })
  const wanted = new Set(pids)
  const rss = new Map<number, number>()
  for (const line of out.split('\n')) {
    const [pid = NaN, kb = NaN] = line.trim().split(/\s+/).map(Number)
    if (wanted.has(pid) && Number.isFinite(kb)) rss.set(pid, kb / 1024)
  }
  return rss
}

export interface MemorySampler {
  /** Later samples count towards this phase. */
  phase(name: string): void
  /** Peak total RSS (MB) per phase. */
  peaks(): Record<string, number>
  /** One sample now: total RSS (MB). */
  sample(): Promise<number>
  /** RSS (MB) per process type right now, e.g. { browser, renderer, gpu }. */
  breakdown(): Promise<Record<string, number>>
  /** Stops sampling; rethrows the first sampling failure. */
  stop(): Promise<void>
}

/**
 * Samples the total RSS of one Chromium browser's process tree. The pids come from that browser's
 * own process list, so browsers of other parallel test workers are not counted.
 */
export function sampleBrowserMemory(browser: Browser, intervalMs = 250): MemorySampler {
  let current = 'start'
  const peaks: Record<string, number> = {}
  let failure: Error | null = null
  let chain: Promise<unknown> = Promise.resolve()
  const sample = (): Promise<number> => {
    const next = chain.then(async () => {
      const pids = (await chromiumProcesses(browser)).map((p) => p.id)
      const rss = rssMbByPid(pids)
      if (rss.size === 0) throw new Error(`no RSS found for browser pids ${pids.join(',')}`)
      const total = Math.round([...rss.values()].reduce((a, b) => a + b, 0))
      peaks[current] = Math.max(peaks[current] ?? 0, total)
      return total
    })
    chain = next.catch(() => undefined)
    return next
  }
  const timer = setInterval(() => {
    sample().catch((e: unknown) => {
      failure ??= e instanceof Error ? e : new Error(String(e))
    })
  }, intervalMs)
  return {
    phase(name) {
      current = name
    },
    peaks: () => ({ ...peaks }),
    sample,
    async breakdown() {
      const processes = await chromiumProcesses(browser)
      const rss = rssMbByPid(processes.map((p) => p.id))
      const out: Record<string, number> = {}
      for (const p of processes) out[p.type] = Math.round((out[p.type] ?? 0) + (rss.get(p.id) ?? 0))
      return out
    },
    async stop() {
      clearInterval(timer)
      await chain
      if (failure !== null) throw failure
    },
  }
}

export interface ContextHeap {
  readonly kind: 'page' | 'worker'
  readonly url: string
  /** Used JavaScript heap, MB. */
  readonly jsMb: number
  /** ArrayBuffer backing stores and external strings, MB. */
  readonly buffersMb: number
}

interface HeapUsage {
  usedSize: number
  backingStorageSize?: number
}

const toHeap = (kind: ContextHeap['kind'], url: string, h: HeapUsage): ContextHeap => ({
  kind,
  url: url.replace(/^.*\//, ''),
  jsMb: Math.round(h.usedSize / 2 ** 20),
  buffersMb: Math.round((h.backingStorageSize ?? 0) / 2 ** 20),
})

/** V8 heap use of a Chromium page and of each of its dedicated workers, from the DevTools protocol. */
export async function heapByContext(page: Page): Promise<ContextHeap[]> {
  const cdp = await page.context().newCDPSession(page)
  try {
    const out = [toHeap('page', page.url(), await cdp.send('Runtime.getHeapUsage'))]
    const workers: { sessionId: string; url: string }[] = []
    const replies = new Map<number, (r: HeapUsage) => void>()
    cdp.on('Target.attachedToTarget', (e) => {
      if (e.targetInfo.type === 'worker')
        workers.push({ sessionId: e.sessionId, url: e.targetInfo.url })
    })
    cdp.on('Target.receivedMessageFromTarget', (e) => {
      const m = JSON.parse(e.message) as { id?: number; result?: HeapUsage }
      if (m.id !== undefined && m.result) replies.get(m.id)?.(m.result)
    })
    await cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: false,
    })
    let id = 0
    for (const w of workers) {
      const mine = ++id
      const usage = await new Promise<HeapUsage>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`no heap usage from worker ${w.url}`))
        }, 5000)
        replies.set(mine, (r) => {
          clearTimeout(timer)
          resolve(r)
        })
        cdp
          .send('Target.sendMessageToTarget', {
            sessionId: w.sessionId,
            message: JSON.stringify({ id: mine, method: 'Runtime.getHeapUsage' }),
          })
          .catch(reject)
      })
      out.push(toHeap('worker', w.url, usage))
    }
    return out
  } finally {
    await cdp.detach()
  }
}
