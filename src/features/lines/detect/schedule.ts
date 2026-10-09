import type { AiAsset, AiAssets } from 'virtual:ai-assets'
import type { ImageDescriptor, ImageId } from '../../../shared/model/image'
import { resolveCrop } from '../../render/crop'
import { fromCrop, fromRotated } from '../guides/map'
import type { EdgeOutline, FaceLandmarks, PoseLandmarks } from '../guides/types'
import {
  type AiModel,
  type DetectionResult,
  type DetectionStatus,
  detectionKey,
  type GuideKind,
  isOn,
  type ModelState,
  useDetections,
} from './store'

export interface EdgeEngine {
  /** Takes ownership of `bitmap` (the cropped picture). Result normalised to the bitmap. */
  outline(bitmap: ImageBitmap, detailPct: number): Promise<{ x: number; y: number }[][]>
  dispose(): void
}

export interface LandmarkEngine {
  prepare(
    model: AiModel,
    runtime: { loader: ArrayBuffer; wasm: ArrayBuffer },
    modelBytes: ArrayBuffer,
  ): Promise<void>
  /** Takes ownership of `bitmap` (the preview rotated by the user's rotation). Landmarks normalised to the bitmap. */
  detectFaces(bitmap: ImageBitmap): Promise<{ points: { x: number; y: number }[] }[]>
  detectPoses(
    bitmap: ImageBitmap,
  ): Promise<{ points: { x: number; y: number }[]; visibility: number[] }[]>
  dispose(): void
}

export type { AiAsset, AiAssets }

export interface Progress {
  readonly loaded: number
  readonly total: number
}

export interface AiLoader {
  isCached(model: AiModel): Promise<boolean>
  bytesToDownload(model: AiModel): Promise<number>
  loadAiAsset(
    asset: AiAsset,
    onProgress?: (p: Progress) => void,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer>
}

export interface DetectionPorts {
  readonly edges: () => EdgeEngine
  readonly landmarks: () => LandmarkEngine
  readonly loader: AiLoader
  readonly assets: AiAssets
  /** The preview of `img.id` rotated by `img.edits.rotation` (face, pose), or cropped by `resolveCrop(img)` and scaled (edges), from this descriptor, never a newer one; the caller takes ownership. */
  readonly bitmapFor: (img: ImageDescriptor, kind: GuideKind) => Promise<ImageBitmap>
}

export interface DetectionScheduler {
  /** Requests every detection the images' lines need and drops the results of photos no longer present (M4-R8). Never downloads. */
  sync(images: readonly ImageDescriptor[]): void
  /** The user's "Download & turn on" (M4-R19). */
  download(model: AiModel): void
  retry(kind: GuideKind, imageId: ImageId): void
  dispose(): void
}

export const MAX_EDGE_ENTRIES_PER_HASH = 4

/** A download that receives no bytes for this long fails as a download failure, so it cannot hold the export gate (M4-R18). */
export const DOWNLOAD_STALL_MS = 30_000

const KINDS: readonly GuideKind[] = ['face', 'pose', 'edges']
const MODELS: readonly AiModel[] = ['face', 'pose']

interface Want {
  readonly kind: GuideKind
  readonly hash: string
  readonly images: ImageDescriptor[]
}

interface Loaded {
  readonly model: AiModel
  readonly engine: LandmarkEngine
  readonly bytes: { loader: ArrayBuffer; wasm: ArrayBuffer; model: ArrayBuffer }
}

class Cancelled extends Error {}

function hashOf(key: string): string {
  return key.split('|')[1] ?? ''
}

function failure(error: unknown): 'unsupported' | 'error' {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /unsupported/i.test(text) ? 'unsupported' : 'error'
}

export function createDetectionScheduler(ports: DetectionPorts): DetectionScheduler {
  let disposed = false
  const isDisposed = () => disposed
  let images: readonly ImageDescriptor[] = []
  let wanted = new Map<string, Want>()
  let present = new Set<string>()

  const queues: Record<'landmarks' | 'edges', string[]> = { landmarks: [], edges: [] }
  const busy = { landmarks: false, edges: false }
  const inFlight = new Set<string>()
  let loaded: Loaded | null = null
  let edgeEngine: EdgeEngine | null = null

  const probing = new Set<AiModel>()
  const clicked = new Set<AiModel>()
  const neededBytes = new Map<AiModel, number>()
  const downloads = new Map<AiModel, AbortController>()
  const progress = new Map<AiModel, Progress>()
  const failedDownload = new Map<AiModel, 'download' | 'integrity'>()

  const lastUse = new Map<string, number>()
  let tick = 0

  const model = (m: AiModel): ModelState => useDetections.getState().models[m]

  function setModel(m: AiModel, state: ModelState): void {
    useDetections.setState((s) => ({ models: { ...s.models, [m]: state } }))
  }

  function setStatuses(changes: readonly (readonly [string, DetectionStatus | null])[]): void {
    if (changes.length === 0) return
    useDetections.setState((s) => {
      const status = new Map(s.status)
      for (const [key, value] of changes) {
        if (value === null) status.delete(key)
        else status.set(key, value)
      }
      return { status }
    })
  }

  const keysOf = (m: AiModel): string[] =>
    [...wanted.entries()].filter(([, w]) => w.kind === m).map(([key]) => key)

  function computeWanted(list: readonly ImageDescriptor[]): Map<string, Want> {
    const next = new Map<string, Want>()
    for (const img of list) {
      for (const kind of KINDS) {
        if (!isOn(kind, img)) continue
        const key = detectionKey(kind, img)
        const want = next.get(key)
        if (want) want.images.push(img)
        else next.set(key, { kind, hash: img.contentHash, images: [img] })
      }
    }
    return next
  }

  function sync(list: readonly ImageDescriptor[]): void {
    if (disposed) return
    images = list
    wanted = computeWanted(list)
    present = new Set(list.map((i) => i.contentHash))

    const { results, status } = useDetections.getState()
    const dropResults = [...results.keys()].filter((k) => !present.has(hashOf(k)))
    if (dropResults.length > 0) {
      useDetections.setState((s) => {
        const next = new Map(s.results)
        for (const k of dropResults) next.delete(k)
        return { results: next }
      })
      for (const k of dropResults) lastUse.delete(k)
    }
    setStatuses(
      [...status.entries()]
        .filter(([key, value]) => {
          if (!present.has(hashOf(key))) return true
          if (wanted.has(key)) return false
          return value.state !== 'done' && !inFlight.has(key)
        })
        .map(([key]) => [key, null] as const),
    )
    queues.landmarks = queues.landmarks.filter((k) => wanted.has(k))
    queues.edges = queues.edges.filter((k) => wanted.has(k))

    for (const m of MODELS) {
      const controller = downloads.get(m)
      if (controller && keysOf(m).length === 0) {
        downloads.delete(m)
        controller.abort()
        progress.delete(m)
        clicked.delete(m)
        setModel(m, 'absent')
        void refreshNeeded(m).catch(() => undefined)
      }
    }

    const current = useDetections.getState().status
    for (const [key, want] of wanted) {
      if (want.kind === 'edges' && results.has(key)) lastUse.set(key, ++tick)
      if (!current.has(key)) request(key, want.kind)
    }
    pump()
  }

  function request(key: string, kind: GuideKind): void {
    if (inFlight.has(key)) {
      setStatuses([[key, { state: 'running' }]])
      return
    }
    if (kind === 'edges') {
      queues.edges.push(key)
      setStatuses([[key, { state: 'running' }]])
      return
    }
    switch (model(kind)) {
      case 'cached':
        queues.landmarks.push(key)
        setStatuses([[key, { state: 'running' }]])
        return
      case 'downloading':
        setStatuses([
          [key, { state: 'downloading', ...(progress.get(kind) ?? { loaded: 0, total: 0 }) }],
        ])
        return
      case 'failed':
        setStatuses([[key, { state: 'failed', reason: failedDownload.get(kind) ?? 'download' }]])
        return
      case 'absent':
        setStatuses([[key, { state: 'needs-download', bytes: neededBytes.get(kind) ?? 0 }]])
        return
      case 'unknown':
        probe(kind)
        return
    }
  }

  function requestUnseen(m: AiModel): void {
    const status = useDetections.getState().status
    for (const key of keysOf(m)) if (!status.has(key)) request(key, m)
    pump()
  }

  function probe(m: AiModel): void {
    if (probing.has(m)) return
    probing.add(m)
    void (async () => {
      try {
        const cached = await ports.loader.isCached(m)
        const bytes = cached ? 0 : await ports.loader.bytesToDownload(m)
        if (disposed || model(m) !== 'unknown') return
        neededBytes.set(m, bytes)
        setModel(m, cached ? 'cached' : 'absent')
        requestUnseen(m)
      } catch {
        if (disposed || model(m) !== 'unknown') return
        const status = useDetections.getState().status
        setStatuses(
          keysOf(m)
            .filter((key) => !status.has(key))
            .map((key) => [key, { state: 'failed', reason: 'error' }] as const),
        )
      } finally {
        probing.delete(m)
      }
    })()
  }

  async function refreshNeeded(m: AiModel): Promise<void> {
    if (model(m) !== 'absent') return
    const bytes = await ports.loader.bytesToDownload(m)
    if (disposed || model(m) !== 'absent') return
    neededBytes.set(m, bytes)
    setStatuses(
      keysOf(m)
        .filter((key) => useDetections.getState().status.get(key)?.state === 'needs-download')
        .map((key) => [key, { state: 'needs-download', bytes }] as const),
    )
  }

  function assetsOf(m: AiModel) {
    return [ports.assets.runtimeLoader, ports.assets.runtimeWasm, ports.assets[m]] as const
  }

  function download(m: AiModel): void {
    if (disposed || downloads.has(m) || model(m) === 'cached') return
    const controller = new AbortController()
    downloads.set(m, controller)
    clicked.add(m)
    failedDownload.delete(m)
    setModel(m, 'downloading')
    const show = (p: Progress) => {
      progress.set(m, p)
      setStatuses(keysOf(m).map((key) => [key, { state: 'downloading', ...p }] as const))
    }
    show({ loaded: 0, total: neededBytes.get(m) ?? 0 })
    const mine = () => !disposed && downloads.get(m) === controller

    const fail = (reason: 'download' | 'integrity') => {
      clearTimeout(stall)
      downloads.delete(m)
      progress.delete(m)
      clicked.delete(m)
      failedDownload.set(m, reason)
      setModel(m, 'failed')
      setStatuses(keysOf(m).map((key) => [key, { state: 'failed', reason }] as const))
    }
    let stall: ReturnType<typeof setTimeout> | undefined
    const watch = () => {
      clearTimeout(stall)
      stall = setTimeout(() => {
        if (!mine()) return
        fail('download')
        controller.abort()
      }, DOWNLOAD_STALL_MS)
    }
    watch()

    void (async () => {
      try {
        const total = await ports.loader.bytesToDownload(m)
        if (!mine()) return
        show({ loaded: 0, total })
        const assets = assetsOf(m)
        const loadedBytes = assets.map(() => 0)
        await Promise.all(
          assets.map((asset, i) =>
            ports.loader.loadAiAsset(
              asset,
              (p) => {
                const grew = p.loaded > (loadedBytes[i] ?? 0)
                loadedBytes[i] = p.loaded
                if (mine()) {
                  if (grew) watch()
                  const sum = loadedBytes.reduce((a, b) => a + b, 0)
                  show({ loaded: Math.min(sum, total), total })
                }
              },
              controller.signal,
            ),
          ),
        )
        if (!mine()) return
        clearTimeout(stall)
        downloads.delete(m)
        progress.delete(m)
        setModel(m, 'cached')
        setStatuses(keysOf(m).map((key) => [key, null] as const))
        requestUnseen(m)
        const other: AiModel = m === 'face' ? 'pose' : 'face'
        void refreshNeeded(other).catch(() => undefined)
      } catch (error) {
        if (!mine()) return
        fail(error instanceof Error && error.name === 'AiIntegrityError' ? 'integrity' : 'download')
      }
    })()
  }

  function retry(kind: GuideKind, imageId: ImageId): void {
    if (disposed) return
    const img = images.find((i) => i.id === imageId)
    if (!img || !isOn(kind, img)) return
    const key = detectionKey(kind, img)
    const status = useDetections.getState().status.get(key)
    if (status?.state !== 'failed') return
    if (kind !== 'edges' && (status.reason === 'download' || status.reason === 'integrity')) {
      download(kind)
      return
    }
    setStatuses([[key, null]])
    request(key, kind)
    pump()
  }

  function nextLandmarkKey(): string | undefined {
    const preferred = loaded?.model
    const i = queues.landmarks.findIndex((k) => wanted.get(k)?.kind === preferred)
    return queues.landmarks.splice(Math.max(i, 0), 1)[0]
  }

  function pump(): void {
    if (disposed) return
    if (!busy.landmarks) {
      const key = nextLandmarkKey()
      if (key !== undefined) runJob('landmarks', key)
    }
    if (!busy.edges) {
      const key = queues.edges.shift()
      if (key !== undefined) runJob('edges', key)
    }
  }

  function runJob(queue: 'landmarks' | 'edges', key: string): void {
    const want = wanted.get(key)
    if (!want) {
      pump()
      return
    }
    busy[queue] = true
    inFlight.add(key)
    void (async () => {
      try {
        const found =
          want.kind === 'edges' ? await runEdges(key) : await runLandmarks(key, want.kind)
        store(key, found.result, found.count)
      } catch (error) {
        if (!disposed && !wanted.has(key)) setStatuses([[key, null]])
        else if (!(error instanceof Cancelled) && !disposed) {
          setStatuses([[key, { state: 'failed', reason: failure(error) }]])
        }
      } finally {
        inFlight.delete(key)
        busy[queue] = false
        if (want.kind !== 'edges' && model(want.kind) === 'unknown') requestUnseen(want.kind)
        pump()
      }
    })()
  }

  async function bitmapFor(
    key: string,
    kind: GuideKind,
  ): Promise<{ bitmap: ImageBitmap; img: ImageDescriptor }> {
    const img = wanted.get(key)?.images[0]
    if (!img) throw new Cancelled()
    const bitmap = await ports.bitmapFor(img, kind)
    if (disposed || !wanted.has(key)) {
      bitmap.close()
      throw new Cancelled()
    }
    return { bitmap, img }
  }

  async function runEdges(key: string): Promise<{ result: EdgeOutline; count: number }> {
    const { bitmap, img } = await bitmapFor(key, 'edges')
    edgeEngine ??= ports.edges()
    const lines = await edgeEngine.outline(bitmap, img.lines.edges.detailPct)
    const crop = resolveCrop(img)
    const polylines = lines.map((line) => line.map((p) => fromCrop(p, crop, img.pxW, img.pxH)))
    return { result: { polylines }, count: polylines.length }
  }

  async function engineFor(m: AiModel): Promise<LandmarkEngine> {
    if (loaded?.model === m) {
      const held = loaded
      const { engine, bytes } = held
      try {
        await engine.prepare(m, { loader: bytes.loader, wasm: bytes.wasm }, bytes.model)
      } catch (error) {
        if (loaded === held) {
          engine.dispose()
          loaded = null
        }
        throw error
      }
      if (disposed) throw new Cancelled()
      return engine
    }
    if (loaded) {
      loaded.engine.dispose()
      loaded = null
    }
    if (!clicked.has(m) && !(await ports.loader.isCached(m))) {
      setModel(m, 'unknown')
      queues.landmarks = queues.landmarks.filter((k) => wanted.get(k)?.kind !== m)
      setStatuses(keysOf(m).map((k) => [k, null] as const))
      throw new Cancelled()
    }
    const load = (asset: AiAsset) => ports.loader.loadAiAsset(asset)
    const [loader, wasm, modelBytes] = await Promise.all([
      load(ports.assets.runtimeLoader),
      load(ports.assets.runtimeWasm),
      load(ports.assets[m]),
    ])
    if (disposed) throw new Cancelled()
    const engine = ports.landmarks()
    try {
      await engine.prepare(m, { loader, wasm }, modelBytes)
    } catch (error) {
      engine.dispose()
      throw error
    }
    if (isDisposed()) {
      engine.dispose()
      throw new Cancelled()
    }
    loaded = { model: m, engine, bytes: { loader, wasm, model: modelBytes } }
    return engine
  }

  async function runLandmarks(
    key: string,
    m: AiModel,
  ): Promise<{ result: FaceLandmarks[] | PoseLandmarks[]; count: number }> {
    const engine = await engineFor(m)
    const { bitmap, img } = await bitmapFor(key, m)
    const rotation = img.edits.rotation
    if (m === 'face') {
      const faces = await engine.detectFaces(bitmap)
      const result = faces.map((f) => ({ points: f.points.map((p) => fromRotated(p, rotation)) }))
      return { result, count: result.length }
    }
    const poses = await engine.detectPoses(bitmap)
    const result = poses.map((p) => ({
      points: p.points.map((q) => fromRotated(q, rotation)),
      visibility: Array.from(p.visibility, Number),
    }))
    return { result, count: result.length }
  }

  function store(key: string, result: DetectionResult, count: number): void {
    if (disposed) return
    const hash = hashOf(key)
    if (!present.has(hash)) return
    const evict: string[] = []
    if (key.startsWith('edges|')) {
      lastUse.set(key, ++tick)
      const results = useDetections.getState().results
      const same = [...results.keys()].filter(
        (k) => k !== key && k.startsWith('edges|') && hashOf(k) === hash,
      )
      const spare = same
        .filter((k) => !wanted.has(k))
        .sort((p, q) => (lastUse.get(p) ?? 0) - (lastUse.get(q) ?? 0))
      evict.push(...spare.slice(0, Math.max(0, same.length + 1 - MAX_EDGE_ENTRIES_PER_HASH)))
      for (const k of evict) lastUse.delete(k)
    }
    useDetections.setState((s) => {
      const results = new Map(s.results)
      const status = new Map(s.status)
      for (const k of evict) {
        results.delete(k)
        status.delete(k)
      }
      results.set(key, result)
      status.set(key, { state: 'done', found: count })
      return { results, status }
    })
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    for (const controller of downloads.values()) controller.abort()
    downloads.clear()
    loaded?.engine.dispose()
    loaded = null
    edgeEngine?.dispose()
    edgeEngine = null
  }

  return { sync, download, retry, dispose }
}
