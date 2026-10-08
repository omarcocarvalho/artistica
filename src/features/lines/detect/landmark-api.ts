import { MAX_FACES, MAX_POSES } from '../guides/limits'
import type { AiModel } from './store'

export interface WasmFileset {
  readonly wasmLoaderPath: string
  readonly wasmBinaryPath: string
}

export interface RawLandmark {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly visibility?: number
}

export interface LandmarkerOptions {
  readonly baseOptions: {
    readonly modelAssetBuffer?: Uint8Array
    readonly modelAssetPath?: string
    readonly delegate: 'CPU'
  }
  readonly runningMode: 'IMAGE'
  readonly numFaces?: number
  readonly numPoses?: number
}

interface Landmarker<R> {
  detect(image: ImageBitmap): R
  close(): void
}

export interface VisionModule {
  FaceLandmarker: {
    createFromOptions(
      fileset: WasmFileset,
      options: LandmarkerOptions,
    ): Promise<Landmarker<{ faceLandmarks: RawLandmark[][] }>>
  }
  PoseLandmarker: {
    createFromOptions(
      fileset: WasmFileset,
      options: LandmarkerOptions,
    ): Promise<Landmarker<{ landmarks: RawLandmark[][] }>>
  }
}

export interface Runtime {
  readonly loader: ArrayBuffer
  readonly wasm: ArrayBuffer
}

export interface Face {
  points: { x: number; y: number }[]
}

export interface Pose {
  points: { x: number; y: number }[]
  visibility: number[]
}

export interface LandmarkApi {
  /** Rejects with "landmarks:unsupported" when this context has no WebGL (C1-R1). */
  init(): Promise<void>
  /** Idempotent per model; never detaches the given buffers. */
  prepare(model: AiModel, runtime: Runtime, modelBytes: ArrayBuffer): Promise<void>
  /** Takes ownership of `bitmap` (closed on every path). */
  detectFaces(bitmap: ImageBitmap): Promise<Face[]>
  /** Takes ownership of `bitmap` (closed on every path). */
  detectPoses(bitmap: ImageBitmap): Promise<Pose[]>
  close(): void
}

export interface LandmarkApiEnv {
  readonly loadVision: () => Promise<VisionModule>
  readonly loading: 'fresh-url' | 'module-factory'
  readonly scope: { ModuleFactory?: unknown }
  readonly supported: () => boolean
  readonly installGuard?: () => void
  readonly takeRefusals?: () => readonly string[]
  readonly importModule?: (url: string) => Promise<{ default?: unknown }>
}

interface Loaded {
  readonly model: AiModel
  readonly face?: Landmarker<{ faceLandmarks: RawLandmark[][] }>
  readonly pose?: Landmarker<{ landmarks: RawLandmark[][] }>
}

function blobUrl(bytes: ArrayBuffer, type: string): string {
  return URL.createObjectURL(new Blob([bytes], { type }))
}

const notPrepared = (): Error => new Error('landmarks:not-prepared')

export function offscreenHasWebGL(): boolean {
  if (typeof OffscreenCanvas !== 'function') return false
  const probes = [
    () => new OffscreenCanvas(1, 1).getContext('webgl2'),
    () => new OffscreenCanvas(1, 1).getContext('webgl'),
  ]
  for (const probe of probes) {
    try {
      const gl = probe()
      if (gl) {
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        return true
      }
    } catch {
      return false
    }
  }
  return false
}

export function createLandmarkApi(env: LandmarkApiEnv): LandmarkApi {
  let vision: Promise<VisionModule> | null = null
  let factory: Promise<unknown> | null = null
  let current: Loaded | null = null
  let generation = 0

  const checkRefusals = (): void => {
    const refused = env.takeRefusals?.() ?? []
    if (refused.length > 0) throw new Error(`fetch-guard: refused ${refused.join(', ')}`)
  }

  const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
    let result: T
    try {
      result = await work()
    } catch (e) {
      checkRefusals()
      throw e
    }
    checkRefusals()
    return result
  }

  const loadVision = (): Promise<VisionModule> => {
    if (!vision) {
      env.installGuard?.()
      vision = env.loadVision()
      vision.catch(() => {
        vision = null
      })
    }
    return vision
  }

  const moduleFactory = (loader: ArrayBuffer): Promise<unknown> => {
    if (!factory) {
      const url = blobUrl(loader, 'text/javascript')
      const importModule = env.importModule ?? ((u: string) => import(/* @vite-ignore */ u))
      factory = importModule(url)
        .then((m: { default?: unknown }) => {
          if (!m.default) throw new Error('landmarks: the runtime loader has no ModuleFactory')
          return m.default
        })
        .finally(() => {
          URL.revokeObjectURL(url)
        })
      factory.catch(() => {
        factory = null
      })
    }
    return factory
  }

  const dropCurrent = (): void => {
    current?.face?.close()
    current?.pose?.close()
    current = null
  }

  const create = async (
    model: AiModel,
    runtime: Runtime,
    modelBytes: ArrayBuffer,
  ): Promise<void> => {
    const mp = await loadVision()
    dropCurrent()
    const gen = ++generation
    const urls: string[] = []
    try {
      let wasmLoaderPath = ''
      if (env.loading === 'module-factory') {
        env.scope.ModuleFactory = await moduleFactory(runtime.loader)
      } else {
        wasmLoaderPath = blobUrl(runtime.loader, 'text/javascript')
        urls.push(wasmLoaderPath)
      }
      const wasmBinaryPath = blobUrl(runtime.wasm, 'application/wasm')
      urls.push(wasmBinaryPath)
      const fileset = { wasmLoaderPath, wasmBinaryPath }
      const baseOptions = { modelAssetBuffer: new Uint8Array(modelBytes), delegate: 'CPU' as const }
      const loaded: Loaded =
        model === 'face'
          ? {
              model,
              face: await mp.FaceLandmarker.createFromOptions(fileset, {
                baseOptions,
                runningMode: 'IMAGE',
                numFaces: MAX_FACES,
              }),
            }
          : {
              model,
              pose: await mp.PoseLandmarker.createFromOptions(fileset, {
                baseOptions,
                runningMode: 'IMAGE',
                numPoses: MAX_POSES,
              }),
            }
      if (gen !== generation) {
        loaded.face?.close()
        loaded.pose?.close()
        throw new Error('landmarks:closed')
      }
      current = loaded
    } finally {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }

  const detect = <T>(bitmap: ImageBitmap, run: (loaded: Loaded) => T): Promise<T> =>
    guarded(() =>
      Promise.resolve().then(() => {
        try {
          if (!current) throw notPrepared()
          return run(current)
        } finally {
          bitmap.close()
        }
      }),
    )

  return {
    init: () =>
      Promise.resolve().then(() => {
        if (!env.supported()) throw new Error('landmarks:unsupported')
      }),

    prepare: (model, runtime, modelBytes) =>
      guarded(async () => {
        if (current?.model === model) return
        try {
          await create(model, runtime, modelBytes)
          checkRefusals()
        } catch (e) {
          if (current?.model === model) dropCurrent()
          throw e
        }
      }),

    detectFaces: (bitmap) =>
      detect(bitmap, (loaded) => {
        if (!loaded.face) throw notPrepared()
        return loaded.face
          .detect(bitmap)
          .faceLandmarks.slice(0, MAX_FACES)
          .map((face) => ({ points: face.map((p) => ({ x: p.x, y: p.y })) }))
      }),

    detectPoses: (bitmap) =>
      detect(bitmap, (loaded) => {
        if (!loaded.pose) throw notPrepared()
        return loaded.pose
          .detect(bitmap)
          .landmarks.slice(0, MAX_POSES)
          .map((pose) => ({
            points: pose.map((p) => ({ x: p.x, y: p.y })),
            visibility: pose.map((p) => p.visibility ?? 0),
          }))
      }),

    close() {
      generation++
      dropCurrent()
    },
  }
}
