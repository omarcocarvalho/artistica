import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageDescriptor, ImageEdits } from '../../../shared/model/image'
import { DEFAULT_LINES, type LinesPatch, linesKey, patchLines } from '../../../shared/model/lines'
import { useSettings } from '../../settings/store'
import { buildLayoutItems } from '../../layout'
import { buildPageModels } from '../../render/page-model/build-page-models'
import { tileRenderKey } from '../../render/pixels/tile-plan'
import { descriptor, layoutOf, placement, setupWith } from '../../render/test-support/fixtures'
import { fromCrop, fromRotated } from '../guides/map'
import type { EdgeOutline, FaceLandmarks, PoseLandmarks } from '../guides/types'
import { createDetectionScheduler, type DetectionScheduler, DOWNLOAD_STALL_MS } from './schedule'
import {
  type DetectionStatus,
  detectionKey,
  guidesFor,
  INITIAL_DETECTIONS,
  useDetections,
} from './store'
import { ASSETS, type Deferred, deferred, fakePorts, flush } from './test-support/fake-ports'

function img(
  name: string,
  lines: LinesPatch = {},
  edits: Partial<ImageEdits> = {},
  hash = `h${name}`,
): ImageDescriptor {
  const base = descriptor(name, 1000, 500, edits)
  return { ...base, contentHash: hash, lines: patchLines(DEFAULT_LINES, lines) }
}

const FACE: LinesPatch = { face: true }
const POSE: LinesPatch = { pose: true }
const EDGES = (detailPct = 50): LinesPatch => ({ edges: { on: true, detailPct } })
const ALL: LinesPatch = { face: true, pose: true, edges: { on: true } }

const status = (key: string): DetectionStatus | undefined =>
  useDetections.getState().status.get(key)
const result = (key: string) => useDetections.getState().results.get(key)

let scheduler: DetectionScheduler | undefined
function start(ports: ReturnType<typeof fakePorts>['ports']): DetectionScheduler {
  scheduler = createDetectionScheduler(ports)
  return scheduler
}

beforeEach(() => {
  useDetections.setState(INITIAL_DETECTIONS, true)
})
afterEach(() => {
  scheduler?.dispose()
  scheduler = undefined
})

describe('sync', () => {
  it('requests the detections that switched-on guides need, once per key', async () => {
    const h = fakePorts({ cached: ['face', 'pose'] })
    const s = start(h.ports)
    const a = img('a', { face: true, edges: { on: true } })
    const twin = img('b', { face: true, edges: { on: true } }, {}, a.contentHash)
    const off = img('c')
    s.sync([a, twin, off])
    s.sync([a, twin, off])
    await flush()
    s.sync([{ ...a }, twin, off])
    s.sync([a, twin, off])
    await flush()

    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect edges a', 'detect face a'])
    expect(h.bitmapFor).toHaveBeenCalledTimes(2)
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
    expect(status(detectionKey('edges', a))).toEqual({ state: 'done', found: 1 })
    expect(status(detectionKey('pose', a))).toBeUndefined()
    expect(useDetections.getState().status.size).toBe(2)
    expect(guidesFor(useDetections.getState(), twin)).toEqual(
      guidesFor(useDetections.getState(), a),
    )
  })

  it('runs a key again only when the key changes (rotation, crop, detail), never for a style or flip', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    const a = img('a', { face: true, edges: { on: true } })
    s.sync([a])
    await flush()
    const styled = { ...a, lines: patchLines(a.lines, { style: { colour: '#000000' } }) }
    const flipped = { ...styled, edits: { ...styled.edits, flipH: true } }
    s.sync([flipped])
    await flush()
    expect(h.log.filter((l) => l.startsWith('detect'))).toHaveLength(2)

    s.sync([{ ...flipped, edits: { ...flipped.edits, rotation: 90 } }])
    await flush()
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual([
      'detect edges a',
      'detect face a',
      'detect face a',
    ])
  })

  it('keeps a result when a guide is switched off and on again', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.sync([img('a')])
    s.sync([a])
    await flush()
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect face a'])
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
  })

  it('a result of nothing found is done with found 0, kept apart from nothing known', async () => {
    const h = fakePorts({ cached: ['face'] })
    h.out.faces = () => []
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 0 })
    expect(guidesFor(useDetections.getState(), a).faces).toEqual([])
  })
})

describe('downloads', () => {
  it('sync never downloads: an uncached model sets needs-download with bytesToDownload', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', POSE)
    s.sync([a, b])
    await flush()
    s.sync([a, b])
    await flush()

    expect(h.loader.loadAiAsset).not.toHaveBeenCalled()
    expect(h.landmarks).not.toHaveBeenCalled()
    expect(h.bitmapFor).not.toHaveBeenCalled()
    expect(status(detectionKey('face', a))).toEqual({ state: 'needs-download', bytes: 14_000 })
    expect(status(detectionKey('pose', b))).toEqual({ state: 'needs-download', bytes: 20_000 })
    expect(useDetections.getState().models).toEqual({ face: 'absent', pose: 'absent' })
  })

  it('a model found cached runs at once, reading its bytes through the loader', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    expect(useDetections.getState().models.face).toBe('cached')
    expect(h.loader.loadAiAsset.mock.calls.map(([asset]) => asset)).toEqual([
      ASSETS.runtimeLoader,
      ASSETS.runtimeWasm,
      ASSETS.face,
    ])
    const [prepared, runtime, bytes] = h.prepareCalls[0] ?? []
    expect(prepared).toBe('face')
    expect(runtime?.loader).toBeInstanceOf(ArrayBuffer)
    expect(runtime?.wasm).toBeInstanceOf(ArrayBuffer)
    expect(bytes).toBeInstanceOf(ArrayBuffer)
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
  })

  it('a model cleared from the cache after the check is never downloaded by a detection', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', FACE)
    h.loader.isCached.mockResolvedValueOnce(true).mockResolvedValue(false)
    h.cachedUrls.clear()
    s.sync([a, b])
    await flush()
    expect(h.loader.loadAiAsset).not.toHaveBeenCalled()
    expect(h.landmarks).not.toHaveBeenCalled()
    expect(status(detectionKey('face', a))).toEqual({ state: 'needs-download', bytes: 14_000 })
    expect(status(detectionKey('face', b))).toEqual({ state: 'needs-download', bytes: 14_000 })
    expect(useDetections.getState().models.face).toBe('absent')
    expect(h.loader.isCached).toHaveBeenCalledTimes(3)
  })

  it('download(model) loads the runtime and the model through the loader with progress, then runs the waiting detections', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', FACE)
    s.sync([a, b])
    await flush()
    const seen: DetectionStatus[] = []
    const unsubscribe = useDetections.subscribe((st) => {
      const x = st.status.get(detectionKey('face', a))
      if (x && x !== seen.at(-1)) seen.push(x)
    })
    s.download('face')
    await flush()
    unsubscribe()

    expect(
      h.loader.loadAiAsset.mock.calls
        .slice(0, 3)
        .map(([asset, progress, signal]) => [
          asset,
          typeof progress,
          signal instanceof AbortSignal,
        ]),
    ).toEqual([
      [ASSETS.runtimeLoader, 'function', true],
      [ASSETS.runtimeWasm, 'function', true],
      [ASSETS.face, 'function', true],
    ])
    const loaded = seen.flatMap((x) => (x.state === 'downloading' ? [[x.loaded, x.total]] : []))
    expect(loaded[0]).toEqual([0, 14_000])
    expect(loaded.at(-1)).toEqual([14_000, 14_000])
    const amounts = loaded.map(([n = 0]) => n)
    expect(amounts).toEqual([...amounts].sort((p, q) => p - q))
    expect(seen.at(-1)).toEqual({ state: 'done', found: 1 })
    expect(status(detectionKey('face', b))).toEqual({ state: 'done', found: 1 })
    expect(useDetections.getState().models.face).toBe('cached')
  })

  it('after one model downloads, the other asks only for its own bytes', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const a = img('a', { face: true, pose: true })
    s.sync([a])
    await flush()
    expect(status(detectionKey('pose', a))).toEqual({ state: 'needs-download', bytes: 20_000 })
    s.download('face')
    await flush()
    expect(status(detectionKey('pose', a))).toEqual({ state: 'needs-download', bytes: 9_000 })
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect face a'])
  })

  it('an image added while its model downloads shows the download', async () => {
    const h = fakePorts()
    const gate = deferred<ArrayBuffer>()
    h.loadImpl.current = (asset, onProgress) => {
      onProgress?.({ loaded: 100, total: asset.bytes })
      return gate.promise
    }
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.download('face')
    await flush()
    const b = img('b', FACE)
    s.sync([a, b])
    expect(status(detectionKey('face', b))).toEqual({
      state: 'downloading',
      loaded: 300,
      total: 14_000,
    })
    gate.resolve(new ArrayBuffer(8))
  })

  it('a failed download sets every waiting key of that model to failed: download; retry re-runs it', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', FACE)
    const p = img('p', POSE)
    s.sync([a, b, p])
    await flush()
    const ok = h.loadImpl.current
    h.loadImpl.current = () =>
      Promise.reject(Object.assign(new Error('offline'), { name: 'AiDownloadError' }))
    s.download('face')
    await flush()

    expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'download' })
    expect(status(detectionKey('face', b))).toEqual({ state: 'failed', reason: 'download' })
    expect(status(detectionKey('pose', p))).toEqual({ state: 'needs-download', bytes: 20_000 })
    expect(useDetections.getState().models.face).toBe('failed')

    const c = img('c', FACE)
    s.sync([a, b, p, c])
    expect(status(detectionKey('face', c))).toEqual({ state: 'failed', reason: 'download' })

    h.loadImpl.current = ok
    s.retry('face', a.id)
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
    expect(status(detectionKey('face', b))).toEqual({ state: 'done', found: 1 })
    expect(status(detectionKey('face', c))).toEqual({ state: 'done', found: 1 })
  })

  it('a file that fails its integrity check sets failed: integrity', async () => {
    const h = fakePorts()
    h.loadImpl.current = () =>
      Promise.reject(Object.assign(new Error('bad'), { name: 'AiIntegrityError' }))
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.download('face')
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'integrity' })
  })

  it('switching a guide off aborts its download if nothing else waits for that model', async () => {
    const h = fakePorts()
    const signals: AbortSignal[] = []
    h.loadImpl.current = (_asset, _progress, signal) => {
      if (signal) signals.push(signal)
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    }
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', FACE)
    s.sync([a, b])
    await flush()
    s.download('face')
    await flush()
    expect(signals).toHaveLength(3)

    s.sync([a, img('b')])
    await flush()
    expect(signals.every((x) => !x.aborted)).toBe(true)

    s.sync([img('a'), img('b')])
    await flush()
    expect(signals.every((x) => x.aborted)).toBe(true)
    expect(useDetections.getState().models.face).toBe('absent')
    expect(useDetections.getState().status.size).toBe(0)

    s.sync([a])
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'needs-download', bytes: 14_000 })
  })

  it('after an aborted download, the box asks only for what is still missing', async () => {
    const h = fakePorts()
    h.loadImpl.current = (asset, _progress, signal) => {
      if (asset !== ASSETS.face) {
        h.cachedUrls.add(asset.url)
        return Promise.resolve(new ArrayBuffer(8))
      }
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    }
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.download('face')
    await flush()
    s.sync([img('a')])
    await flush()
    s.sync([a])
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'needs-download', bytes: 3_000 })
  })

  describe('a download that stalls (no bytes for DOWNLOAD_STALL_MS)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    const settle = () => vi.advanceTimersByTimeAsync(0)

    function stalling(h: ReturnType<typeof fakePorts>) {
      const signals: AbortSignal[] = []
      const feeds: ((loaded: number) => void)[] = []
      h.loadImpl.current = (asset, onProgress, signal) => {
        if (signal) signals.push(signal)
        feeds.push((loaded) => onProgress?.({ loaded, total: asset.bytes }))
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        })
      }
      return { signals, feeds }
    }

    it('fails as a download failure after 30 s without bytes, aborts the fetches, and Try again downloads again', async () => {
      expect(DOWNLOAD_STALL_MS).toBe(30_000)
      const h = fakePorts()
      const ok = h.loadImpl.current
      const { signals } = stalling(h)
      const s = start(h.ports)
      const a = img('a', FACE)
      s.sync([a])
      await settle()
      s.download('face')
      await settle()
      expect(signals).toHaveLength(3)

      await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS - 1)
      expect(status(detectionKey('face', a))?.state).toBe('downloading')
      expect(signals.some((x) => x.aborted)).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'download' })
      expect(useDetections.getState().models.face).toBe('failed')
      expect(signals.every((x) => x.aborted)).toBe(true)

      h.loadImpl.current = ok
      s.retry('face', a.id)
      await settle()
      expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
    })

    it('every new byte restarts the 30 s; only a gap with none fails', async () => {
      const h = fakePorts()
      const { feeds } = stalling(h)
      const s = start(h.ports)
      const a = img('a', FACE)
      s.sync([a])
      await settle()
      s.download('face')
      await settle()

      for (let i = 1; i <= 4; i++) {
        await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS - 1_000)
        feeds[2]?.(i * 100)
      }
      await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS - 1_000)
      feeds[2]?.(400)
      expect(status(detectionKey('face', a))).toEqual({
        state: 'downloading',
        loaded: 400,
        total: 14_000,
      })
      await vi.advanceTimersByTimeAsync(1_000)
      expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'download' })
    })

    it('a download that finishes, or is switched off, never fails later', async () => {
      const h = fakePorts()
      const s = start(h.ports)
      const a = img('a', FACE)
      s.sync([a])
      await settle()
      s.download('face')
      await settle()
      expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
      await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS * 2)
      expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })

      const p = img('p', POSE)
      stalling(h)
      s.sync([a, p])
      await settle()
      s.download('pose')
      await settle()
      s.sync([a, img('p')])
      await settle()
      expect(useDetections.getState().models.pose).toBe('absent')
      await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS * 2)
      expect(useDetections.getState().models.pose).toBe('absent')
      s.sync([a, p])
      await settle()
      expect(status(detectionKey('pose', p))).toEqual({ state: 'needs-download', bytes: 9_000 })
    })
  })

  it('download is ignored while the model downloads or once it is cached', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    s.sync([img('a', FACE)])
    await flush()
    const calls = h.loader.loadAiAsset.mock.calls.length
    s.download('face')
    await flush()
    expect(h.loader.loadAiAsset.mock.calls.length).toBe(calls)
  })
})

describe('jobs', () => {
  it('landmark jobs run one at a time, grouped by model, with one landmarker loaded at a time; edge jobs one at a time on their own queue', async () => {
    const h = fakePorts({ cached: ['face', 'pose'], manual: true })
    const s = start(h.ports)
    const done: string[] = []
    const settle = async () => {
      while (h.pending.length > 0) {
        expect(h.pending.filter((j) => j.kind !== 'edges').length).toBeLessThanOrEqual(1)
        expect(h.pending.filter((j) => j.kind === 'edges').length).toBeLessThanOrEqual(1)
        const job = h.pending.shift()
        if (!job) break
        done.push(`${job.kind} ${job.bitmap.imageId}`)
        job.done.resolve([])
        await flush()
      }
    }
    const x = img('x', ALL)
    s.sync([x])
    await flush()
    await settle()
    const a = img('a', ALL)
    const b = img('b', ALL)
    s.sync([x, a, b])
    await flush()
    await settle()

    expect(h.log.filter((l) => l.startsWith('detect') && !l.includes('edges'))).toEqual([
      'detect face x',
      'detect pose x',
      'detect face a',
      'detect face b',
      'detect pose a',
      'detect pose b',
    ])
    expect(h.log.filter((l) => /^(prepare|dispose)/.test(l))).toEqual([
      'prepare face',
      'dispose face',
      'prepare pose',
      'dispose pose',
      'prepare face',
      'dispose face',
      'prepare pose',
      'dispose pose',
    ])
    expect(h.landmarkEngines.map((e) => e.prepared)).toEqual([
      ['face'],
      ['pose'],
      ['face'],
      ['pose'],
    ])
    expect(h.stats()).toEqual({
      maxActiveLandmarks: 1,
      maxActiveEdges: 1,
      maxLiveLandmarkEngines: 1,
    })
    expect(done.filter((d) => d.startsWith('edges'))).toEqual(['edges x', 'edges a', 'edges b'])
  })

  it('a later sync never starts a second job on a busy queue', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const images = ['a', 'b', 'c'].map((n) => img(n, { face: true, edges: { on: true } }))
    s.sync(images)
    await flush()
    s.sync(images)
    s.sync([...images])
    await flush()
    expect(h.pending.map((j) => j.kind).sort()).toEqual(['edges', 'face'])
  })

  it('an edge job runs while a landmark job is busy', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    s.sync([img('a', { face: true, edges: { on: true } })])
    await flush()
    expect(h.pending.map((j) => j.kind).sort()).toEqual(['edges', 'face'])
  })

  it('keeps the loaded landmarker while jobs of its model keep coming', async () => {
    const h = fakePorts({ cached: ['face', 'pose'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    const p = img('p', POSE)
    s.sync([a, p])
    await flush()
    const b = img('b', FACE)
    s.sync([a, p, b])
    await flush()
    for (let i = 0; i < 3; i++) {
      h.pending.shift()?.done.resolve([])
      await flush()
    }
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual([
      'detect face a',
      'detect face b',
      'detect pose p',
    ])
  })

  it('face and pose bitmaps are the preview rotated by the user’s rotation; results go back through fromRotated', async () => {
    const h = fakePorts({ cached: ['face', 'pose'] })
    const s = start(h.ports)
    const a = img('a', { face: true, pose: true }, { rotation: 90, flipH: true })
    s.sync([a])
    await flush()
    expect(h.bitmapFor.mock.calls).toEqual([
      [a, 'face'],
      [a, 'pose'],
    ])
    const faces = result(detectionKey('face', a)) as FaceLandmarks[]
    expect(faces[0]?.points[0]?.x).toBeCloseTo(0.1, 12)
    expect(faces[0]?.points[0]?.y).toBeCloseTo(0.75, 12)
    const poses = result(detectionKey('pose', a)) as PoseLandmarks[]
    expect(poses).toEqual([{ points: [fromRotated({ x: 0.5, y: 0.5 }, 90)], visibility: [0.9] }])
  })

  it('edge bitmaps are the crop; results go back through fromCrop with the resolved crop', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const a = img('a', EDGES(37), { crop: { x: 100, y: 50, w: 200, h: 100 }, rotation: 270 })
    s.sync([a])
    await flush()
    expect(h.bitmapFor.mock.calls).toEqual([[a, 'edges']])
    expect(h.log).toContain('detail 37')
    const outline = result(detectionKey('edges', a)) as EdgeOutline
    expect(outline.polylines).toEqual([
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
    ])
    expect(outline.polylines[0]?.[1]).toEqual(
      fromCrop({ x: 0.5, y: 0.5 }, { x: 100, y: 50, w: 200, h: 100 }, 1000, 500),
    )
  })

  it('an edge crop that reaches past the image maps back through the clamped crop', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const a = img('a', EDGES(), { crop: { x: 900, y: -20, w: 400, h: 100 } })
    s.sync([a])
    await flush()
    const outline = result(detectionKey('edges', a)) as EdgeOutline
    expect(outline.polylines[0]?.[1]).toEqual({ x: 0.95, y: 0.1 })
  })

  it('a rotation changed while a face job runs stores the old key’s result under the old key, mapped with the old rotation', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a0 = img('a', FACE)
    const a90 = { ...a0, edits: { ...a0.edits, rotation: 90 as const } }
    s.sync([a0])
    await flush()
    expect(h.pending.map((j) => j.bitmap.rotation)).toEqual([0])
    s.sync([a90])
    await flush()
    h.pending.shift()?.done.resolve([{ points: [{ x: 0.25, y: 0.1 }] }])
    await flush()
    expect(result(detectionKey('face', a0))).toEqual([{ points: [{ x: 0.25, y: 0.1 }] }])
    expect(h.pending.map((j) => j.bitmap.rotation)).toEqual([90])
    expect(result(detectionKey('face', a90))).toBeUndefined()
    h.pending.shift()?.done.resolve([{ points: [{ x: 0.25, y: 0.1 }] }])
    await flush()
    expect(result(detectionKey('face', a90))).toEqual([
      { points: [fromRotated({ x: 0.25, y: 0.1 }, 90)] },
    ])
    expect(h.bitmapFor.mock.calls.map(([d, kind]) => [d.edits.rotation, kind])).toEqual([
      [0, 'face'],
      [90, 'face'],
    ])
  })

  it('a bitmap is made from the descriptor its key came from, even if the image changes before sync', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    const a0 = img('a', FACE)
    s.sync([a0])
    await flush()
    const [call] = h.bitmapFor.mock.calls
    expect(call?.[0]).toBe(a0)
  })

  it('a timeout or engine error sets failed: error for that key only', async () => {
    const h = fakePorts({ cached: ['face'] })
    h.out.faces = (b) => {
      if (b.imageId === 'a') throw Object.assign(new Error('slow'), { name: 'LandmarkTimeout' })
      return []
    }
    h.out.edges = (b) => {
      if (b.imageId === 'b') throw Object.assign(new Error('slow'), { name: 'EdgeTimeout' })
      return []
    }
    const s = start(h.ports)
    const a = img('a', { face: true, edges: { on: true } })
    const b = img('b', { face: true, edges: { on: true } })
    s.sync([a, b])
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'error' })
    expect(status(detectionKey('face', b))).toEqual({ state: 'done', found: 0 })
    expect(status(detectionKey('edges', a))).toEqual({ state: 'done', found: 0 })
    expect(status(detectionKey('edges', b))).toEqual({ state: 'failed', reason: 'error' })
  })

  it('an engine that cannot run here sets failed: unsupported', async () => {
    const h = fakePorts()
    h.out.edges = () => {
      throw new Error('edges:unsupported')
    }
    const s = start(h.ports)
    const a = img('a', EDGES())
    s.sync([a])
    await flush()
    expect(status(detectionKey('edges', a))).toEqual({ state: 'failed', reason: 'unsupported' })
  })

  it('a bitmap that cannot be made, or a model that cannot be prepared, fails that key', async () => {
    const h = fakePorts({ cached: ['face'] })
    h.bitmapFor.mockRejectedValueOnce(new Error('decode'))
    const s = start(h.ports)
    const a = img('a', EDGES())
    s.sync([a])
    await flush()
    expect(status(detectionKey('edges', a))).toEqual({ state: 'failed', reason: 'error' })

    const f = img('f', FACE)
    const g = img('g', FACE)
    h.landmarks.mockImplementationOnce(() => ({
      prepare: () => Promise.reject(new Error('wasm')),
      detectFaces: () => Promise.resolve([]),
      detectPoses: () => Promise.resolve([]),
      dispose: vi.fn(),
    }))
    s.sync([a, f, g])
    await flush()
    expect(status(detectionKey('face', f))).toEqual({ state: 'failed', reason: 'error' })
    expect(status(detectionKey('face', g))).toEqual({ state: 'done', found: 1 })
  })

  it('a failure is not retried by sync, only by retry', async () => {
    const h = fakePorts({ cached: ['face'] })
    let fail = true
    h.out.faces = () => {
      if (fail) throw new Error('boom')
      return []
    }
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.sync([a])
    await flush()
    expect(h.log.filter((l) => l.startsWith('detect'))).toHaveLength(1)
    fail = false
    s.retry('face', a.id)
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 0 })
    s.retry('face', a.id)
    s.retry('pose', a.id)
    s.retry('face', img('zz').id)
    await flush()
    expect(h.log.filter((l) => l.startsWith('detect'))).toHaveLength(2)
  })

  it('a result arriving for a key no image needs any more is dropped', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.sync([])
    h.pending.shift()?.done.resolve([{ points: [{ x: 0, y: 0 }] }])
    await flush()
    expect(useDetections.getState().results.size).toBe(0)
    expect(useDetections.getState().status.size).toBe(0)
  })

  it('a queued job whose key is no longer needed never runs; a bitmap made for it is closed', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const bitmap = deferred<ImageBitmap>()
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', FACE)
    const c = img('c', FACE)
    s.sync([a, b, c])
    await flush()
    h.bitmapFor.mockImplementationOnce(() => bitmap.promise)
    s.sync([a, b])
    h.pending.shift()?.done.resolve([])
    await flush()
    s.sync([a])
    const late = {
      closed: false,
      close() {
        this.closed = true
      },
    }
    bitmap.resolve(late as unknown as ImageBitmap)
    await flush()
    expect(late.closed).toBe(true)
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect face a'])
    expect(status(detectionKey('face', b))).toBeUndefined()
    expect(status(detectionKey('face', c))).toBeUndefined()
  })

  it('a queued key switched off and on again runs once', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    const c = img('c', FACE)
    s.sync([a, c])
    await flush()
    s.sync([a, img('c')])
    s.sync([a, c])
    for (let i = 0; i < 3; i++) {
      h.pending.shift()?.done.resolve([])
      await flush()
    }
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect face a', 'detect face c'])
  })

  it('a key switched back on while its job is in flight is not run twice', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.sync([img('a')])
    s.sync([a])
    expect(status(detectionKey('face', a))).toEqual({ state: 'running' })
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect face a'])
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 0 })
  })

  it('a key switched off while its bitmap is made, then on again, runs again', async () => {
    const h = fakePorts({ cached: ['face'] })
    const bitmap = deferred<ImageBitmap>()
    h.bitmapFor.mockImplementationOnce(() => bitmap.promise)
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.sync([img('a')])
    const late = {
      closed: false,
      close() {
        this.closed = true
      },
    }
    bitmap.resolve(late as unknown as ImageBitmap)
    await flush()
    expect(late.closed).toBe(true)
    expect(status(detectionKey('face', a))).toBeUndefined()
    s.sync([a])
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect face a'])
  })

  it('an image removed and added again while its detection runs keeps that one run', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    s.sync([])
    s.sync([a])
    expect(status(detectionKey('face', a))).toEqual({ state: 'running' })
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 0 })
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual(['detect face a'])
  })

  it('a cache check that fails sets failed: error; retry checks again', async () => {
    const h = fakePorts({ cached: ['face'] })
    h.loader.isCached.mockRejectedValueOnce(new Error('caches blocked'))
    const s = start(h.ports)
    const a = img('a', FACE)
    s.sync([a])
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'error' })
    expect(useDetections.getState().models.face).toBe('unknown')
    s.retry('face', a.id)
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'done', found: 1 })
  })

  it('a job for a removed image runs with a remaining twin', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    const x = img('x', FACE)
    const twin = img('b', FACE, {}, x.contentHash)
    s.sync([a, x, twin])
    await flush()
    s.sync([a, twin])
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.bitmapFor.mock.calls.map(([d]) => d.id)).toEqual(['a', 'b'])
  })
})

describe('one landmarker at a time (M4-R5a)', () => {
  function gatedPrepare(h: ReturnType<typeof fakePorts>) {
    const gates: { model: string; gate: Deferred<undefined> }[] = []
    const make = h.landmarks.getMockImplementation()
    if (!make) throw new Error('no landmark factory')
    h.landmarks.mockImplementation(() => {
      const engine = make()
      const prepare = engine.prepare.bind(engine)
      engine.prepare = (...args) => {
        const gate = deferred<undefined>()
        gates.push({ model: args[0], gate })
        return prepare(...args).then(async () => {
          await gate.promise
        })
      }
      return engine
    })
    return gates
  }

  const live = (h: ReturnType<typeof fakePorts>) =>
    h.landmarkEngines.filter((e) => !e.disposed).map((e) => e.prepared.join(','))

  it('a face job cancelled while its landmarker is prepared, then a pose job: face is closed before pose is created', async () => {
    const h = fakePorts({ cached: ['face', 'pose'], manual: true })
    const gates = gatedPrepare(h)
    const s = start(h.ports)
    const a = img('a', FACE)
    const p = img('p', POSE)
    s.sync([a, p])
    await flush()
    expect(gates.map((g) => g.model)).toEqual(['face'])
    s.sync([img('a'), p])
    gates[0]?.gate.resolve(undefined)
    await flush()
    expect(h.log.filter((l) => l.startsWith('detect'))).toEqual([])
    expect(gates.map((g) => g.model)).toEqual(['face', 'pose'])
    expect(live(h)).toEqual(['pose'])
    gates[1]?.gate.resolve(undefined)
    await flush()
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.log.filter((l) => /^(prepare|dispose|detect)/.test(l))).toEqual([
      'prepare face',
      'dispose face',
      'prepare pose',
      'detect pose p',
      'dispose pose',
    ])
    expect(h.stats().maxLiveLandmarkEngines).toBe(1)
    expect(status(detectionKey('face', a))).toBeUndefined()
  })

  it('every job prepares the loaded landmarker again with the same bytes, so the engine can restart its worker after a timeout', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    s.sync([img('a', FACE), img('b', FACE), img('c', FACE)])
    await flush()
    expect(h.landmarks).toHaveBeenCalledTimes(1)
    expect(h.loader.loadAiAsset).toHaveBeenCalledTimes(3)
    expect(h.prepareCalls).toHaveLength(3)
    const [first] = h.prepareCalls
    for (const call of h.prepareCalls) {
      expect(call[0]).toBe('face')
      expect(call[1].loader).toBe(first?.[1].loader)
      expect(call[1].wasm).toBe(first?.[1].wasm)
      expect(call[2]).toBe(first?.[2])
    }
  })

  it('the landmarker is closed and its bytes dropped when the landmark queue drains; the next job reads them again', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', FACE)
    s.sync([a, b])
    await flush()
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.landmarkEngines.map((e) => e.disposed)).toEqual([false])
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.landmarkEngines.map((e) => e.disposed)).toEqual([true])
    expect(h.loader.loadAiAsset).toHaveBeenCalledTimes(3)

    const c = img('c', FACE)
    s.sync([a, b, c])
    await flush()
    expect(h.loader.loadAiAsset).toHaveBeenCalledTimes(6)
    expect(h.landmarkEngines.map((e) => e.disposed)).toEqual([true, false])
    const [first, , , again] = h.prepareCalls
    expect(again?.[2]).not.toBe(first?.[2])
    expect(again?.[1].wasm).not.toBe(first?.[1].wasm)
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.landmarkEngines.map((e) => e.disposed)).toEqual([true, true])
    expect(status(detectionKey('face', c))).toEqual({ state: 'done', found: 0 })
  })

  it('the edge engine is closed when the edge queue drains, and the next job starts a new one', async () => {
    const h = fakePorts({ manual: true })
    const s = start(h.ports)
    const a = img('a', EDGES())
    const b = img('b', EDGES())
    s.sync([a, b])
    await flush()
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.edgeEngines.map((e) => e.disposed)).toEqual([false])
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.edgeEngines.map((e) => e.disposed)).toEqual([true])

    s.sync([a, img('b', EDGES(60))])
    await flush()
    expect(h.edgeEngines.map((e) => e.disposed)).toEqual([true, false])
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.edgeEngines.map((e) => e.disposed)).toEqual([true, true])
  })

  it('a landmarker that fails to prepare again is closed, and the next job loads a new one', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    const b = img('b', FACE)
    s.sync([a, b])
    await flush()
    const engine = h.landmarkEngines[0]
    if (!engine) throw new Error('no engine')
    vi.spyOn(engine, 'prepare').mockRejectedValueOnce(new Error('worker restart failed'))
    h.pending.shift()?.done.resolve([{ points: [{ x: 0.25, y: 0.1 }] }])
    await flush()
    expect(status(detectionKey('face', b))).toEqual({ state: 'failed', reason: 'error' })
    expect(engine.disposed).toBe(true)
    const c = img('c', FACE)
    s.sync([a, b, c])
    await flush()
    h.pending.shift()?.done.resolve([{ points: [{ x: 0.25, y: 0.1 }] }])
    await flush()
    expect(status(detectionKey('face', c))).toEqual({ state: 'done', found: 1 })
    expect(h.landmarks).toHaveBeenCalledTimes(2)
    expect(h.stats().maxLiveLandmarkEngines).toBe(1)
  })

  it('a face landmarker that fails to prepare is closed before the pose one is created', async () => {
    const h = fakePorts({ cached: ['face', 'pose'], manual: true })
    const gates = gatedPrepare(h)
    const s = start(h.ports)
    const a = img('a', FACE)
    const p = img('p', POSE)
    s.sync([a, p])
    await flush()
    gates[0]?.gate.reject(new Error('wasm'))
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'error' })
    expect(live(h)).toEqual(['pose'])
    expect(h.landmarkEngines[0]?.disposed).toBe(true)
    expect(h.stats().maxLiveLandmarkEngines).toBe(1)
  })

  it('a face detection that fails mid-flight, then a pose job: face is closed before pose is created', async () => {
    const h = fakePorts({ cached: ['face', 'pose'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    const p = img('p', POSE)
    s.sync([a, p])
    await flush()
    h.pending.shift()?.done.reject(Object.assign(new Error('slow'), { name: 'LandmarkTimeout' }))
    await flush()
    expect(status(detectionKey('face', a))).toEqual({ state: 'failed', reason: 'error' })
    expect(h.log.filter((l) => /^(prepare|dispose)/.test(l))).toEqual([
      'prepare face',
      'dispose face',
      'prepare pose',
    ])
    expect(live(h)).toEqual(['pose'])
    expect(h.stats().maxLiveLandmarkEngines).toBe(1)
  })

  it('a pose download that overlaps a face detection creates no landmarker; pose waits for the face job and replaces it', async () => {
    const h = fakePorts({ cached: ['face'], manual: true })
    const s = start(h.ports)
    const a = img('a', FACE)
    const p = img('p', POSE)
    s.sync([a, p])
    await flush()
    expect(status(detectionKey('pose', p))).toEqual({ state: 'needs-download', bytes: 9_000 })
    s.download('pose')
    await flush()
    expect(useDetections.getState().models.pose).toBe('cached')
    expect(h.landmarks).toHaveBeenCalledTimes(1)
    expect(live(h)).toEqual(['face'])
    expect(status(detectionKey('pose', p))).toEqual({ state: 'running' })
    h.pending.shift()?.done.resolve([])
    await flush()
    h.pending.shift()?.done.resolve([])
    await flush()
    expect(h.log.filter((l) => /^(prepare|dispose|detect)/.test(l))).toEqual([
      'prepare face',
      'detect face a',
      'dispose face',
      'prepare pose',
      'detect pose p',
      'dispose pose',
    ])
    expect(h.stats().maxLiveLandmarkEngines).toBe(1)
  })

  it('dispose while a landmarker is prepared closes it once ready and creates no other', async () => {
    const h = fakePorts({ cached: ['face', 'pose'], manual: true })
    const gates = gatedPrepare(h)
    const s = start(h.ports)
    s.sync([img('a', FACE), img('p', POSE)])
    await flush()
    s.dispose()
    gates[0]?.gate.resolve(undefined)
    await flush()
    expect(live(h)).toEqual([])
    expect(h.landmarks).toHaveBeenCalledTimes(1)
  })
})

describe('memory', () => {
  it('removing an image drops results no remaining image needs', async () => {
    const h = fakePorts({ cached: ['face', 'pose'] })
    const s = start(h.ports)
    const a = img('a', ALL)
    const twin = img('t', ALL, {}, a.contentHash)
    const b = img('b', ALL)
    s.sync([a, twin, b])
    await flush()
    expect(useDetections.getState().results.size).toBe(6)

    s.sync([twin, b])
    expect(useDetections.getState().results.size).toBe(6)
    s.sync([{ ...twin, lines: DEFAULT_LINES }, b])
    expect(useDetections.getState().results.size).toBe(6)
    s.sync([b])
    expect([...useDetections.getState().results.keys()].sort()).toEqual(
      [detectionKey('edges', b), detectionKey('face', b), detectionKey('pose', b)].sort(),
    )
    s.sync([])
    expect(useDetections.getState().results.size).toBe(0)
    expect(useDetections.getState().status.size).toBe(0)
  })

  it('keeps at most 4 edge entries per hash, dropping the least recently used', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const at = (d: number) => img('a', EDGES(d))
    for (const d of [10, 20, 30, 40]) {
      s.sync([at(d)])
      await flush()
    }
    s.sync([at(10)])
    await flush()
    s.sync([at(50)])
    await flush()
    const keys = [...useDetections.getState().results.keys()]
    expect(keys.sort()).toEqual([10, 30, 40, 50].map((d) => detectionKey('edges', at(d))).sort())
    expect(status(detectionKey('edges', at(20)))).toBeUndefined()
    const runs = h.log.filter((l) => l.startsWith('detail')).length
    s.sync([at(30)])
    await flush()
    expect(h.log.filter((l) => l.startsWith('detail')).length).toBe(runs)
  })

  it('never drops an edge result an image prints, even past 4 per hash', async () => {
    const h = fakePorts()
    const s = start(h.ports)
    const twins = [1, 2, 3, 4, 5].map((d) => img(`t${String(d)}`, EDGES(d * 10), {}, 'same'))
    s.sync(twins)
    await flush()
    expect(useDetections.getState().results.size).toBe(5)
    s.sync(twins.slice(0, 2))
    await flush()
    s.sync(twins.slice(0, 2).concat(img('t9', EDGES(90), {}, 'same')))
    await flush()
    expect(useDetections.getState().results.size).toBe(4)
    for (const t of twins.slice(0, 2)) expect(result(detectionKey('edges', t))).toBeDefined()
  })

  it('results hold plain data only, and an image’s results stay under the per-image budget', async () => {
    const h = fakePorts({ cached: ['face', 'pose'] })
    const r = (i: number) => Math.fround(((i * 7919) % 10007) / 10007)
    h.out.faces = () =>
      Array.from({ length: 4 }, (_, f) => ({
        points: Array.from({ length: 478 }, (_, i) => ({ x: r(i + f), y: r(i * 3 + f) })),
      }))
    h.out.poses = () =>
      Array.from({ length: 4 }, (_, p) => ({
        points: Array.from({ length: 33 }, (_, i) => ({ x: r(i + p), y: r(i * 5 + p) })),
        visibility: Array.from({ length: 33 }, (_, i) => r(i)),
      }))
    h.out.edges = () =>
      Array.from({ length: 40 }, (_, l) =>
        Array.from({ length: 100 }, (_, i) => ({ x: (l * 100 + i) / 4001, y: i / 1024 })),
      )
    const s = start(h.ports)
    const a = img('a', ALL, { rotation: 90, crop: { x: 13.3, y: 7.7, w: 700.1, h: 300.9 } })
    s.sync([a])
    await flush()

    const guides = guidesFor(useDetections.getState(), a)
    expect(guides.faces).toHaveLength(4)
    expect(guides.poses).toHaveLength(4)
    expect(guides.edges?.polylines.flat()).toHaveLength(4000)
    expect(structuredClone(guides)).toEqual(guides)
    const plain = (v: unknown): boolean =>
      Array.isArray(v)
        ? Object.getPrototypeOf(v) === Array.prototype && v.every(plain)
        : typeof v === 'object' && v !== null
          ? Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain)
          : typeof v === 'number' && Number.isFinite(v)
    expect(plain(guides)).toBe(true)

    const numbers = JSON.stringify(guides).match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []
    expect(numbers.length * 8).toBeLessThan(200 * 1024)
  })

  it('detections stay in memory only and never reach storage', async () => {
    const touched: string[] = []
    const spyStorage = (name: string) =>
      new Proxy(
        {},
        {
          get: (_, prop) => {
            touched.push(`${name}.${String(prop)}`)
            return () => undefined
          },
        },
      )
    vi.stubGlobal('localStorage', spyStorage('localStorage'))
    vi.stubGlobal('sessionStorage', spyStorage('sessionStorage'))
    vi.stubGlobal('indexedDB', spyStorage('indexedDB'))
    vi.stubGlobal('caches', spyStorage('caches'))
    try {
      const h = fakePorts()
      const s = start(h.ports)
      const a = img('a', ALL)
      s.sync([a])
      await flush()
      s.download('face')
      s.download('pose')
      await flush()
      s.sync([a, img('b', ALL)])
      await flush()
      s.retry('face', a.id)
      s.sync([])
      s.dispose()
      expect(guidesFor(useDetections.getState(), a)).toBeDefined()
    } finally {
      vi.unstubAllGlobals()
    }
    expect(touched).toEqual([])
  })

  it('detection results never change settings, image descriptors, layout or tileRenderKey', async () => {
    const deepFreeze = <T>(v: T): T => {
      if (typeof v === 'object' && v !== null) {
        Object.values(v).forEach(deepFreeze)
        Object.freeze(v)
      }
      return v
    }
    const images = deepFreeze([
      img('a', { ...ALL, thirds: true }, { rotation: 90, crop: { x: 10, y: 10, w: 400, h: 300 } }),
      img('b', ALL, {}, 'ha'),
      img('c', EDGES(80)),
    ])
    const setup = setupWith()
    const layout = layoutOf([
      images.map((i) => placement(i.id, [{ x: 10, y: 10, w: 80, h: 60 }], { key: `${i.id}#0` })),
    ])
    const snapshot = () => ({
      settings: useSettings.getState(),
      items: JSON.stringify(buildLayoutItems(images)),
      linesKeys: images.map((i) => linesKey(i.lines)),
      tileKeys: buildPageModels(layout, setup, images).flatMap((p) =>
        p.tiles.map((t) => tileRenderKey(t)),
      ),
    })
    const before = snapshot()
    const settingsChanges = vi.fn()
    const unsubscribe = useSettings.subscribe(settingsChanges)

    const h = fakePorts()
    const s = start(h.ports)
    s.sync(images)
    await flush()
    s.download('face')
    s.download('pose')
    await flush()
    unsubscribe()

    const [first] = images
    expect(first && guidesFor(useDetections.getState(), first).faces).toHaveLength(1)
    expect(settingsChanges).not.toHaveBeenCalled()
    const after = snapshot()
    expect(after.settings).toBe(before.settings)
    expect(after).toEqual(before)
  })
})

describe('dispose', () => {
  it('disposes both engines and ignores later calls', async () => {
    const h = fakePorts({ cached: ['face'] })
    const s = start(h.ports)
    const a = img('a', { face: true, edges: { on: true } })
    s.sync([a])
    await flush()
    s.dispose()
    expect(h.landmarkEngines.map((e) => e.disposed)).toEqual([true])
    expect(h.edgeEngines.map((e) => e.disposed)).toEqual([true])
    s.sync([img('b', ALL)])
    s.download('pose')
    s.retry('face', a.id)
    await flush()
    expect(h.landmarks).toHaveBeenCalledTimes(1)
    expect(h.edges).toHaveBeenCalledTimes(1)
    expect(h.bitmapFor).toHaveBeenCalledTimes(2)
  })

  it('aborts a running download and drops a result that arrives afterwards', async () => {
    const h = fakePorts({ manual: true })
    const signals: AbortSignal[] = []
    h.loadImpl.current = (_asset, _progress, signal) => {
      if (signal) signals.push(signal)
      return new Promise(() => undefined)
    }
    const s = start(h.ports)
    const a = img('a', { face: true, edges: { on: true } })
    s.sync([a])
    await flush()
    s.download('face')
    await flush()
    s.dispose()
    h.pending.shift()?.done.resolve([[{ x: 0, y: 0 }]])
    await flush()
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((x) => x.aborted)).toBe(true)
    expect(result(detectionKey('edges', a))).toBeUndefined()
  })

  it('without engines ever started, dispose creates none', () => {
    const h = fakePorts()
    start(h.ports).dispose()
    expect(h.landmarks).not.toHaveBeenCalled()
    expect(h.edges).not.toHaveBeenCalled()
  })
})
