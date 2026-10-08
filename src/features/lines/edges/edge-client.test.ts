import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEdgeEngine,
  createEdgeEngineWith,
  EDGE_TIMEOUT_MS,
  type EdgeBackend,
  type Outline,
} from './edge-client'
import { edgeOutline } from './outline'
import { bitmapOf, fakePixelCanvas, type TestBitmap } from './test-support/fakes'
import { calledMethods, loopbackWorkerClass } from './test-support/loopback-worker'
import { stillLife } from './test-support/synthetic'
import { createEdgeWorkerApi, type EdgeCanvasEnv, type PackedOutline } from './worker-api'

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

const bmp = (w = 4, h = 3): TestBitmap => bitmapOf(new Uint8ClampedArray(w * h * 4), w, h)
const line = (x: number): Outline => [[{ x, y: x }]]

interface FakeBackend extends EdgeBackend {
  readonly jobs: { bitmap: ImageBitmap; detailPct: number; result: Deferred<Outline> }[]
  disposed: number
  dead: boolean
}

function backend(init: () => Promise<void> = () => Promise.resolve()): FakeBackend {
  const b: FakeBackend = {
    jobs: [],
    disposed: 0,
    dead: false,
    init,
    outline(bitmap, detailPct) {
      const result = deferred<Outline>()
      b.jobs.push({ bitmap, detailPct, result })
      return result.promise
    },
    isDead: () => b.dead,
    dispose() {
      b.disposed++
      b.dead = true
    },
  }
  return b
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('createEdgeEngineWith', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawns the worker lazily, on the first job, once, and returns its result', async () => {
    const worker = backend()
    const spawn = vi.fn(() => worker)
    const fallback = vi.fn(() => backend())
    const engine = createEdgeEngineWith(spawn, fallback)
    expect(spawn).not.toHaveBeenCalled()
    const b = bmp()
    const job = engine.outline(b, 42)
    await settle()
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(worker.jobs.map((j) => [j.bitmap, j.detailPct])).toEqual([[b, 42]])
    worker.jobs[0]?.result.resolve(line(0.5))
    await expect(job).resolves.toEqual(line(0.5))
    const second = engine.outline(bmp(), 50)
    await settle()
    worker.jobs[1]?.result.resolve(line(0.25))
    await expect(second).resolves.toEqual(line(0.25))
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })

  it.each([
    [
      'the worker cannot start',
      () => {
        throw new Error('no Worker')
      },
    ],
    ['init rejects', () => backend(() => Promise.reject(new Error('edges:unsupported')))],
  ])('falls back to the main thread when %s, once', async (_, spawn) => {
    const main = backend()
    const fallback = vi.fn(() => main)
    const engine = createEdgeEngineWith(spawn, fallback)
    const first = engine.outline(bmp(), 50)
    await settle()
    main.jobs[0]?.result.resolve(line(0.1))
    await expect(first).resolves.toEqual(line(0.1))
    const second = engine.outline(bmp(), 60)
    await settle()
    main.jobs[1]?.result.resolve(line(0.2))
    await expect(second).resolves.toEqual(line(0.2))
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('terminates a worker whose init rejected', async () => {
    const worker = backend(() => Promise.reject(new Error('edges:unsupported')))
    const main = backend()
    const engine = createEdgeEngineWith(
      () => worker,
      () => main,
    )
    void engine.outline(bmp(), 50)
    await settle()
    expect(worker.disposed).toBe(1)
    expect(main.jobs).toHaveLength(1)
  })

  it('runs one job at a time, in order', async () => {
    const worker = backend()
    const engine = createEdgeEngineWith(
      () => worker,
      () => backend(),
    )
    const jobs = [10, 20, 30].map((d) => engine.outline(bmp(), d))
    await settle()
    expect(worker.jobs.map((j) => j.detailPct)).toEqual([10])
    worker.jobs[0]?.result.reject(new Error('boom'))
    await expect(jobs[0]).rejects.toThrow('boom')
    await settle()
    expect(worker.jobs.map((j) => j.detailPct)).toEqual([10, 20])
    worker.jobs[1]?.result.resolve(line(0.2))
    await settle()
    expect(worker.jobs.map((j) => j.detailPct)).toEqual([10, 20, 30])
    worker.jobs[2]?.result.resolve(line(0.3))
    await expect(jobs[1]).resolves.toEqual(line(0.2))
    await expect(jobs[2]).resolves.toEqual(line(0.3))
  })

  it('a job that takes longer than 10 s rejects with name "EdgeTimeout" and the worker is replaced', async () => {
    vi.useFakeTimers()
    expect(EDGE_TIMEOUT_MS).toBe(10_000)
    const workers: FakeBackend[] = []
    const spawn = vi.fn(() => {
      const w = backend()
      workers.push(w)
      return w
    })
    const engine = createEdgeEngineWith(spawn, () => backend())
    const b = bmp()
    const job = engine.outline(b, 50)
    const outcome = job.then(
      () => 'resolved',
      (e: unknown) => e,
    )
    await settle()
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS - 1)
    expect(workers[0]?.disposed).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('EdgeTimeout')
    expect(b.closed).toBeGreaterThanOrEqual(1)
    expect(workers[0]?.disposed).toBe(1)

    const next = engine.outline(bmp(), 50)
    await settle()
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(workers[1]?.jobs).toHaveLength(1)
    workers[1]?.jobs[0]?.result.resolve(line(0.7))
    await expect(next).resolves.toEqual(line(0.7))
  })

  it('the timeout counts from the start of the job, not from when it was queued', async () => {
    vi.useFakeTimers()
    const worker = backend()
    const engine = createEdgeEngineWith(
      () => worker,
      () => backend(),
    )
    const first = engine.outline(bmp(), 1)
    const second = engine.outline(bmp(), 2)
    const outcome = second.then(
      () => 'resolved',
      (e: unknown) => (e as Error).name,
    )
    await settle()
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS - 1000)
    worker.jobs[0]?.result.resolve(line(0.1))
    await expect(first).resolves.toEqual(line(0.1))
    await settle()
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS - 1)
    worker.jobs[1]?.result.resolve(line(0.2))
    await expect(outcome).resolves.toBe('resolved')
  })

  it('a worker that never finishes starting times out too, and a late init failure does not switch to the main thread', async () => {
    vi.useFakeTimers()
    const hung = deferred<undefined>()
    const workers: FakeBackend[] = []
    const fallback = vi.fn(() => backend())
    const engine = createEdgeEngineWith(() => {
      const w = backend(workers.length === 0 ? () => hung.promise : undefined)
      workers.push(w)
      return w
    }, fallback)
    const job = engine.outline(bmp(), 50).catch((e: unknown) => (e as Error).name)
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS)
    await expect(job).resolves.toBe('EdgeTimeout')
    expect(workers[0]?.disposed).toBe(1)
    hung.reject(new Error('Edge worker stopped'))
    await settle()
    const next = engine.outline(bmp(), 50)
    await settle()
    expect(fallback).not.toHaveBeenCalled()
    expect(workers[1]?.jobs).toHaveLength(1)
    workers[1]?.jobs[0]?.result.resolve(line(0.3))
    await expect(next).resolves.toEqual(line(0.3))
  })

  it.each([
    ['a worker', false],
    ['the main thread', true],
  ])('on %s, a late reply to a timed-out job never settles the next job', async (_, mainOnly) => {
    vi.useFakeTimers()
    const backends: FakeBackend[] = []
    const make = (): FakeBackend => {
      const b = backend()
      backends.push(b)
      return b
    }
    const engine = createEdgeEngineWith(
      mainOnly
        ? () => {
            throw new Error('no Worker')
          }
        : make,
      make,
    )
    const first = engine.outline(bmp(), 1).catch((e: unknown) => (e as Error).name)
    await settle()
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS)
    await expect(first).resolves.toBe('EdgeTimeout')
    let settled: unknown = 'pending'
    const second = engine.outline(bmp(), 2)
    second.then(
      (v) => (settled = v),
      (e: unknown) => (settled = e),
    )
    await settle()
    const late = backends[0]?.jobs[0]
    const next = backends.at(-1)?.jobs.at(-1)
    expect(late?.detailPct).toBe(1)
    expect(next?.detailPct).toBe(2)
    late?.result.resolve(line(0.1))
    await settle()
    expect(settled).toBe('pending')
    next?.result.resolve(line(0.2))
    await expect(second).resolves.toEqual(line(0.2))
  })

  it('a worker that finishes starting after its job timed out does not replace the new worker', async () => {
    vi.useFakeTimers()
    const hung = deferred<undefined>()
    const workers: FakeBackend[] = []
    const fallback = vi.fn(() => backend())
    const engine = createEdgeEngineWith(() => {
      const w = backend(workers.length === 0 ? () => hung.promise : undefined)
      workers.push(w)
      return w
    }, fallback)
    const first = engine.outline(bmp(), 1).catch((e: unknown) => (e as Error).name)
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS)
    await expect(first).resolves.toBe('EdgeTimeout')
    const second = engine.outline(bmp(), 2)
    await settle()
    hung.resolve(undefined)
    await settle()
    expect(fallback).not.toHaveBeenCalled()
    expect(workers[1]?.disposed).toBe(0)
    expect(workers[1]?.jobs.map((j) => j.detailPct)).toEqual([2])
    workers[1]?.jobs[0]?.result.resolve(line(0.2))
    await expect(second).resolves.toEqual(line(0.2))
  })

  it('a finished job leaves no timer behind', async () => {
    vi.useFakeTimers()
    const worker = backend()
    const engine = createEdgeEngineWith(
      () => worker,
      () => backend(),
    )
    const job = engine.outline(bmp(), 50)
    await settle()
    expect(vi.getTimerCount()).toBe(1)
    worker.jobs[0]?.result.resolve(line(0.1))
    await job
    expect(vi.getTimerCount()).toBe(0)
  })

  it('dispose terminates the worker, rejects the job in flight and the queued ones, and closes their bitmaps', async () => {
    const worker = backend()
    const engine = createEdgeEngineWith(
      () => worker,
      () => backend(),
    )
    const running = bmp()
    const queued = bmp()
    const a = engine.outline(running, 1).catch((e: unknown) => e)
    const b = engine.outline(queued, 2).catch((e: unknown) => e)
    await settle()
    engine.dispose()
    expect(worker.disposed).toBe(1)
    worker.jobs[0]?.result.reject(new Error('Edge worker stopped'))
    expect(await a).toBeInstanceOf(Error)
    expect(await b).toBeInstanceOf(Error)
    expect(running.closed).toBeGreaterThanOrEqual(1)
    expect(queued.closed).toBe(1)
    expect(worker.jobs.map((j) => j.detailPct)).toEqual([1])
  })

  it('dispose terminates the worker; later calls reject and close their bitmap without starting a worker', async () => {
    const spawn = vi.fn(() => backend())
    const engine = createEdgeEngineWith(spawn, () => backend())
    engine.dispose()
    const late = bmp()
    await expect(engine.outline(late, 50)).rejects.toThrow('disposed')
    expect(late.closed).toBe(1)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('a job whose worker finishes starting after dispose never runs, and its bitmap is closed', async () => {
    const starting = deferred<undefined>()
    const worker = backend(() => starting.promise)
    const engine = createEdgeEngineWith(
      () => worker,
      () => backend(),
    )
    const b = bmp()
    const job = engine.outline(b, 50)
    await settle()
    engine.dispose()
    starting.resolve(undefined)
    await expect(job).rejects.toThrow('disposed')
    expect(worker.jobs).toHaveLength(0)
    expect(b.closed).toBe(1)
  })

  it('closes the bitmap when neither the worker nor the main thread can start', async () => {
    const engine = createEdgeEngineWith(
      () => {
        throw new Error('no Worker')
      },
      () => {
        throw new Error('no fallback')
      },
    )
    const b = bmp()
    await expect(engine.outline(b, 50)).rejects.toThrow('no fallback')
    expect(b.closed).toBe(1)
  })

  it('a main-thread result that lands after dispose is dropped', async () => {
    const main = backend()
    const engine = createEdgeEngineWith(
      () => {
        throw new Error('no Worker')
      },
      () => main,
    )
    const job = engine.outline(bmp(), 50)
    await settle()
    engine.dispose()
    main.jobs[0]?.result.resolve(line(0.4))
    await expect(job).rejects.toThrow('disposed')
  })

  it('a job whose worker died rejects; later jobs run on the main thread', async () => {
    const worker = backend()
    const main = backend()
    const engine = createEdgeEngineWith(
      () => worker,
      () => main,
    )
    const b = bmp()
    const job = engine.outline(b, 50)
    await settle()
    worker.dead = true
    worker.jobs[0]?.result.reject(new Error('Edge worker failed'))
    await expect(job).rejects.toThrow('Edge worker failed')
    expect(b.closed).toBeGreaterThanOrEqual(1)
    const next = engine.outline(bmp(), 50)
    await settle()
    expect(worker.disposed).toBe(1)
    main.jobs[0]?.result.resolve(line(0.9))
    await expect(next).resolves.toEqual(line(0.9))
  })
})

const scene = stillLife()

function canvasEnv(): EdgeCanvasEnv {
  return { supported: () => true, createCanvas: (w, h) => fakePixelCanvas(w, h) }
}

function stubWorker(api: () => object = () => createEdgeWorkerApi(canvasEnv(), loadCore)) {
  const { Loopback, made } = loopbackWorkerClass(api)
  vi.stubGlobal('Worker', Loopback)
  return made
}

const loadCore = () => Promise.resolve(edgeOutline)

function stubMainThreadOffscreen(): void {
  vi.stubGlobal('OffscreenCanvas', function OffscreenCanvas(w: number, h: number) {
    return fakePixelCanvas(w, h)
  })
}

function failingWorker(): void {
  vi.stubGlobal('Worker', function Worker() {
    throw new Error('no Worker')
  })
}

describe('createEdgeEngine', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('starts no worker before the first job', () => {
    const made = stubWorker()
    const engine = createEdgeEngine()
    expect(made).toHaveLength(0)
    engine.dispose()
  })

  it('the worker and main-thread engines give identical results, equal to edgeOutline', async () => {
    stubWorker()
    const viaWorker = createEdgeEngine()
    const fromWorker = []
    for (const d of [1, 50, 100]) fromWorker.push(await viaWorker.outline(bmpOfScene(), d))
    viaWorker.dispose()

    failingWorker()
    stubMainThreadOffscreen()
    const viaMain = createEdgeEngine()
    const fromMain = []
    for (const d of [1, 50, 100]) fromMain.push(await viaMain.outline(bmpOfScene(), d))
    viaMain.dispose()

    const expected = [1, 50, 100].map((d) => edgeOutline(scene.rgba, scene.w, scene.h, d))
    expect(expected.every((o) => o.length > 0)).toBe(true)
    expect(fromWorker).toEqual(expected)
    expect(fromMain).toEqual(expected)
  })

  it('transfers the bitmap to the worker and the outline buffers back', async () => {
    const made = stubWorker()
    const engine = createEdgeEngine()
    const b = bmpOfScene()
    const out = await engine.outline(b, 50)
    const w = made[0]
    if (!w) throw new Error('no worker')
    expect(calledMethods(w)).toEqual(['init', 'outline'])
    const outlineCall = w.toWorker.find(
      ({ data }) => (data as { path?: string[] }).path?.[0] === 'outline',
    )
    expect(outlineCall?.transfer).toEqual([b])
    const reply = w.fromWorker.at(-1)
    const packed = (reply?.data as { value: PackedOutline }).value
    expect(reply?.transfer).toEqual([packed.coords.buffer, packed.lengths.buffer])
    expect(packed.coords.buffer.byteLength).toBe(0)
    expect(packed.lengths.buffer.byteLength).toBe(0)
    expect(out).toEqual(edgeOutline(scene.rgba, scene.w, scene.h, 50))
    expect(b.closed).toBe(1)
    engine.dispose()
  })

  it('a worker job that takes longer than 10 s rejects with "EdgeTimeout"; the worker is terminated and a new one starts', async () => {
    vi.useFakeTimers()
    const made = stubWorker(() => ({
      init: () => Promise.resolve(),
      outline: () => new Promise(() => undefined),
    }))
    const engine = createEdgeEngine()
    const job = engine.outline(bmp(), 50).catch((e: unknown) => (e as Error).name)
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS)
    await expect(job).resolves.toBe('EdgeTimeout')
    expect(made[0]?.terminated).toBe(1)
    void engine.outline(bmp(), 50).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(made).toHaveLength(2)
    expect(made[1]?.terminated).toBe(0)
    engine.dispose()
    expect(made[1]?.terminated).toBe(1)
  })

  it.each(['error', 'messageerror'] as const)(
    'a worker %s mid-job rejects that job and terminates the worker; the next runs on the main thread',
    async (event) => {
      const made = stubWorker(() => ({
        init: () => Promise.resolve(),
        outline: () => new Promise(() => undefined),
      }))
      stubMainThreadOffscreen()
      const engine = createEdgeEngine()
      const job = engine.outline(bmp(), 50)
      await vi.waitFor(() => {
        expect(made[0] && calledMethods(made[0])).toEqual(['init', 'outline'])
      })
      made[0]?.emit(event)
      await expect(job).rejects.toThrow()
      expect(made[0]?.terminated).toBe(1)
      await expect(engine.outline(bmpOfScene(), 50)).resolves.toEqual(
        edgeOutline(scene.rgba, scene.w, scene.h, 50),
      )
      expect(made).toHaveLength(1)
      engine.dispose()
    },
  )

  it('a worker that reports "edges:unsupported" is terminated and the main thread takes over', async () => {
    const made = stubWorker(() =>
      createEdgeWorkerApi({ ...canvasEnv(), supported: () => false }, loadCore),
    )
    stubMainThreadOffscreen()
    const engine = createEdgeEngine()
    await expect(engine.outline(bmpOfScene(), 50)).resolves.toEqual(
      edgeOutline(scene.rgba, scene.w, scene.h, 50),
    )
    expect(made[0]?.terminated).toBe(1)
    expect(made[0] && calledMethods(made[0])).toEqual(['init'])
    engine.dispose()
  })

  it('dispose terminates the worker and later calls reject', async () => {
    const made = stubWorker()
    const engine = createEdgeEngine()
    await engine.outline(bmpOfScene(), 50)
    engine.dispose()
    expect(made[0]?.terminated).toBe(1)
    await expect(engine.outline(bmp(), 50)).rejects.toThrow('disposed')
  })

  it('without main-thread OffscreenCanvas 2D, the fallback reads pixels from a DOM canvas', async () => {
    failingWorker()
    vi.stubGlobal('OffscreenCanvas', undefined)
    vi.stubGlobal('document', {
      createElement: () => {
        let inner = fakePixelCanvas(0, 0)
        return {
          get width() {
            return inner.width
          },
          set width(w: number) {
            inner = fakePixelCanvas(w, inner.height)
          },
          get height() {
            return inner.height
          },
          set height(h: number) {
            inner = fakePixelCanvas(inner.width, h)
          },
          getContext: (id: '2d', s?: unknown) => inner.getContext(id, s as never),
        }
      },
    })
    const engine = createEdgeEngine()
    await expect(engine.outline(bmpOfScene(), 50)).resolves.toEqual(
      edgeOutline(scene.rgba, scene.w, scene.h, 50),
    )
    engine.dispose()
  })

  it('rejects with "edges:unsupported" when no canvas can read pixels', async () => {
    failingWorker()
    vi.stubGlobal('OffscreenCanvas', undefined)
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    })
    const engine = createEdgeEngine()
    const b = bmp()
    await expect(engine.outline(b, 50)).rejects.toThrow('edges:unsupported')
    expect(b.closed).toBeGreaterThanOrEqual(1)
    engine.dispose()
  })
})

function bmpOfScene(): TestBitmap {
  return bitmapOf(scene.rgba, scene.w, scene.h)
}
