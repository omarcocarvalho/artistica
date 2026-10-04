import { wrap } from 'comlink'
import type { PageSetup } from '../../shared/model/page-setup'
import type { LayoutWorkerApi } from './worker-api'
import type { LayoutItemInput, LayoutResult } from './types'

/** Anything that computes a layout asynchronously: the Comlink-wrapped worker, or a fake in tests. */
export interface LayoutEngine {
  computeLayout(setup: PageSetup, items: readonly LayoutItemInput[]): Promise<LayoutResult>
}

export type LayoutFn = (
  setup: PageSetup,
  items: readonly LayoutItemInput[],
) => Promise<LayoutResult>

export function abortError(): DOMException {
  return new DOMException('Layout superseded by a newer call', 'AbortError')
}

/** True for the rejection of a superseded layoutAsync call (the UI ignores these). */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

interface Job {
  readonly setup: PageSetup
  readonly items: readonly LayoutItemInput[]
  readonly resolve: (r: LayoutResult) => void
  readonly reject: (e: unknown) => void
  settled: boolean
}

/**
 * Latest-call-wins wrapper around an engine.
 * - At most one computation runs at a time; at most one call waits behind it.
 * - A new call immediately rejects (AbortError) the running call and any waiting call.
 * - When the running computation finishes, its result is dropped if the call was superseded,
 *   and the newest waiting call (if any) starts. So a burst of N calls costs at most 2 computations.
 * - The engine is created lazily on the first call, once.
 */
export function createLayoutClient(createEngine: () => LayoutEngine): LayoutFn {
  let engine: LayoutEngine | null = null
  let running: Job | null = null
  let waiting: Job | null = null

  const settle = (job: Job, fn: () => void): void => {
    if (job.settled) return
    job.settled = true
    fn()
  }

  const start = (job: Job): void => {
    running = job
    // Inside the executor, a throw from createEngine() becomes a rejection.
    new Promise<LayoutResult>((resolve) => {
      engine ??= createEngine()
      resolve(engine.computeLayout(job.setup, job.items))
    })
      .then(
        (result) => {
          settle(job, () => {
            job.resolve(result)
          })
        },
        (error: unknown) => {
          settle(job, () => {
            job.reject(error)
          })
        },
      )
      .finally(() => {
        running = null
        const next = waiting
        waiting = null
        if (next !== null) start(next)
      })
  }

  return (setup, items) =>
    new Promise<LayoutResult>((resolve, reject) => {
      const job: Job = { setup, items, resolve, reject, settled: false }
      for (const old of [running, waiting]) {
        if (old !== null) {
          settle(old, () => {
            old.reject(abortError())
          })
        }
      }
      if (running === null) start(job)
      else waiting = job
    })
}

/* v8 ignore start -- needs a real Worker; exercised by E's E2E (see A2 coverage policy) */
function spawnWorkerEngine(): LayoutEngine {
  const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
  const remote = wrap<LayoutWorkerApi>(worker)
  return { computeLayout: (setup, items) => remote.computeLayout(setup, items) }
}
/* v8 ignore stop */

/** Worker-backed async API used by the UI (Comlink). Latest-call-wins: superseded calls reject with an AbortError. */
export const layoutAsync: LayoutFn = createLayoutClient(spawnWorkerEngine)
