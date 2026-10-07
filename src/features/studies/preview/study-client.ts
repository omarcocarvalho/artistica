import { releaseProxy, transfer, wrap } from 'comlink'
import type { ImageId } from '../../../shared/model/image'
import type { TileStudy } from '../../../shared/model/study'
import type { PreviewSource } from '../../render/components/PagePreview'
import type { TilePixelPlan } from '../../render/pixels/tile-plan'
import {
  createStudyPreviewProvider,
  RENDERER_RESTARTED,
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

function restarted(cause: unknown): Error {
  const e = new Error('Study renderer restarted', { cause })
  e.name = RENDERER_RESTARTED
  return e
}

/** Lazy worker with a main-thread fallback (M2-R11). */
export function createStudyRenderer(
  spawn: () => StudyEngine,
  fallback: () => StudyEngine,
): StudyRenderer {
  let disposed = false
  const isDisposed = (): boolean => disposed
  let worker: StudyEngine | null = null
  let main: StudyEngine | null = null
  let chosen: Promise<StudyEngine> | null = null

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
  const choose = (): Promise<StudyEngine> =>
    (chosen ??= (async () => {
      try {
        const spawned = spawn()
        worker = spawned
        await spawned.init()
        return spawned
      } catch {
        return switchToMain()
      }
    })())
  const workerDied = (engine: StudyEngine): boolean =>
    engine === worker && engine.isDead?.() === true

  const render = async (
    plan: TilePixelPlan,
    clone: ImageBitmap,
    study: TileStudy,
  ): Promise<ImageBitmap> => {
    let engine: StudyEngine
    try {
      if (isDisposed()) throw new Error('Study renderer disposed')
      engine = await choose()
      if (isDisposed()) throw new Error('Study renderer disposed')
      if (workerDied(engine)) engine = switchToMain()
    } catch (e) {
      clone.close()
      throw e
    }
    try {
      return await engine.renderStudyTile(plan, clone, study)
    } catch (e) {
      clone.close()
      if (workerDied(engine)) throw restarted(e)
      throw e
    }
  }

  return Object.assign(render, {
    dispose(): void {
      disposed = true
      dropWorker()
    },
  })
}

/* v8 ignore start -- browser-only Worker and canvas wiring; the logic it drives (createStudyWorkerApi,
   createStudyRenderer, createStudyPreviewProvider) is unit-tested, and D3/D4 drive this path in E2E. */
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
/* v8 ignore stop */

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
