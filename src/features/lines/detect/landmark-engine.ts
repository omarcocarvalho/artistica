import { releaseProxy, transfer, wrap } from 'comlink'
import { pageHasWebGL as pageCanvasHasWebGL } from '../components/detection-actions'
import type { Face, LandmarkApi, LandmarkApiEnv, Pose, Runtime, VisionModule } from './landmark-api'
import type { LandmarkEngine } from './schedule'
import type { AiModel } from './store'

export const LANDMARK_TIMEOUT_MS = 30_000
export const LANDMARK_IDLE_MS = 30_000

export interface LandmarkBackend {
  /** Rejects when this backend cannot run landmarks here. */
  init(): Promise<void>
  prepare(model: AiModel, runtime: Runtime, modelBytes: ArrayBuffer): Promise<void>
  /** Takes ownership of `bitmap`. */
  detectFaces(bitmap: ImageBitmap): Promise<Face[]>
  /** Takes ownership of `bitmap`. */
  detectPoses(bitmap: ImageBitmap): Promise<Pose[]>
  /** True once a worker backend has failed for good. */
  isDead?(): boolean
  /** Closes the landmarker and, for a worker, terminates it, before returning. */
  dispose(): void
}

export interface LandmarkEngineDeps {
  readonly spawn: () => LandmarkBackend
  readonly mainThread: () => LandmarkBackend
  readonly pageHasWebGL: () => boolean
  readonly timeoutMs?: number
  readonly idleMs?: number
}

type Where = 'worker' | 'main' | 'unsupported'

interface Prepared {
  readonly model: AiModel
  readonly runtime: Runtime
  readonly modelBytes: ArrayBuffer
}

function namedError(name: string, message: string): Error {
  const e = new Error(message)
  e.name = name
  return e
}

const disposedError = (): Error => new Error('Landmark engine disposed')

export function createLandmarkEngineWith(deps: LandmarkEngineDeps): LandmarkEngine {
  const timeoutMs = deps.timeoutMs ?? LANDMARK_TIMEOUT_MS
  const idleMs = deps.idleMs ?? LANDMARK_IDLE_MS
  let disposed = false
  const isDisposed = (): boolean => disposed
  let where: Where | null = null
  let live: LandmarkBackend | null = null
  let loadedModel: AiModel | null = null
  let wanted: Prepared | null = null
  let queue: Promise<unknown> = Promise.resolve()
  let pending = 0
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const onDispose = new Set<(e: Error) => void>()

  const release = (): void => {
    live?.dispose()
    live = null
    loadedModel = null
  }

  const choose = (): void => {
    where = deps.pageHasWebGL() ? 'main' : 'unsupported'
  }

  const backend = async (): Promise<LandmarkBackend> => {
    if (live?.isDead?.() === true) release()
    if (live) return live
    if (where === null || where === 'worker') {
      let spawned: LandmarkBackend | null = null
      try {
        spawned = deps.spawn()
        live = spawned
        await spawned.init()
        if (disposed) throw disposedError()
        where = 'worker'
        return spawned
      } catch (e) {
        if (disposed) throw e
        if (spawned) {
          spawned.dispose()
          if (live === spawned) live = null
        }
        if (where === 'worker') throw e
        choose()
      }
    }
    if (where === 'unsupported') throw new Error('landmarks:unsupported')
    const main = deps.mainThread()
    live = main
    await main.init()
    return main
  }

  const ready = async (model: AiModel): Promise<LandmarkBackend> => {
    const b = await backend()
    if (disposed) throw disposedError()
    if (loadedModel !== model) {
      if (wanted?.model !== model) throw new Error('landmarks:not-prepared')
      loadedModel = null
      await b.prepare(model, wanted.runtime, wanted.modelBytes)
      if (b === live) loadedModel = model
    }
    return b
  }

  const startIdle = (): void => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      if (!disposed) release()
    }, idleMs)
  }

  const run = async <T>(work: () => Promise<T>, bitmap?: ImageBitmap): Promise<T> => {
    if (disposed) {
      bitmap?.close()
      throw disposedError()
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let stop: ((e: Error) => void) | undefined
    const interrupt = new Promise<never>((_, reject) => {
      stop = reject
      timer = setTimeout(() => {
        reject(namedError('LandmarkTimeout', 'Landmark detection timed out'))
      }, timeoutMs)
    })
    const stopper = (e: Error): void => stop?.(e)
    onDispose.add(stopper)
    const job = work()
    try {
      return await Promise.race([job, interrupt])
    } catch (e) {
      job.catch(() => undefined)
      bitmap?.close()
      if (e instanceof Error && e.name === 'LandmarkTimeout' && !isDisposed()) release()
      throw e
    } finally {
      clearTimeout(timer)
      onDispose.delete(stopper)
    }
  }

  const enqueue = <T>(work: () => Promise<T>, bitmap?: ImageBitmap): Promise<T> => {
    pending++
    clearTimeout(idleTimer)
    const job = queue.then(() => run(work, bitmap))
    queue = job
      .catch(() => undefined)
      .then(() => {
        pending--
        if (pending === 0 && !disposed) startIdle()
      })
    return job
  }

  return {
    prepare(model, runtime, modelBytes) {
      return enqueue(async () => {
        wanted = { model, runtime, modelBytes }
        await ready(model)
      })
    },
    detectFaces(bitmap) {
      return enqueue(async () => {
        const b = await ready('face')
        return b.detectFaces(bitmap)
      }, bitmap)
    },
    detectPoses(bitmap) {
      return enqueue(async () => {
        const b = await ready('pose')
        return b.detectPoses(bitmap)
      }, bitmap)
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearTimeout(idleTimer)
      release()
      wanted = null
      for (const stop of onDispose) stop(disposedError())
    },
  }
}

function spawnWorkerBackend(): LandmarkBackend {
  const worker = new Worker(new URL('./landmark.worker.ts', import.meta.url), { type: 'module' })
  const remote = wrap<LandmarkApi>(worker)
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
    stop('Landmark worker failed')
  })
  worker.addEventListener('messageerror', () => {
    stop('Landmark worker sent an unreadable message')
  })
  return {
    init: () => Promise.race([remote.init(), failure]),
    prepare: (model, runtime, modelBytes) =>
      Promise.race([remote.prepare(model, runtime, modelBytes), failure]),
    detectFaces: (bitmap) =>
      Promise.race([remote.detectFaces(transfer(bitmap, [bitmap])), failure]),
    detectPoses: (bitmap) =>
      Promise.race([remote.detectPoses(transfer(bitmap, [bitmap])), failure]),
    isDead: () => dead,
    dispose: () => {
      stop('Landmark worker stopped')
    },
  }
}

let mainThreadCreation: Promise<unknown> = Promise.resolve()

export function createMainThreadBackend(
  env: Partial<Pick<LandmarkApiEnv, 'loadVision' | 'importModule' | 'scope'>> = {},
): LandmarkBackend {
  let disposed = false
  let loaded: LandmarkApi | null = null
  const api = import('./landmark-api').then((m) => {
    loaded = m.createLandmarkApi({
      loadVision:
        env.loadVision ?? ((): Promise<VisionModule> => import('@mediapipe/tasks-vision')),
      loading: 'module-factory',
      scope: env.scope ?? (globalThis as { ModuleFactory?: unknown }),
      supported: () => true,
      ...(env.importModule ? { importModule: env.importModule } : {}),
    })
    return loaded
  })
  const live = async (bitmap?: ImageBitmap): Promise<LandmarkApi> => {
    const a = await api.catch((e: unknown) => {
      bitmap?.close()
      throw e
    })
    if (disposed) {
      bitmap?.close()
      throw disposedError()
    }
    return a
  }
  return {
    init: async () => {
      await (await live()).init()
    },
    prepare: (model, runtime, modelBytes) => {
      const mine = mainThreadCreation.then(async () => {
        await (await live()).prepare(model, runtime, modelBytes)
      })
      mainThreadCreation = mine.catch(() => undefined)
      return mine
    },
    detectFaces: async (bitmap) => (await live(bitmap)).detectFaces(bitmap),
    detectPoses: async (bitmap) => (await live(bitmap)).detectPoses(bitmap),
    dispose: () => {
      disposed = true
      loaded?.close()
    },
  }
}

export function createLandmarkEngine(
  overrides: { pageHasWebGL?: () => boolean; main?: () => LandmarkBackend } = {},
): LandmarkEngine {
  return createLandmarkEngineWith({
    spawn: spawnWorkerBackend,
    mainThread: overrides.main ?? (() => createMainThreadBackend()),
    pageHasWebGL: overrides.pageHasWebGL ?? (() => pageCanvasHasWebGL()),
  })
}
