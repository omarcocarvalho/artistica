import { vi } from 'vitest'
import type { ImageDescriptor, ImageId } from '../../../../shared/model/image'
import type {
  AiAsset,
  AiAssets,
  DetectionPorts,
  EdgeEngine,
  LandmarkEngine,
  Progress,
} from '../schedule'
import type { AiModel, GuideKind } from '../store'

export interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

export class FakeBitmap {
  closed = false
  readonly imageId: ImageId
  readonly kind: GuideKind
  readonly rotation: number
  constructor(img: ImageDescriptor, kind: GuideKind) {
    this.imageId = img.id
    this.kind = kind
    this.rotation = img.edits.rotation
  }
  close(): void {
    this.closed = true
  }
}

export const ASSETS: AiAssets = {
  runtimeLoader: { url: '/artistica/assets/loader.js', bytes: 1_000, sha256: 'l' },
  runtimeWasm: { url: '/artistica/assets/runtime.wasm', bytes: 10_000, sha256: 'w' },
  face: { url: '/artistica/models/face.task', bytes: 3_000, sha256: 'f' },
  pose: { url: '/artistica/models/pose.task', bytes: 9_000, sha256: 'p' },
}

export type FaceOut = Awaited<ReturnType<LandmarkEngine['detectFaces']>>
export type PoseOut = Awaited<ReturnType<LandmarkEngine['detectPoses']>>
export type EdgeOut = Awaited<ReturnType<EdgeEngine['outline']>>

export interface FakeLandmarkEngine extends LandmarkEngine {
  readonly prepared: AiModel[]
  disposed: boolean
}

export interface Job<T> {
  readonly kind: GuideKind
  readonly bitmap: FakeBitmap
  readonly done: Deferred<T>
}

export type LoadImpl = (
  asset: AiAsset,
  onProgress: ((p: Progress) => void) | undefined,
  signal: AbortSignal | undefined,
) => Promise<ArrayBuffer>

export function fakePorts(options: { cached?: readonly AiModel[]; manual?: boolean } = {}) {
  const cachedUrls = new Set<string>()
  for (const m of options.cached ?? []) {
    cachedUrls.add(ASSETS.runtimeLoader.url)
    cachedUrls.add(ASSETS.runtimeWasm.url)
    cachedUrls.add(ASSETS[m].url)
  }
  const assetsOf = (m: AiModel) => [ASSETS.runtimeLoader, ASSETS.runtimeWasm, ASSETS[m]]

  const log: string[] = []
  const prepareCalls: Parameters<LandmarkEngine['prepare']>[] = []
  const landmarkEngines: FakeLandmarkEngine[] = []
  const edgeEngines: (EdgeEngine & { disposed: boolean })[] = []
  const pending: Job<FaceOut | PoseOut | EdgeOut>[] = []
  let activeLandmarks = 0
  let maxActiveLandmarks = 0
  let activeEdges = 0
  let maxActiveEdges = 0
  let maxLiveLandmarkEngines = 0

  const out: {
    faces: (b: FakeBitmap) => FaceOut
    poses: (b: FakeBitmap) => PoseOut
    edges: (b: FakeBitmap) => EdgeOut
  } = {
    faces: () => [{ points: [{ x: 0.25, y: 0.1 }] }],
    poses: () => [{ points: [{ x: 0.5, y: 0.5 }], visibility: [0.9] }],
    edges: () => [
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
      ],
    ],
  }

  function run<T>(kind: GuideKind, bitmap: FakeBitmap, result: () => T): Promise<T> {
    const landmark = kind !== 'edges'
    if (landmark) {
      activeLandmarks++
      maxActiveLandmarks = Math.max(maxActiveLandmarks, activeLandmarks)
    } else {
      activeEdges++
      maxActiveEdges = Math.max(maxActiveEdges, activeEdges)
    }
    log.push(`detect ${kind} ${bitmap.imageId}`)
    const done = deferred<T>()
    const finish = () => {
      if (landmark) activeLandmarks--
      else activeEdges--
    }
    const settled = done.promise.then(
      (v) => {
        finish()
        return v
      },
      (e: unknown) => {
        finish()
        throw e
      },
    )
    if (options.manual) pending.push({ kind, bitmap, done } as Job<FaceOut | PoseOut | EdgeOut>)
    else {
      try {
        done.resolve(result())
      } catch (e) {
        done.reject(e)
      }
    }
    return settled
  }

  const loadImpl: { current: LoadImpl } = {
    current: (asset, onProgress) => {
      if (!cachedUrls.has(asset.url)) {
        onProgress?.({ loaded: asset.bytes / 2, total: asset.bytes })
        onProgress?.({ loaded: asset.bytes, total: asset.bytes })
        cachedUrls.add(asset.url)
      }
      return Promise.resolve(new ArrayBuffer(8))
    },
  }

  const loader = {
    isCached: vi.fn((m: AiModel) =>
      Promise.resolve(assetsOf(m).every((a) => cachedUrls.has(a.url))),
    ),
    bytesToDownload: vi.fn((m: AiModel) =>
      Promise.resolve(
        assetsOf(m)
          .filter((a) => !cachedUrls.has(a.url))
          .reduce((n, a) => n + a.bytes, 0),
      ),
    ),
    loadAiAsset: vi.fn((asset: AiAsset, onProgress?: (p: Progress) => void, signal?: AbortSignal) =>
      loadImpl.current(asset, onProgress, signal),
    ),
  }

  const bitmaps: FakeBitmap[] = []
  const bitmapFor = vi.fn((img: ImageDescriptor, kind: GuideKind) => {
    const b = new FakeBitmap(img, kind)
    bitmaps.push(b)
    return Promise.resolve(b as unknown as ImageBitmap)
  })

  const asFake = (b: ImageBitmap) => b as unknown as FakeBitmap

  const landmarks = vi.fn((): LandmarkEngine => {
    const engine: FakeLandmarkEngine = {
      prepared: [],
      disposed: false,
      prepare: vi.fn((...args: Parameters<LandmarkEngine['prepare']>) => {
        const [model] = args
        prepareCalls.push(args)
        if (!engine.prepared.includes(model)) {
          log.push(`prepare ${model}`)
          engine.prepared.push(model)
        }
        return Promise.resolve()
      }),
      detectFaces: vi.fn((b: ImageBitmap) => run('face', asFake(b), () => out.faces(asFake(b)))),
      detectPoses: vi.fn((b: ImageBitmap) => run('pose', asFake(b), () => out.poses(asFake(b)))),
      dispose: vi.fn(() => {
        log.push(`dispose ${engine.prepared.join(',')}`)
        engine.disposed = true
      }),
    }
    landmarkEngines.push(engine)
    maxLiveLandmarkEngines = Math.max(
      maxLiveLandmarkEngines,
      landmarkEngines.filter((e) => !e.disposed).length,
    )
    return engine
  })

  const edges = vi.fn((): EdgeEngine => {
    const engine = {
      disposed: false,
      outline: vi.fn((b: ImageBitmap, detailPct: number) => {
        log.push(`detail ${String(detailPct)}`)
        return run('edges', asFake(b), () => out.edges(asFake(b)))
      }),
      dispose: vi.fn(() => {
        engine.disposed = true
      }),
    }
    edgeEngines.push(engine)
    return engine
  })

  const ports: DetectionPorts = { edges, landmarks, loader, assets: ASSETS, bitmapFor }

  return {
    ports,
    loader,
    loadImpl,
    bitmapFor,
    bitmaps,
    landmarks,
    edges,
    landmarkEngines,
    prepareCalls,
    edgeEngines,
    pending,
    out,
    log,
    cachedUrls,
    stats: () => ({ maxActiveLandmarks, maxActiveEdges, maxLiveLandmarkEngines }),
  }
}
