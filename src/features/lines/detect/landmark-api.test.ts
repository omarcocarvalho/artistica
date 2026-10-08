import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_FACES, MAX_POSES } from '../guides/limits'
import { createLandmarkApi, type LandmarkApiEnv } from './landmark-api'
import { bitmap, fakeVision, landmarks, type FakeVision } from './test-support/fake-vision'

const runtime = () => ({
  loader: new TextEncoder().encode('export default function ModuleFactory() {}').buffer,
  wasm: new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]).buffer,
})
const modelBytes = () => new Uint8Array([1, 2, 3, 4, 5]).buffer

let blobs: Map<string, Blob>
let revoked: string[]

beforeEach(() => {
  blobs = new Map()
  revoked = []
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    const url = `blob:https://app.test/${String(++n)}`
    if (blob instanceof Blob) blobs.set(url, blob)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function api(fake: FakeVision, overrides: Partial<LandmarkApiEnv> = {}) {
  return createLandmarkApi({
    loadVision: () => Promise.resolve(fake.module),
    loading: 'fresh-url',
    scope: fake.scope,
    supported: () => true,
    ...overrides,
  })
}

describe('createLandmarkApi', () => {
  it('prepare creates the runtime from blob: URLs of the given bytes and the model from modelAssetBuffer, with delegate CPU and runningMode IMAGE', async () => {
    const fake = fakeVision()
    const rt = runtime()
    const model = modelBytes()
    await api(fake).prepare('face', rt, model)
    expect(fake.created).toHaveLength(1)
    const [c] = fake.created
    expect(c?.fileset.wasmLoaderPath).toMatch(/^blob:/)
    expect(c?.fileset.wasmBinaryPath).toMatch(/^blob:/)
    const loaderBlob = blobs.get(c?.fileset.wasmLoaderPath ?? '')
    const wasmBlob = blobs.get(c?.fileset.wasmBinaryPath ?? '')
    expect(new Uint8Array(await (loaderBlob ?? new Blob()).arrayBuffer())).toEqual(
      new Uint8Array(rt.loader),
    )
    expect(new Uint8Array(await (wasmBlob ?? new Blob()).arrayBuffer())).toEqual(
      new Uint8Array(rt.wasm),
    )
    expect(c?.options.baseOptions.delegate).toBe('CPU')
    expect(c?.options.baseOptions.modelAssetPath).toBeUndefined()
    expect(Array.from(c?.options.baseOptions.modelAssetBuffer ?? [])).toEqual([1, 2, 3, 4, 5])
    expect(c?.options.runningMode).toBe('IMAGE')
  })

  it('the wasm blob has type application/wasm', async () => {
    const fake = fakeVision()
    await api(fake).prepare('pose', runtime(), modelBytes())
    expect(blobs.get(fake.created[0]?.fileset.wasmBinaryPath ?? '')?.type).toBe('application/wasm')
  })

  it('revokes the blob: URLs once the landmarker is created', async () => {
    const fake = fakeVision()
    await api(fake).prepare('face', runtime(), modelBytes())
    expect(revoked.sort()).toEqual([...blobs.keys()].sort())
  })

  it('never detaches or changes the buffers it is given', async () => {
    const fake = fakeVision()
    const rt = runtime()
    const model = modelBytes()
    const a = api(fake)
    await a.prepare('face', rt, model)
    await a.prepare('pose', rt, model)
    expect([rt.loader.byteLength, rt.wasm.byteLength, model.byteLength]).toEqual([42, 8, 5])
    expect(Array.from(new Uint8Array(model))).toEqual([1, 2, 3, 4, 5])
  })

  it('every landmarker creation gets a fresh loader blob: URL (the fake clears ModuleFactory after each create)', async () => {
    const fake = fakeVision()
    const a = api(fake)
    await a.prepare('face', runtime(), modelBytes())
    await a.prepare('pose', runtime(), modelBytes())
    await a.prepare('face', runtime(), modelBytes())
    const loaders = fake.created.map((c) => c.fileset.wasmLoaderPath)
    expect(new Set(loaders).size).toBe(3)
    expect(fake.created.map((c) => c.factory)).toEqual(loaders.map((u) => `factory from ${u}`))
  })

  it('in module-factory loading, imports the loader once, sets ModuleFactory before each create and passes an empty wasmLoaderPath', async () => {
    const fake = fakeVision()
    const factory = { the: 'factory' }
    const importModule = vi.fn(() => Promise.resolve({ default: factory }))
    const a = api(fake, { loading: 'module-factory', importModule })
    await a.prepare('face', runtime(), modelBytes())
    await a.prepare('pose', runtime(), modelBytes())
    await a.prepare('face', runtime(), modelBytes())
    expect(importModule).toHaveBeenCalledTimes(1)
    const loaderUrl = (importModule.mock.calls[0] as unknown as [string])[0]
    expect(loaderUrl).toMatch(/^blob:/)
    expect(blobs.get(loaderUrl)?.type).toBe('text/javascript')
    expect(revoked).toContain(loaderUrl)
    expect(fake.created.map((c) => c.fileset.wasmLoaderPath)).toEqual(['', '', ''])
    expect(fake.created.map((c) => c.factory)).toEqual([factory, factory, factory])
    expect(fake.created.every((c) => c.fileset.wasmBinaryPath.startsWith('blob:'))).toBe(true)
  })

  it('in module-factory loading, a loader without a default export rejects', async () => {
    const fake = fakeVision()
    const a = api(fake, { loading: 'module-factory', importModule: () => Promise.resolve({}) })
    await expect(a.prepare('face', runtime(), modelBytes())).rejects.toThrow(/ModuleFactory/)
    expect(fake.created).toHaveLength(0)
  })

  it('holds one landmarker at a time: preparing pose closes face and drops it before creating pose, and back (M4-R5a)', async () => {
    const fake = fakeVision()
    const a = api(fake)
    await a.prepare('face', runtime(), modelBytes())
    await a.prepare('pose', runtime(), modelBytes())
    await a.prepare('face', runtime(), modelBytes())
    expect(fake.events).toEqual([
      'create face',
      'close face',
      'create pose',
      'close pose',
      'create face',
    ])
    await expect(a.detectPoses(bitmap())).rejects.toThrow('landmarks:not-prepared')
  })

  it('prepare is idempotent per model', async () => {
    const fake = fakeVision()
    const a = api(fake)
    await a.prepare('face', runtime(), modelBytes())
    await a.prepare('face', runtime(), modelBytes())
    expect(fake.events).toEqual(['create face'])
  })

  it('numFaces and numPoses are MAX_FACES and MAX_POSES', async () => {
    expect([MAX_FACES, MAX_POSES]).toEqual([4, 4])
    const fake = fakeVision()
    const a = api(fake)
    await a.prepare('face', runtime(), modelBytes())
    await a.prepare('pose', runtime(), modelBytes())
    expect(fake.created[0]?.options.numFaces).toBe(MAX_FACES)
    expect(fake.created[1]?.options.numPoses).toBe(MAX_POSES)
  })

  it('detectFaces returns at most MAX_FACES faces of 478 points each, normalised, and closes the bitmap', async () => {
    const fake = fakeVision()
    fake.faces = landmarks(MAX_FACES + 1, 478)
    const a = api(fake)
    await a.prepare('face', runtime(), modelBytes())
    const b = bitmap(64, 48)
    const faces = await a.detectFaces(b)
    expect(fake.events).toContain('detect face 64x48')
    expect(faces).toHaveLength(MAX_FACES)
    expect(faces.map((f) => f.points.length)).toEqual([478, 478, 478, 478])
    expect(faces[1]?.points[3]).toEqual({ x: fake.faces[1]?.[3]?.x, y: fake.faces[1]?.[3]?.y })
    expect(Object.keys(faces[0]?.points[0] ?? {})).toEqual(['x', 'y'])
    expect(b.closed).toBe(1)
  })

  it('detectPoses returns at most MAX_POSES poses of 33 points with visibility, and closes the bitmap', async () => {
    const fake = fakeVision()
    fake.poses = landmarks(MAX_POSES + 2, 33, true)
    const first = fake.poses[0]
    if (first?.[0]) first[0] = { x: 0.5, y: 0.5, z: 0 }
    const a = api(fake)
    await a.prepare('pose', runtime(), modelBytes())
    const b = bitmap()
    const poses = await a.detectPoses(b)
    expect(poses).toHaveLength(MAX_POSES)
    expect(poses.map((p) => [p.points.length, p.visibility.length])).toEqual(
      Array.from({ length: MAX_POSES }, () => [33, 33]),
    )
    expect(poses[2]?.visibility[5]).toBe(fake.poses[2]?.[5]?.visibility)
    expect(poses[0]?.visibility[0]).toBe(0)
    expect(b.closed).toBe(1)
  })

  it('landmarks are returned bit for bit as MediaPipe gives them (no rounding, C1-R1)', async () => {
    const fake = fakeVision()
    const a = api(fake)
    await a.prepare('face', runtime(), modelBytes())
    const [face] = await a.detectFaces(bitmap())
    const raw = fake.faces[0] ?? []
    expect(
      face?.points.every((p, i) => Object.is(p.x, raw[i]?.x) && Object.is(p.y, raw[i]?.y)),
    ).toBe(true)
    expect(raw.some((p) => p.x !== Math.round(p.x * 4096) / 4096)).toBe(true)
  })

  it('a detection with no model prepared rejects with "landmarks:not-prepared" and closes the bitmap', async () => {
    const fake = fakeVision()
    const a = api(fake)
    const b = bitmap()
    await expect(a.detectFaces(b)).rejects.toThrow('landmarks:not-prepared')
    expect(b.closed).toBe(1)
    await a.prepare('face', runtime(), modelBytes())
    const c = bitmap()
    await expect(a.detectPoses(c)).rejects.toThrow('landmarks:not-prepared')
    expect(c.closed).toBe(1)
  })

  it('the guard is installed before the package is imported, once', async () => {
    const order: string[] = []
    const fake = fakeVision()
    const a = api(fake, {
      installGuard: () => order.push('guard'),
      loadVision: () => {
        order.push('import')
        return Promise.resolve(fake.module)
      },
    })
    expect(order).toEqual([])
    await a.prepare('face', runtime(), modelBytes())
    await a.prepare('pose', runtime(), modelBytes())
    expect(order).toEqual(['guard', 'import'])
  })

  it('a failed creation leaves nothing loaded and revokes its URLs', async () => {
    const fake = fakeVision()
    fake.failCreate = new Error('bad model')
    const a = api(fake)
    await expect(a.prepare('face', runtime(), modelBytes())).rejects.toThrow('bad model')
    expect(revoked.sort()).toEqual([...blobs.keys()].sort())
    await expect(a.detectFaces(bitmap())).rejects.toThrow('landmarks:not-prepared')
    fake.failCreate = null
    await a.prepare('face', runtime(), modelBytes())
    expect(fake.created).toHaveLength(1)
  })

  it('close closes the landmarker; a creation that finishes after close is closed and rejects', async () => {
    const fake = fakeVision()
    const a = api(fake)
    await a.prepare('face', runtime(), modelBytes())
    a.close()
    expect(fake.created[0]?.closed).toBe(1)
    await expect(a.detectFaces(bitmap())).rejects.toThrow('landmarks:not-prepared')

    let release: () => void = () => undefined
    fake.hold = new Promise((r) => {
      release = () => {
        r()
      }
    })
    const late = a.prepare('pose', runtime(), modelBytes())
    await vi.waitFor(() => {
      expect(fake.events).toContain('create pose')
    })
    a.close()
    release()
    await expect(late).rejects.toThrow()
    expect(fake.created[1]?.closed).toBe(1)
    await expect(a.detectPoses(bitmap())).rejects.toThrow('landmarks:not-prepared')
  })

  it('init rejects with "landmarks:unsupported" when this context has no WebGL', async () => {
    const fake = fakeVision()
    await expect(api(fake, { supported: () => false }).init()).rejects.toThrow(
      'landmarks:unsupported',
    )
    await expect(api(fake, { supported: () => true }).init()).resolves.toBeUndefined()
  })

  it('a request the guard refused fails the call that made it, even when MediaPipe went on', async () => {
    const fake = fakeVision()
    const refusals: string[] = []
    const a = api(fake, { takeRefusals: () => refusals.splice(0) })
    refusals.push('fetch https://example.com/x')
    await expect(a.prepare('face', runtime(), modelBytes())).rejects.toThrow(
      'fetch-guard: refused fetch https://example.com/x',
    )
    await a.prepare('face', runtime(), modelBytes())
    const b = bitmap()
    refusals.push('XMLHttpRequest https://example.com/y')
    await expect(a.detectFaces(b)).rejects.toThrow(
      /refused XMLHttpRequest https:\/\/example.com\/y/,
    )
    expect(b.closed).toBe(1)
    await expect(a.detectFaces(bitmap())).resolves.toHaveLength(1)
  })
})
