import { releaseProxy, transfer, wrap } from 'comlink'
import type { ImageId } from '../../../shared/model/image'
import type { TileStudy } from '../../../shared/model/study'
import type { PreviewSource } from '../../render/components/PagePreview'
import type { TilePixelPlan } from '../../render/pixels/tile-plan'
import {
  createStudyPreviewProvider,
  RENDERER_RESTARTED,
  STUDY_TIMEOUT,
  type StudyPreviewProvider,
} from './provider'
import {
  createStudyWorkerApi,
  offscreenCanvas2d,
  offscreenEnv,
  type StudyWorkerApi,
  type StudyWorkerEnv,
} from './worker-api'

/** Takes ownership of `clone` (closed on every path); the caller owns the result. */
export type StudyRenderFn = (
  plan: TilePixelPlan,
  clone: ImageBitmap,
  study: TileStudy,
) => Promise<ImageBitmap>

export interface StudyRenderer extends StudyRenderFn {
  /** Terminates the worker; later renders reject. */
  dispose(): void
}

export interface StudyEngine extends StudyWorkerApi {
  /** True once a worker engine has failed for good. */
  isDead?(): boolean
  dispose?(): void
}

export const STUDY_JOB_TIMEOUT_MS = 20_000

function restarted(cause: unknown): Error {
  const e = new Error('Study renderer restarted', { cause })
  e.name = RENDERER_RESTARTED
  return e
}

function timedOut(): Error {
  const e = new Error('Study job timed out')
  e.name = STUDY_TIMEOUT
  return e
}

/**
 * Lazy worker with a main-thread fallback (M2-R11). A worker job (start-up included) that has not
 * answered after `timeoutMs` rejects with `STUDY_TIMEOUT` and its worker is terminated; the next job
 * gets a fresh worker, and a second timeout in a row moves to the main thread for good (M5-R22).
 * Main-thread jobs are not timed.
 */
export function createStudyRenderer(
  spawn: () => StudyEngine,
  fallback: () => StudyEngine,
  timeoutMs: number = STUDY_JOB_TIMEOUT_MS,
): StudyRenderer {
  let disposed = false
  const isDisposed = (): boolean => disposed
  let worker: StudyEngine | null = null
  let main: StudyEngine | null = null
  let chosen: Promise<StudyEngine> | null = null
  let generation = 0
  let timeoutsInARow = 0

  const dropWorker = (): void => {
    worker?.dispose?.()
    worker = null
  }
  const switchToMain = (): StudyEngine => {
    dropWorker()
    main ??= fallback()
    chosen = Promise.resolve(main)
    return main
  }
  const abandonWorker = (): void => {
    generation++
    timeoutsInARow++
    if (timeoutsInARow >= 2) {
      switchToMain()
      return
    }
    dropWorker()
    chosen = null
  }
  const choose = (): Promise<StudyEngine> => {
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
  const workerDied = (engine: StudyEngine): boolean =>
    engine === worker && engine.isDead?.() === true

  const runOn = async (
    plan: TilePixelPlan,
    clone: ImageBitmap,
    study: TileStudy,
    untimed: () => void,
  ): Promise<ImageBitmap> => {
    const gen = generation
    let engine: StudyEngine
    try {
      engine = await choose()
      if (isDisposed()) throw new Error('Study renderer disposed')
      if (gen !== generation) throw timedOut()
      if (workerDied(engine)) engine = switchToMain()
      if (engine === main) untimed()
    } catch (e) {
      clone.close()
      throw e
    }
    try {
      const out = await engine.renderStudyTile(plan, clone, study)
      if (engine !== main && gen === generation) timeoutsInARow = 0
      return out
    } catch (e) {
      clone.close()
      if (workerDied(engine)) throw restarted(e)
      throw e
    }
  }

  const render = async (
    plan: TilePixelPlan,
    clone: ImageBitmap,
    study: TileStudy,
  ): Promise<ImageBitmap> => {
    if (isDisposed()) {
      clone.close()
      throw new Error('Study renderer disposed')
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const stalled = timedOut()
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(stalled)
      }, timeoutMs)
    })
    const job = runOn(plan, clone, study, () => {
      clearTimeout(timer)
    })
    try {
      return await Promise.race([job, timeout])
    } catch (e) {
      if (e === stalled) {
        job.catch(() => undefined)
        clone.close()
        if (!isDisposed()) abandonWorker()
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  return Object.assign(render, {
    dispose(): void {
      disposed = true
      dropWorker()
    },
  })
}

function spawnWorkerEngine(): StudyEngine {
  const worker = new Worker(new URL('./study.worker.ts', import.meta.url), { type: 'module' })
  const remote = wrap<StudyWorkerApi>(worker)
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
    stop('Study worker failed')
  })
  worker.addEventListener('messageerror', () => {
    stop('Study worker sent an unreadable message')
  })
  return {
    init: () => Promise.race([remote.init(), failure]),
    renderStudyTile: (plan, bitmap, study) =>
      Promise.race([remote.renderStudyTile(plan, transfer(bitmap, [bitmap]), study), failure]),
    isDead: () => dead,
    dispose: () => {
      stop('Study worker stopped')
    },
  }
}

function domCanvasEnv(): StudyWorkerEnv<HTMLCanvasElement> {
  return {
    supported: () => true,
    createCanvas: (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    },
    toBitmap: (canvas) => createImageBitmap(canvas),
  }
}

/** Same canvas type as the worker wherever the main thread has OffscreenCanvas 2D, so the pixels match. */
function mainThreadEngine(): StudyEngine {
  return offscreenCanvas2d()
    ? createStudyWorkerApi(offscreenEnv())
    : createStudyWorkerApi(domCanvasEnv())
}

let appProvider: StudyPreviewProvider<ImageBitmap> | null = null

/**
 * The app's single provider (ruling D-CR1): created on the first call, whose `getSource` wins;
 * later calls return the same instance until it is disposed.
 */
export function createAppStudyProvider(
  getSource: (id: ImageId) => PreviewSource | undefined,
): StudyPreviewProvider<ImageBitmap> {
  if (appProvider) return appProvider
  const render = createStudyRenderer(spawnWorkerEngine, mainThreadEngine)
  const provider = createStudyPreviewProvider<ImageBitmap>({
    getSource,
    cropBitmap: (bitmap, box) => createImageBitmap(bitmap, box.x, box.y, box.w, box.h),
    render,
    schedule: (cb) => {
      requestAnimationFrame(cb)
    },
  })
  const app: StudyPreviewProvider<ImageBitmap> = {
    ...provider,
    dispose() {
      provider.dispose()
      render.dispose()
      if (appProvider === app) appProvider = null
    },
  }
  appProvider = app
  return app
}
