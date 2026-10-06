import { execFileSync } from 'node:child_process'
import type { Browser } from '@playwright/test'

/** Every process of a Chromium browser (browser, renderers, GPU, utilities), from Chromium itself. */
async function chromiumPids(browser: Browser): Promise<number[]> {
  const cdp = await browser.newBrowserCDPSession()
  try {
    const { processInfo } = (await cdp.send('SystemInfo.getProcessInfo')) as {
      processInfo: { id: number }[]
    }
    return processInfo.map((p) => p.id).filter((id) => id > 0)
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
      const pids = await chromiumPids(browser)
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
    async stop() {
      clearInterval(timer)
      await chain
      if (failure !== null) throw failure
    },
  }
}
