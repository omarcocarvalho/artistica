import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calledMethods, loopbackWorkerClass } from '../edges/test-support/loopback-worker'
import { createLandmarkApi, offscreenHasWebGL, type Face, type Pose } from './landmark-api'
import {
  createLandmarkEngine,
  createLandmarkEngineWith,
  createMainThreadBackend,
  LANDMARK_IDLE_MS,
  LANDMARK_TIMEOUT_MS,
  type LandmarkBackend,
} from './landmark-engine'
import { bitmap, fakeVision, type FakeVision } from './test-support/fake-vision'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const runtime = () => ({ loader: new ArrayBuffer(3), wasm: new ArrayBuffer(8) })
const face = (x: number): Face[] => [{ points: [{ x, y: x / 2 }] }]

interface FakeBackend extends LandmarkBackend {
  readonly calls: string[]
  readonly prepared: { model: string; runtime: unknown; bytes: unknown }[]
  readonly detections: { kind: string; bitmap: ImageBitmap; result: Deferred<Face[] | Pose[]> }[]
  disposed: number
  dead: boolean
  autoDetect: boolean
}

function backend(init: () => Promise<void> = () => Promise.resolve()): FakeBackend {
  const b: FakeBackend = {
    calls: [],
    prepared: [],
    detections: [],
    disposed: 0,
    dead: false,
    autoDetect: true,
    init,
    prepare(model, rt, bytes) {
      b.calls.push(`prepare ${model}`)
      b.prepared.push({ model, runtime: rt, bytes })
      return Promise.resolve()
    },
    detectFaces(bm) {
      b.calls.push('detectFaces')
      const result = deferred<Face[] | Pose[]>()
      b.detections.push({ kind: 'face', bitmap: bm, result })
      if (b.autoDetect) result.resolve(face(0.25))
      return result.promise
    },
    detectPoses(bm) {
      b.calls.push('detectPoses')
      const result = deferred<Face[] | Pose[]>()
      b.detections.push({ kind: 'pose', bitmap: bm, result })
      if (b.autoDetect) result.resolve([{ points: [{ x: 0.5, y: 0.5 }], visibility: [1] }])
      return result.promise as Promise<Pose[]>
    },
    isDead: () => b.dead,
    dispose() {
      b.disposed++
      b.dead = true
    },
  }
  return b
}

const unsupported = () => backend(() => Promise.reject(new Error('landmarks:unsupported')))

function engineWith(opts: {
  spawn?: () => FakeBackend
  main?: () => FakeBackend
  pageHasWebGL?: () => boolean
}) {
  const workers: FakeBackend[] = []
  const mains: FakeBackend[] = []
  const spawn = vi.fn(() => {
    const w = (opts.spawn ?? (() => backend()))()
    workers.push(w)
    return w
  })
  const mainThread = vi.fn(() => {
    const m = (opts.main ?? (() => backend()))()
    mains.push(m)
    return m
  })
  const engine = createLandmarkEngineWith({
    spawn,
    mainThread,
    pageHasWebGL: opts.pageHasWebGL ?? (() => true),
  })
  return { engine, spawn, mainThread, workers, mains }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createLandmarkEngineWith: choosing where to run (M4-R5, C1-R1)', () => {
  it('starts nothing before the first call', () => {
    const { spawn, mainThread } = engineWith({})
    expect(spawn).not.toHaveBeenCalled()
    expect(mainThread).not.toHaveBeenCalled()
  })

  it('uses the worker when its OffscreenCanvas gives WebGL', async () => {
    const { engine, workers, mainThread } = engineWith({})
    await engine.prepare('face', runtime(), new ArrayBuffer(5))
    await expect(engine.detectFaces(bitmap())).resolves.toEqual(face(0.25))
    expect(workers[0]?.calls).toEqual(['prepare face', 'detectFaces'])
    expect(mainThread).not.toHaveBeenCalled()
  })

  it('uses the main thread when the worker has no WebGL but a page canvas does; the worker is terminated', async () => {
    const { engine, workers, mains } = engineWith({ spawn: unsupported, pageHasWebGL: () => true })
    await engine.prepare('face', runtime(), new ArrayBuffer(5))
    await engine.detectFaces(bitmap())
    expect(workers[0]?.disposed).toBe(1)
    expect(workers[0]?.calls).toEqual([])
    expect(mains[0]?.calls).toEqual(['prepare face', 'detectFaces'])
  })

  it('falls back to the main thread when the worker cannot start', async () => {
    const { engine, mains, spawn } = engineWith({
      spawn: () => {
        throw new Error('no Worker')
      },
    })
    await engine.prepare('pose', runtime(), new ArrayBuffer(5))
    await engine.detectPoses(bitmap())
    expect(mains[0]?.calls).toEqual(['prepare pose', 'detectPoses'])
    await engine.detectPoses(bitmap())
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('without WebGL anywhere, prepare and every detection fail with "unsupported" and no landmarker is created', async () => {
    const pageHasWebGL = vi.fn(() => false)
    const { engine, workers, mainThread, spawn } = engineWith({ spawn: unsupported, pageHasWebGL })
    await expect(engine.prepare('face', runtime(), new ArrayBuffer(5))).rejects.toThrow(
      /unsupported/,
    )
    const b = bitmap()
    await expect(engine.detectFaces(b)).rejects.toThrow(/unsupported/)
    await expect(engine.detectPoses(bitmap())).rejects.toThrow(/unsupported/)
    expect(b.closed).toBe(1)
    expect(mainThread).not.toHaveBeenCalled()
    expect(workers.flatMap((w) => w.calls)).toEqual([])
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('chooses by WebGL, never by user agent: changing only navigator.userAgent changes nothing', async () => {
    const outcome = async () => {
      const results: string[] = []
      for (const [spawn, page] of [
        [() => backend(), true],
        [unsupported, true],
        [unsupported, false],
      ] as const) {
        const { engine, workers, mains } = engineWith({ spawn, pageHasWebGL: () => page })
        const r = await engine.prepare('face', runtime(), new ArrayBuffer(1)).then(
          () => 'ok',
          (e: unknown) => String(e),
        )
        results.push(`${r} worker:${String(workers[0]?.calls.length)} main:${String(mains.length)}`)
        engine.dispose()
      }
      return results
    }
    const uas = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
    ]
    const seen = []
    for (const userAgent of uas) {
      vi.stubGlobal('navigator', {
        userAgent,
        vendor: userAgent.includes('Safari') ? 'Apple Computer, Inc.' : '',
      })
      seen.push(await outcome())
    }
    expect(seen[0]).toEqual([
      'ok worker:1 main:0',
      'ok worker:0 main:1',
      'Error: landmarks:unsupported worker:0 main:0',
    ])
    expect(seen[1]).toEqual(seen[0])
    expect(seen[2]).toEqual(seen[0])
  })
})

describe('createLandmarkEngineWith: jobs', () => {
  it('runs one job at a time, in order', async () => {
    const worker = backend()
    worker.autoDetect = false
    const { engine } = engineWith({ spawn: () => worker })
    await engine.prepare('face', runtime(), new ArrayBuffer(1))
    const jobs = [
      engine.detectFaces(bitmap(1, 1)),
      engine.detectFaces(bitmap(2, 2)),
      engine.detectFaces(bitmap(3, 3)),
    ]
    await settle()
    expect(worker.detections).toHaveLength(1)
    worker.detections[0]?.result.reject(new Error('boom'))
    await expect(jobs[0]).rejects.toThrow('boom')
    await settle()
    expect(worker.detections).toHaveLength(2)
    worker.detections[1]?.result.resolve(face(0.2))
    await settle()
    expect(worker.detections).toHaveLength(3)
    worker.detections[2]?.result.resolve(face(0.3))
    await expect(jobs[1]).resolves.toEqual(face(0.2))
    await expect(jobs[2]).resolves.toEqual(face(0.3))
  })

  it('prepare is idempotent per model: the bytes go to a live backend once', async () => {
    const { engine, workers } = engineWith({})
    const rt = runtime()
    const bytes = new ArrayBuffer(5)
    await engine.prepare('face', rt, bytes)
    await engine.prepare('face', rt, bytes)
    await engine.detectFaces(bitmap())
    await engine.prepare('face', rt, bytes)
    expect(workers[0]?.calls).toEqual(['prepare face', 'detectFaces'])
    await engine.prepare('pose', rt, bytes)
    expect(workers[0]?.calls).toEqual(['prepare face', 'detectFaces', 'prepare pose'])
    expect(workers).toHaveLength(1)
  })

  it('a detection of the other model than the prepared one rejects with "landmarks:not-prepared"', async () => {
    const { engine } = engineWith({})
    const b = bitmap()
    await expect(engine.detectFaces(b)).rejects.toThrow('landmarks:not-prepared')
    expect(b.closed).toBe(1)
    await engine.prepare('pose', runtime(), new ArrayBuffer(1))
    await expect(engine.detectFaces(bitmap())).rejects.toThrow('landmarks:not-prepared')
  })

  it('terminates the worker 30 s after the queue empties and re-prepares from the given bytes on the next job', async () => {
    vi.useFakeTimers()
    expect(LANDMARK_IDLE_MS).toBe(30_000)
    const { engine, workers, spawn } = engineWith({})
    const rt = runtime()
    const bytes = new ArrayBuffer(5)
    await engine.prepare('pose', rt, bytes)
    await engine.detectPoses(bitmap())
    await vi.advanceTimersByTimeAsync(LANDMARK_IDLE_MS - 1)
    expect(workers[0]?.disposed).toBe(0)
    await engine.detectPoses(bitmap())
    await vi.advanceTimersByTimeAsync(LANDMARK_IDLE_MS - 1)
    expect(workers[0]?.disposed).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(workers[0]?.disposed).toBe(1)

    await expect(engine.detectPoses(bitmap())).resolves.toHaveLength(1)
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(workers[1]?.calls).toEqual(['prepare pose', 'detectPoses'])
    expect(workers[1]?.prepared[0]?.runtime).toEqual(rt)
    expect(workers[1]?.prepared[0]?.bytes).toBe(bytes)
  })

  it('does not release while a job is running, however long the queue was idle before', async () => {
    vi.useFakeTimers()
    const worker = backend()
    const { engine } = engineWith({ spawn: () => worker })
    await engine.prepare('face', runtime(), new ArrayBuffer(1))
    worker.autoDetect = false
    await vi.advanceTimersByTimeAsync(LANDMARK_IDLE_MS - 1000)
    const job = engine.detectFaces(bitmap())
    await vi.advanceTimersByTimeAsync(LANDMARK_TIMEOUT_MS - 1)
    expect(worker.disposed).toBe(0)
    worker.detections[0]?.result.resolve(face(0.1))
    await job
  })

  it('a detection that takes longer than 30 s rejects with "LandmarkTimeout" and the worker is replaced', async () => {
    vi.useFakeTimers()
    expect(LANDMARK_TIMEOUT_MS).toBe(30_000)
    const { engine, workers, spawn } = engineWith({
      spawn: () => {
        const w = backend()
        w.autoDetect = spawn.mock.calls.length > 1
        return w
      },
    })
    const bytes = new ArrayBuffer(1)
    await engine.prepare('face', runtime(), bytes)
    const b = bitmap()
    const outcome = engine.detectFaces(b).then(
      () => 'resolved',
      (e: unknown) => e,
    )
    await vi.advanceTimersByTimeAsync(LANDMARK_TIMEOUT_MS - 1)
    expect(workers[0]?.disposed).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    const error = await outcome
    expect((error as Error).name).toBe('LandmarkTimeout')
    expect(b.closed).toBeGreaterThanOrEqual(1)
    expect(workers[0]?.disposed).toBe(1)

    workers[0]?.detections[0]?.result.resolve(face(0.9))
    await expect(engine.detectFaces(bitmap())).resolves.toEqual(face(0.25))
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(workers[1]?.calls).toEqual(['prepare face', 'detectFaces'])
  })

  it('the timeout counts from the start of a job, not from when it was queued', async () => {
    vi.useFakeTimers()
    const worker = backend()
    worker.autoDetect = false
    const { engine } = engineWith({ spawn: () => worker })
    await engine.prepare('face', runtime(), new ArrayBuffer(1))
    const first = engine.detectFaces(bitmap())
    const second = engine.detectFaces(bitmap()).then(
      () => 'resolved',
      (e: unknown) => (e as Error).name,
    )
    await vi.advanceTimersByTimeAsync(LANDMARK_TIMEOUT_MS - 1000)
    worker.detections[0]?.result.resolve(face(0.1))
    await first
    await settle()
    await vi.advanceTimersByTimeAsync(LANDMARK_TIMEOUT_MS - 1)
    worker.detections[1]?.result.resolve(face(0.2))
    await expect(second).resolves.toBe('resolved')
  })

  it('a worker start or prepare that stalls also times out', async () => {
    vi.useFakeTimers()
    const { engine, workers } = engineWith({
      spawn: () => backend(() => new Promise(() => undefined)),
    })
    const outcome = engine.prepare('face', runtime(), new ArrayBuffer(1)).then(
      () => 'resolved',
      (e: unknown) => (e as Error).name,
    )
    await vi.advanceTimersByTimeAsync(LANDMARK_TIMEOUT_MS)
    await expect(outcome).resolves.toBe('LandmarkTimeout')
    expect(workers[0]?.disposed).toBe(1)
  })

  it('a job whose worker died rejects; the next job starts a new worker and prepares it again', async () => {
    const { engine, workers } = engineWith({})
    await engine.prepare('face', runtime(), new ArrayBuffer(1))
    const w = workers[0]
    if (!w) throw new Error('no worker')
    w.autoDetect = false
    const job = engine.detectFaces(bitmap())
    await settle()
    w.dead = true
    w.detections[0]?.result.reject(new Error('Landmark worker failed'))
    await expect(job).rejects.toThrow('Landmark worker failed')
    await expect(engine.detectFaces(bitmap())).resolves.toEqual(face(0.25))
    expect(workers[1]?.calls).toEqual(['prepare face', 'detectFaces'])
  })

  it('dispose closes the landmarker and terminates the worker before it returns, rejects the jobs and closes their bitmaps', async () => {
    const worker = backend()
    const { engine } = engineWith({ spawn: () => worker })
    await engine.prepare('face', runtime(), new ArrayBuffer(1))
    worker.autoDetect = false
    const b1 = bitmap()
    const b2 = bitmap()
    const running = engine.detectFaces(b1)
    const queued = engine.detectFaces(b2)
    await settle()
    engine.dispose()
    expect(worker.disposed).toBe(1)
    await expect(running).rejects.toThrow(/disposed/)
    await expect(queued).rejects.toThrow(/disposed/)
    expect(b2.closed).toBe(1)
    const b3 = bitmap()
    await expect(engine.detectFaces(b3)).rejects.toThrow(/disposed/)
    expect(b3.closed).toBe(1)
    await expect(engine.prepare('face', runtime(), new ArrayBuffer(1))).rejects.toThrow(/disposed/)
    expect(worker.calls).toEqual(['prepare face', 'detectFaces'])
  })

  it('dispose during the worker start terminates it and never runs the job', async () => {
    const started = deferred<undefined>()
    const { engine, workers } = engineWith({ spawn: () => backend(() => started.promise) })
    const job = engine.prepare('face', runtime(), new ArrayBuffer(1))
    await settle()
    engine.dispose()
    expect(workers[0]?.disposed).toBe(1)
    started.resolve(undefined)
    await expect(job).rejects.toThrow(/disposed/)
    expect(workers[0]?.calls).toEqual([])
  })

  it('leaves no timer behind after dispose', async () => {
    vi.useFakeTimers()
    const { engine } = engineWith({})
    await engine.prepare('face', runtime(), new ArrayBuffer(1))
    engine.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('createMainThreadBackend (the WebKit-on-CI path, C1-R1)', () => {
  it('imports the module loader itself, sets globalThis.ModuleFactory before each createFromOptions and passes an empty wasmLoaderPath', async () => {
    const fake = fakeVision()
    const factory = { loader: 'default export' }
    const importModule = vi.fn(() => Promise.resolve({ default: factory }))
    const { engine } = engineWith({
      spawn: unsupported,
      pageHasWebGL: () => true,
      main: () =>
        createMainThreadBackend({
          loadVision: () => Promise.resolve(fake.module),
          importModule,
          scope: fake.scope,
        }) as FakeBackend,
    })
    await engine.prepare('face', runtime(), new ArrayBuffer(4))
    await engine.detectFaces(bitmap())
    await engine.prepare('pose', runtime(), new ArrayBuffer(4))
    await engine.detectPoses(bitmap())
    await engine.prepare('face', runtime(), new ArrayBuffer(4))
    expect(importModule).toHaveBeenCalledTimes(1)
    expect(fake.created.map((c) => [c.model, c.fileset.wasmLoaderPath, c.factory])).toEqual([
      ['face', '', factory],
      ['pose', '', factory],
      ['face', '', factory],
    ])
    expect(fake.events).toEqual([
      'create face',
      'detect face 64x48',
      'close face',
      'create pose',
      'detect pose 64x48',
      'close pose',
      'create face',
    ])
    engine.dispose()
    expect(fake.created[2]?.closed).toBe(1)
  })

  it('disposed before its code has loaded, it creates no landmarker and later calls reject', async () => {
    const fake = fakeVision()
    const b = createMainThreadBackend({
      loadVision: () => Promise.resolve(fake.module),
      importModule: () => Promise.resolve({ default: 'factory' }),
      scope: fake.scope,
    })
    const prepare = b.prepare('face', runtime(), new ArrayBuffer(1))
    b.dispose()
    await expect(prepare).rejects.toThrow(/disposed/)
    const bm = bitmap()
    await expect(b.detectFaces(bm)).rejects.toThrow(/disposed/)
    expect(bm.closed).toBe(1)
    expect(fake.events).toEqual([])
  })

  it('dispose closes a landmarker whose creation finishes later', async () => {
    const fake = fakeVision()
    const b = createMainThreadBackend({
      loadVision: () => Promise.resolve(fake.module),
      importModule: () => Promise.resolve({ default: 'factory' }),
      scope: fake.scope,
    })
    let release: () => void = () => undefined
    fake.hold = new Promise((r) => {
      release = () => {
        r()
      }
    })
    const prepare = b.prepare('pose', runtime(), new ArrayBuffer(1))
    await vi.waitFor(() => {
      expect(fake.events).toContain('create pose')
    })
    b.dispose()
    release()
    await expect(prepare).rejects.toThrow()
    expect(fake.created[0]?.closed).toBe(1)
  })

  it('the default scope is globalThis', async () => {
    const fake = fakeVision()
    let seen: unknown
    fake.module.FaceLandmarker.createFromOptions = () => {
      seen = (globalThis as { ModuleFactory?: unknown }).ModuleFactory
      return Promise.reject(new Error('stop'))
    }
    const b = createMainThreadBackend({
      loadVision: () => Promise.resolve(fake.module),
      importModule: () => Promise.resolve({ default: 'global factory' }),
    })
    await expect(b.prepare('face', runtime(), new ArrayBuffer(1))).rejects.toThrow('stop')
    expect(seen).toBe('global factory')
    delete (globalThis as { ModuleFactory?: unknown }).ModuleFactory
  })
})

describe('createLandmarkEngine (the module worker, through Comlink)', () => {
  let fake: FakeVision
  beforeEach(() => {
    fake = fakeVision()
    let n = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      () => `blob:https://app.test/${String(++n)}`,
    )
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  function stubWorker(supported = true) {
    const { Loopback, made } = loopbackWorkerClass(() =>
      createLandmarkApi({
        loadVision: () => Promise.resolve(fake.module),
        loading: 'fresh-url',
        scope: fake.scope,
        supported: () => supported,
      }),
    )
    vi.stubGlobal('Worker', Loopback)
    return made
  }

  it('starts no worker before the first call', () => {
    const made = stubWorker()
    createLandmarkEngine({ pageHasWebGL: () => true })
    expect(made).toHaveLength(0)
  })

  it('landmarks are returned bit for bit as MediaPipe gives them (no rounding, C1-R1)', async () => {
    stubWorker()
    const engine = createLandmarkEngine({ pageHasWebGL: () => true })
    await engine.prepare('face', runtime(), new ArrayBuffer(4))
    const [first] = await engine.detectFaces(bitmap())
    const raw = fake.faces[0] ?? []
    expect(first?.points).toHaveLength(478)
    expect(
      first?.points.every((p, i) => Object.is(p.x, raw[i]?.x) && Object.is(p.y, raw[i]?.y)),
    ).toBe(true)
    await engine.prepare('pose', runtime(), new ArrayBuffer(4))
    const [pose] = await engine.detectPoses(bitmap())
    const rawPose = fake.poses[0] ?? []
    expect(pose?.visibility).toEqual(rawPose.map((p) => p.visibility))
    expect(pose?.points).toEqual(rawPose.map((p) => ({ x: p.x, y: p.y })))
    engine.dispose()
  })

  it('never transfers the runtime or model buffers, and transfers the bitmap', async () => {
    const made = stubWorker()
    const engine = createLandmarkEngine({ pageHasWebGL: () => true })
    const rt = runtime()
    const bytes = new ArrayBuffer(4)
    await engine.prepare('face', rt, bytes)
    const b = bitmap()
    await engine.detectFaces(b)
    const w = made[0]
    expect(w && calledMethods(w)).toEqual(['init', 'prepare', 'detectFaces'])
    const sent = w?.toWorker.filter((m) => (m.data as { type?: string }).type === 'APPLY') ?? []
    expect(sent[1]?.transfer).toEqual([])
    expect(sent[2]?.transfer).toEqual([b])
    expect([rt.loader.byteLength, rt.wasm.byteLength, bytes.byteLength]).toEqual([3, 8, 4])
    engine.dispose()
    expect(w?.terminated).toBe(1)
  })

  it('a worker without WebGL is terminated and the page takes over when it has WebGL', async () => {
    const made = stubWorker(false)
    const engine = createLandmarkEngine({
      pageHasWebGL: () => true,
      main: () =>
        createMainThreadBackend({
          loadVision: () => Promise.resolve(fake.module),
          importModule: () => Promise.resolve({ default: 'factory' }),
          scope: fake.scope,
        }),
    })
    await engine.prepare('face', runtime(), new ArrayBuffer(4))
    expect(made[0]?.terminated).toBe(1)
    expect(fake.created.map((c) => c.fileset.wasmLoaderPath)).toEqual([''])
    engine.dispose()
  })

  it.each(['error', 'messageerror'] as const)(
    'a worker "%s" event rejects the job in flight and terminates the worker',
    async (event) => {
      const made = stubWorker()
      const engine = createLandmarkEngine({ pageHasWebGL: () => true })
      await engine.prepare('face', runtime(), new ArrayBuffer(4))
      fake.hold = new Promise(() => undefined)
      const job = engine.prepare('pose', runtime(), new ArrayBuffer(4))
      await vi.waitFor(() => {
        expect(fake.events).toContain('create pose')
      })
      made[0]?.emit(event)
      await expect(job).rejects.toThrow(/Landmark worker/)
      expect(made[0]?.terminated).toBe(1)
      engine.dispose()
    },
  )
})

describe('offscreenHasWebGL', () => {
  it.each([
    ['webgl2', ['webgl2'], true],
    ['webgl only', ['webgl'], true],
    ['neither', [], false],
  ] as const)('%s', (_, contexts, expected) => {
    const lost = vi.fn()
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext(id: string) {
          return (contexts as readonly string[]).includes(id)
            ? { getExtension: () => ({ loseContext: lost }) }
            : null
        }
      },
    )
    expect(offscreenHasWebGL()).toBe(expected)
    expect(lost).toHaveBeenCalledTimes(expected ? 1 : 0)
  })

  it('false without OffscreenCanvas, or when getContext throws', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(offscreenHasWebGL()).toBe(false)
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext(): never {
          throw new Error('blocked')
        }
      },
    )
    expect(offscreenHasWebGL()).toBe(false)
  })
})
