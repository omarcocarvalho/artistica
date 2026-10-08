import { releaseProxy, transfer, wrap } from 'comlink'
import type { EdgeEngine } from '../detect/schedule'
import {
  createEdgeWorkerApi,
  edgeCanvas2d,
  offscreenEnv,
  unpackOutline,
  type EdgeCanvasEnv,
  type EdgeWorkerApi,
  type Outline,
} from './worker-api'

export type { Outline }

export const EDGE_TIMEOUT_MS = 10_000

export interface EdgeBackend {
  init(): Promise<void>
  /** Takes ownership of `bitmap`. */
  outline(bitmap: ImageBitmap, detailPct: number): Promise<Outline>
  /** True once a worker backend has failed for good. */
  isDead?(): boolean
  dispose?(): void
}

function timedOut(): Error {
  const e = new Error('Edge outline timed out')
  e.name = 'EdgeTimeout'
  return e
}

const disposedError = (): Error => new Error('Edge engine disposed')

export function createEdgeEngineWith(
  spawn: () => EdgeBackend,
  fallback: () => EdgeBackend,
  timeoutMs: number = EDGE_TIMEOUT_MS,
): EdgeEngine {
  let disposed = false
  const isDisposed = (): boolean => disposed
  let worker: EdgeBackend | null = null
  let main: EdgeBackend | null = null
  let chosen: Promise<EdgeBackend> | null = null
  let generation = 0
  let queue: Promise<unknown> = Promise.resolve()

  const dropWorker = (): void => {
    worker?.dispose?.()
    worker = null
  }
  const switchToMain = (): EdgeBackend => {
    dropWorker()
    main ??= fallback()
    chosen = Promise.resolve(main)
    return main
  }
  const replaceWorker = (): void => {
    generation++
    dropWorker()
    chosen = null
  }
  const choose = (): Promise<EdgeBackend> => {
    if (chosen) return chosen
    const gen = generation
    chosen = (async () => {
      try {
        const spawned = spawn()
        worker = spawned
        await spawned.init()
        return spawned
      } catch (e) {
        if (isDisposed() || gen !== generation) throw e
        return switchToMain()
      }
    })()
    return chosen
  }
  const workerDied = (engine: EdgeBackend): boolean =>
    engine === worker && engine.isDead?.() === true

  const runOn = async (bitmap: ImageBitmap, detailPct: number): Promise<Outline> => {
    let engine: EdgeBackend
    try {
      engine = await choose()
      if (isDisposed()) throw disposedError()
      if (workerDied(engine)) engine = switchToMain()
    } catch (e) {
      bitmap.close()
      throw e
    }
    try {
      const out = await engine.outline(bitmap, detailPct)
      if (isDisposed()) throw disposedError()
      return out
    } catch (e) {
      bitmap.close()
      throw e
    }
  }

  const run = async (bitmap: ImageBitmap, detailPct: number): Promise<Outline> => {
    if (isDisposed()) {
      bitmap.close()
      throw disposedError()
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(timedOut())
      }, timeoutMs)
    })
    const job = runOn(bitmap, detailPct)
    try {
      return await Promise.race([job, timeout])
    } catch (e) {
      if (e instanceof Error && e.name === 'EdgeTimeout') {
        job.catch(() => undefined)
        bitmap.close()
        if (!isDisposed()) replaceWorker()
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    outline(bitmap, detailPct) {
      const job = queue.then(() => run(bitmap, detailPct))
      queue = job.catch(() => undefined)
      return job
    },
    dispose() {
      disposed = true
      generation++
      dropWorker()
    },
  }
}

function spawnWorkerBackend(): EdgeBackend {
  const worker = new Worker(new URL('./edges.worker.ts', import.meta.url), { type: 'module' })
  const remote = wrap<EdgeWorkerApi>(worker)
  let dead = false
  let fail: (e: unknown) => void = () => undefined
  const failure = new Promise<never>((_, reject) => {
    fail = reject
  })
  failure.catch(() => undefined)
  const stop = (message: string): void => {
    if (dead) return
    dead = true
    fail(new Error(message))
    remote[releaseProxy]()
    worker.terminate()
  }
  worker.addEventListener('error', () => {
    stop('Edge worker failed')
  })
  worker.addEventListener('messageerror', () => {
    stop('Edge worker sent an unreadable message')
  })
  return {
    init: () => Promise.race([remote.init(), failure]),
    outline: async (bitmap, detailPct) =>
      unpackOutline(
        await Promise.race([remote.outline(transfer(bitmap, [bitmap]), detailPct), failure]),
      ),
    isDead: () => dead,
    dispose: () => {
      stop('Edge worker stopped')
    },
  }
}

function domCanvasEnv(): EdgeCanvasEnv {
  return {
    supported: () => true,
    createCanvas: (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    },
  }
}

function mainThreadBackend(): EdgeBackend {
  const api = createEdgeWorkerApi(edgeCanvas2d() ? offscreenEnv() : domCanvasEnv(), () =>
    import('./outline').then((m) => m.edgeOutline),
  )
  return {
    init: () => api.init(),
    outline: async (bitmap, detailPct) => unpackOutline(await api.outline(bitmap, detailPct)),
  }
}

export function createEdgeEngine(): EdgeEngine {
  return createEdgeEngineWith(spawnWorkerBackend, mainThreadBackend)
}
