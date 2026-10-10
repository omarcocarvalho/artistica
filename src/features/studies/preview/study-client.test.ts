import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { TilePixelPlan } from '../../render/pixels/tile-plan'
import { FakeCanvas } from '../../render/test-support/fake-canvas'
import { RENDERER_RESTARTED, STUDY_TIMEOUT } from './provider'
import {
  createAppStudyProvider,
  createStudyRenderer,
  STUDY_JOB_TIMEOUT_MS,
  type StudyEngine,
} from './study-client'
import { request } from './test-support/fakes'

const plan = {} as TilePixelPlan
const study = { blurPct: 10, values: null }
type TestBitmap = ImageBitmap & { closed: number }
const bmp = (w = 1): TestBitmap => {
  const b = {
    width: w,
    height: 1,
    closed: 0,
    close: () => {
      b.closed++
    },
  }
  return b
}

function engine(overrides: Partial<StudyEngine> = {}): StudyEngine & { renders: number } {
  const e = {
    renders: 0,
    init: vi.fn(() => Promise.resolve()),
    renderStudyTile: vi.fn(() => {
      e.renders++
      return Promise.resolve(bmp(2))
    }),
    ...overrides,
  }
  return e
}

describe('createStudyRenderer', () => {
  it('spawns the worker lazily, on the first render, once', async () => {
    const spawn = vi.fn(() => engine())
    const render = createStudyRenderer(spawn, () => engine())
    expect(spawn).not.toHaveBeenCalled()
    await render(plan, bmp(), study)
    await render(plan, bmp(), study)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('renders on the worker and hands its bitmap back unchanged', async () => {
    const out = bmp(7)
    const calls: unknown[][] = []
    const worker = engine({
      renderStudyTile: (...args) => {
        calls.push(args)
        return Promise.resolve(out)
      },
    })
    const main = engine()
    const clone = bmp()
    await expect(
      createStudyRenderer(
        () => worker,
        () => main,
      )(plan, clone, study),
    ).resolves.toBe(out)
    expect(calls).toEqual([[plan, clone, study]])
    expect(main.renders).toBe(0)
  })

  it('falls back to the main thread when init rejects', async () => {
    const worker = engine({ init: vi.fn(() => Promise.reject(new Error('studies:unsupported'))) })
    const main = engine()
    const fallback = vi.fn(() => main)
    const render = createStudyRenderer(() => worker, fallback)
    await render(plan, bmp(), study)
    await render(plan, bmp(), study)
    expect(worker.renders).toBe(0)
    expect(main.renders).toBe(2)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('terminates a worker whose init rejected', async () => {
    const dispose = vi.fn()
    const worker = engine({ init: vi.fn(() => Promise.reject(new Error('x'))), dispose })
    await createStudyRenderer(
      () => worker,
      () => engine(),
    )(plan, bmp(), study)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('falls back when spawning throws', async () => {
    const main = engine()
    const render = createStudyRenderer(
      () => {
        throw new Error('no Worker')
      },
      () => main,
    )
    await render(plan, bmp(), study)
    expect(main.renders).toBe(1)
  })

  it('falls back when the worker dies mid-job and asks the provider to retry that job', async () => {
    let dead = false
    let workerRenders = 0
    const worker = engine({
      renderStudyTile: () => {
        workerRenders++
        dead = true
        return Promise.reject(new Error('Study worker failed'))
      },
      isDead: () => dead,
    })
    const main = engine()
    const render = createStudyRenderer(
      () => worker,
      () => main,
    )
    const clone = bmp()
    await expect(render(plan, clone, study)).rejects.toMatchObject({ name: RENDERER_RESTARTED })
    expect(clone.closed).toBe(1)
    await render(plan, bmp(), study)
    expect(workerRenders).toBe(1)
    expect(main.renders).toBe(1)
  })

  it('moves to the main thread without failing a job when the worker died between jobs', async () => {
    let dead = false
    const worker = engine({ isDead: () => dead })
    const main = engine()
    const render = createStudyRenderer(
      () => worker,
      () => main,
    )
    await render(plan, bmp(), study)
    dead = true
    await expect(render(plan, bmp(), study)).resolves.toBeDefined()
    expect(worker.renders).toBe(1)
    expect(main.renders).toBe(1)
  })

  it('passes a live engine’s rejection through unchanged and closes the clone', async () => {
    const worker = engine({
      renderStudyTile: vi.fn(() => Promise.reject(new RangeError('bad plan'))),
    })
    const render = createStudyRenderer(
      () => worker,
      () => engine(),
    )
    const clone = bmp()
    await expect(render(plan, clone, study)).rejects.toMatchObject({ name: 'RangeError' })
    expect(clone.closed).toBe(1)
  })

  it('closes the clone when no engine can be made at all', async () => {
    const render = createStudyRenderer(
      () => {
        throw new Error('no Worker')
      },
      () => {
        throw new Error('no canvas')
      },
    )
    const clone = bmp()
    await expect(render(plan, clone, study)).rejects.toThrow('no canvas')
    expect(clone.closed).toBe(1)
  })

  it('dispose terminates the worker; later renders reject and close their clone', async () => {
    const dispose = vi.fn()
    const worker = engine({ dispose })
    const spawn = vi.fn(() => worker)
    const render = createStudyRenderer(spawn, () => engine())
    await render(plan, bmp(), study)
    render.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    const clone = bmp()
    await expect(render(plan, clone, study)).rejects.toThrow()
    expect(clone.closed).toBe(1)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(worker.renders).toBe(1)
  })

  it('dispose before the first render never spawns a worker', async () => {
    const spawn = vi.fn(() => engine())
    const render = createStudyRenderer(spawn, () => engine())
    render.dispose()
    await expect(render(plan, bmp(), study)).rejects.toThrow()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('dispose while the worker is starting terminates it and settles the waiting render', async () => {
    let finishInit: () => void = () => undefined
    const dispose = vi.fn()
    const worker = engine({
      init: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishInit = resolve
          }),
      ),
      dispose,
    })
    const main = engine()
    const render = createStudyRenderer(
      () => worker,
      () => main,
    )
    const clone = bmp()
    const pending = render(plan, clone, study)
    await Promise.resolve()
    render.dispose()
    finishInit()
    await expect(pending).rejects.toThrow()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(clone.closed).toBe(1)
    expect(worker.renders + main.renders).toBe(0)
  })

  it('dispose while the worker is starting makes no fallback when stopping the worker fails its init', async () => {
    let failInit: (e: Error) => void = () => undefined
    const worker = engine({
      init: vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            failInit = reject
          }),
      ),
      dispose: () => {
        failInit(new Error('Study worker stopped'))
      },
    })
    const fallback = vi.fn(() => engine())
    const render = createStudyRenderer(() => worker, fallback)
    const clone = bmp()
    const pending = render(plan, clone, study)
    await Promise.resolve()
    render.dispose()
    await expect(pending).rejects.toThrow()
    expect(fallback).not.toHaveBeenCalled()
    expect(clone.closed).toBe(1)
  })
})

describe('createStudyRenderer: job timeout (M5-R22)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  const never = <T>(): Promise<T> => new Promise<T>(() => undefined)
  const outcome = (job: Promise<unknown>): Promise<unknown> =>
    job.then(
      () => 'resolved',
      (e: unknown) => (e as Error).name,
    )

  interface FakeWorker {
    hang: boolean
    renders: number
    readonly dispose: Mock<() => void>
  }

  /** Workers made in order; worker n never answers its renders while `hang` (initially `hangs(n)`). */
  function workers(hangs: (n: number) => boolean) {
    const made: FakeWorker[] = []
    const spawn = vi.fn((): StudyEngine => {
      const w: FakeWorker = { hang: hangs(made.length), renders: 0, dispose: vi.fn() }
      made.push(w)
      return {
        init: () => Promise.resolve(),
        renderStudyTile: () => {
          w.renders++
          return w.hang ? never<ImageBitmap>() : Promise.resolve(bmp(2))
        },
        dispose: w.dispose,
      }
    })
    return { made, spawn }
  }

  it('a job with no answer after 20 s rejects with name StudyTimeout, terminates the worker, and the next job gets a fresh one', async () => {
    vi.useFakeTimers()
    expect(STUDY_JOB_TIMEOUT_MS).toBe(20_000)
    const { made, spawn } = workers((n) => n === 0)
    const render = createStudyRenderer(spawn, () => engine())
    const clone = bmp()
    const job = outcome(render(plan, clone, study))
    await settle()
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS - 1)
    expect(made[0]?.dispose).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(job).resolves.toBe(STUDY_TIMEOUT)
    expect(made[0]?.dispose).toHaveBeenCalledTimes(1)
    expect(clone.closed).toBeGreaterThanOrEqual(1)

    await expect(render(plan, bmp(), study)).resolves.toBeDefined()
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(made[1]?.renders).toBe(1)
  })

  it('a second timeout in a row moves the preview to the main thread for the session, where jobs are not timed', async () => {
    vi.useFakeTimers()
    const { made, spawn } = workers(() => true)
    let finishMain: (b: ImageBitmap) => void = () => undefined
    const mainRender = vi.fn(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          finishMain = resolve
        }),
    )
    const main = engine({ renderStudyTile: mainRender })
    const fallback = vi.fn(() => main)
    const render = createStudyRenderer(spawn, fallback)
    const first = outcome(render(plan, bmp(), study))
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    await expect(first).resolves.toBe(STUDY_TIMEOUT)
    expect(fallback).not.toHaveBeenCalled()
    const second = outcome(render(plan, bmp(), study))
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    await expect(second).resolves.toBe(STUDY_TIMEOUT)
    expect(made[1]?.dispose).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledTimes(1)

    const third = outcome(render(plan, bmp(), study))
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS * 3)
    finishMain(bmp(2))
    await expect(third).resolves.toBe('resolved')
    expect(mainRender).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('a job that answers between two timeouts resets the count, so the next timeout gets a fresh worker again', async () => {
    vi.useFakeTimers()
    const { made, spawn } = workers((n) => n !== 1)
    const fallback = vi.fn(() => engine())
    const render = createStudyRenderer(spawn, fallback)
    const first = outcome(render(plan, bmp(), study))
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    await expect(first).resolves.toBe(STUDY_TIMEOUT)
    await expect(render(plan, bmp(), study)).resolves.toBeDefined()
    const second = made[1]
    if (second) second.hang = true
    const third = outcome(render(plan, bmp(), study))
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    await expect(third).resolves.toBe(STUDY_TIMEOUT)
    expect(fallback).not.toHaveBeenCalled()
    expect(made[1]?.dispose).toHaveBeenCalledTimes(1)
    void render(plan, bmp(), study).catch(() => undefined)
    await settle()
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(made[2]?.renders).toBe(1)
  })

  it('the timer covers the worker’s start-up, and its late init failure does not switch to the main thread', async () => {
    vi.useFakeTimers()
    let failInit: (e: Error) => void = () => undefined
    const disposeFirst = vi.fn()
    const spawn = vi.fn(() =>
      spawn.mock.calls.length === 1
        ? engine({
            init: vi.fn(
              () =>
                new Promise<void>((_, reject) => {
                  failInit = reject
                }),
            ),
            dispose: disposeFirst,
          })
        : engine(),
    )
    const fallback = vi.fn(() => engine())
    const render = createStudyRenderer(spawn, fallback)
    const clone = bmp()
    const job = outcome(render(plan, clone, study))
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    await expect(job).resolves.toBe(STUDY_TIMEOUT)
    expect(disposeFirst).toHaveBeenCalledTimes(1)
    expect(clone.closed).toBeGreaterThanOrEqual(1)
    failInit(new Error('Study worker stopped'))
    await settle()
    await expect(render(plan, bmp(), study)).resolves.toBeDefined()
    expect(fallback).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('a slow job that answers before the timeout (19.9 s) is never retried', async () => {
    vi.useFakeTimers()
    const out = bmp(9)
    const dispose = vi.fn()
    const worker = engine({
      renderStudyTile: vi.fn(
        () =>
          new Promise<ImageBitmap>((resolve) => {
            setTimeout(() => {
              resolve(out)
            }, 19_900)
          }),
      ),
      dispose,
    })
    const spawn = vi.fn(() => worker)
    const render = createStudyRenderer(spawn, () => engine())
    const job = render(plan, bmp(), study)
    await vi.advanceTimersByTimeAsync(19_900)
    await expect(job).resolves.toBe(out)
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    expect(dispose).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('a timeout after dispose makes no worker and no main-thread engine', async () => {
    vi.useFakeTimers()
    const { spawn } = workers(() => true)
    const fallback = vi.fn(() => engine())
    const render = createStudyRenderer(spawn, fallback)
    const first = outcome(render(plan, bmp(), study))
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    await expect(first).resolves.toBe(STUDY_TIMEOUT)
    const second = outcome(render(plan, bmp(), study))
    await settle()
    render.dispose()
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS)
    await expect(second).resolves.toBe(STUDY_TIMEOUT)
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(fallback).not.toHaveBeenCalled()
  })
})

describe('createAppStudyProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('is a lazy singleton: the first getter wins and no worker starts before a study tile is due', () => {
    const WorkerCtor = vi.fn()
    vi.stubGlobal('Worker', WorkerCtor)
    const first = vi.fn(() => undefined)
    const second = vi.fn(() => undefined)
    const p = createAppStudyProvider(first)
    expect(createAppStudyProvider(second)).toBe(p)
    p.want('page0', [request('a', 'k1')])
    expect(first).toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    expect(WorkerCtor).not.toHaveBeenCalled()
    p.dispose()
  })

  it('starts the worker for the first study tile and terminates it on dispose', async () => {
    const workers: { terminate: ReturnType<typeof vi.fn> }[] = []
    class FakeWorker {
      postMessage = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
      terminate = vi.fn()
      constructor() {
        workers.push(this)
      }
    }
    const clone = bmp()
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve(clone)),
    )
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    const preview = Object.assign(bmp(1000), { height: 667 })
    const source = { bitmap: preview, pxW: 3000, pxH: 2000 }
    const p = createAppStudyProvider(() => source)
    p.want('page0', [request('a', 'k1')])
    await vi.waitFor(() => {
      expect(workers).toHaveLength(1)
    })
    p.dispose()
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(clone.closed).toBe(1)
    })
    expect(preview.closed).toBe(0)
  })

  type WorkerReply = 'error' | 'messageerror' | 'hang' | { value: unknown }
  interface WireMessage {
    readonly id: string
    readonly type: string
    readonly path?: readonly string[]
  }

  /** A Worker that answers Comlink's APPLY calls by method name: a value, or an error event. */
  function stubWorker(reply: (method: string, worker: number) => WorkerReply) {
    const made: FakeWorker[] = []
    class FakeWorker {
      readonly listeners = new Map<string, ((ev: unknown) => void)[]>()
      readonly calls: { method: string; transfers: readonly unknown[] }[] = []
      readonly messages: string[] = []
      readonly terminate = vi.fn()
      constructor() {
        made.push(this)
      }
      addEventListener(type: string, listener: (ev: unknown) => void): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
      }
      readonly removeEventListener = vi.fn()
      postMessage(msg: WireMessage, transfers: readonly unknown[] = []): void {
        this.messages.push(msg.type)
        if (msg.type !== 'APPLY') return
        const method = msg.path?.[0] ?? ''
        this.calls.push({ method, transfers })
        const r = reply(method, made.indexOf(this))
        if (r === 'hang') return
        setTimeout(() => {
          if (typeof r === 'string') this.emit(r, {})
          else this.emit('message', { data: { id: msg.id, type: 'RAW', value: r.value } })
        }, 0)
      }
      emit(type: string, ev: unknown): void {
        for (const l of this.listeners.get(type) ?? []) l(ev)
      }
    }
    vi.stubGlobal('Worker', FakeWorker)
    return made
  }

  /** Main-thread OffscreenCanvas 2D, so the fallback renders in node; its bitmaps are recorded. */
  function stubOffscreen() {
    const outs: TestBitmap[] = []
    class FakeOffscreen extends FakeCanvas {
      transferToImageBitmap(): TestBitmap {
        const out = Object.assign(bmp(this.width), { height: this.height })
        outs.push(out)
        return out
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreen)
    return outs
  }

  function stubPreview() {
    const clones: TestBitmap[] = []
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn((_: unknown, _x: number, _y: number, w: number, h: number) => {
        const clone = Object.assign(bmp(w), { height: h })
        clones.push(clone)
        return Promise.resolve(clone)
      }),
    )
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    const preview = Object.assign(bmp(1000), { height: 667 })
    return { clones, source: { bitmap: preview, pxW: 3000, pxH: 2000 } }
  }

  const SLOT = 'a|blurred|0:0'

  it('transfers the clone to the worker and closes the worker’s result on dispose', async () => {
    const out = bmp(100)
    const workers = stubWorker((method) =>
      method === 'init' ? { value: undefined } : { value: out },
    )
    const { clones, source } = stubPreview()
    const p = createAppStudyProvider(() => source)
    p.want('page0', [request('a', 'k1')])
    await vi.waitFor(() => {
      expect(p.get('k1', SLOT)).toBe(out)
    })
    const render = workers[0]?.calls.find((c) => c.method === 'renderStudyTile')
    expect(render?.transfers).toEqual([clones[0]])
    p.dispose()
    expect(out.closed).toBe(1)
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1)
    expect(workers[0]?.messages.at(-1)).toBe('RELEASE')
    expect(source.bitmap.closed).toBe(0)
  })

  it.each(['error', 'messageerror'] as const)(
    'a worker %s during init: terminated once, the tile renders on the main thread',
    async (event) => {
      const workers = stubWorker((method) => (method === 'init' ? event : { value: bmp() }))
      const outs = stubOffscreen()
      const { clones, source } = stubPreview()
      const p = createAppStudyProvider(() => source)
      p.want('page0', [request('a', 'k1')])
      await vi.waitFor(() => {
        expect(p.get('k1', SLOT)).not.toBeNull()
      })
      expect(p.get('k1', SLOT)).toBe(outs.at(-1))
      expect(workers).toHaveLength(1)
      expect(workers[0]?.terminate).toHaveBeenCalledTimes(1)
      expect(workers[0]?.calls.map((c) => c.method)).toEqual(['init'])
      expect(clones.map((c) => c.closed)).toEqual([1])
      p.dispose()
    },
  )

  it.each(['error', 'messageerror'] as const)(
    'a worker %s mid-job: that tile is re-cropped and rendered on the main thread, later tiles too',
    async (event) => {
      const workers = stubWorker((method) => (method === 'init' ? { value: undefined } : event))
      const outs = stubOffscreen()
      const { clones, source } = stubPreview()
      const p = createAppStudyProvider(() => source)
      p.want('page0', [request('a', 'k1'), request('a', 'k2', { slot: 'a|blurred|0:1' })])
      await vi.waitFor(() => {
        expect(p.get('k2', 'a|blurred|0:1')).not.toBeNull()
      })
      expect(p.get('k1', SLOT)).toBe(outs[0])
      expect(p.get('k2', 'a|blurred|0:1')).toBe(outs[1])
      expect(workers).toHaveLength(1)
      expect(workers[0]?.terminate).toHaveBeenCalledTimes(1)
      expect(workers[0]?.calls.map((c) => c.method)).toEqual(['init', 'renderStudyTile'])
      expect(clones.map((c) => c.closed)).toEqual([1, 1, 1])
      p.dispose()
    },
  )

  it('a stalled worker job: terminated after 20 s, the tile renders on a fresh worker and the queue moves on', async () => {
    vi.useFakeTimers()
    const outs = [bmp(100), bmp(101)]
    const workers = stubWorker((method, n) =>
      method === 'init' ? { value: undefined } : n === 0 ? 'hang' : { value: outs.shift() },
    )
    const { source } = stubPreview()
    const p = createAppStudyProvider(() => source)
    p.want('page0', [request('a', 'k1'), request('a', 'k2', { slot: 'a|blurred|0:1' })])
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS - 1)
    expect(workers).toHaveLength(1)
    expect(p.pending('page0')).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => {
      expect(p.pending('page0')).toBe(0)
    })
    expect(workers).toHaveLength(2)
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1)
    expect(workers[1]?.calls.map((c) => c.method)).toEqual([
      'init',
      'renderStudyTile',
      'renderStudyTile',
    ])
    expect(p.get('k1', SLOT)).not.toBeNull()
    expect(p.get('k2', 'a|blurred|0:1')).not.toBeNull()
    p.dispose()
  })

  it('a job that stalls on two workers in a row renders on the main thread, as do later jobs', async () => {
    vi.useFakeTimers()
    const workers = stubWorker((method) => (method === 'init' ? { value: undefined } : 'hang'))
    const outs = stubOffscreen()
    const { source } = stubPreview()
    const p = createAppStudyProvider(() => source)
    p.want('page0', [request('a', 'k1'), request('a', 'k2', { slot: 'a|blurred|0:1' })])
    await vi.advanceTimersByTimeAsync(STUDY_JOB_TIMEOUT_MS * 2)
    await vi.waitFor(() => {
      expect(p.pending('page0')).toBe(0)
    })
    expect(workers).toHaveLength(2)
    expect(workers.map((w) => w.terminate.mock.calls.length)).toEqual([1, 1])
    expect(p.get('k1', SLOT)).toBe(outs[0])
    expect(p.get('k2', 'a|blurred|0:1')).toBe(outs[1])
    p.dispose()
  })

  it('without main-thread OffscreenCanvas 2D, the fallback renders on DOM canvases', async () => {
    stubWorker((method) => (method === 'init' ? 'error' : { value: bmp() }))
    vi.stubGlobal('OffscreenCanvas', undefined)
    const made: { width: number; height: number }[] = []
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        expect(tag).toBe('canvas')
        let inner = new FakeCanvas(0, 0)
        const canvas = {
          get width() {
            return inner.width
          },
          set width(w: number) {
            inner = new FakeCanvas(w, inner.height)
          },
          get height() {
            return inner.height
          },
          set height(h: number) {
            inner = new FakeCanvas(inner.width, h)
          },
          getContext: (id: string) => inner.getContext(id),
        }
        made.push(canvas)
        return canvas
      },
    })
    const { clones, source } = stubPreview()
    const encoded: TestBitmap[] = []
    const crop = vi.mocked(createImageBitmap)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn((src: unknown, ...box: number[]) => {
        if (box.length > 0)
          return crop(src as ImageBitmap, ...(box as [number, number, number, number]))
        const out = bmp()
        encoded.push(out)
        return Promise.resolve(out)
      }),
    )
    const p = createAppStudyProvider(() => source)
    p.want('page0', [request('a', 'k1')])
    await vi.waitFor(() => {
      expect(p.get('k1', SLOT)).not.toBeNull()
    })
    expect(p.get('k1', SLOT)).toBe(encoded[0])
    expect(made.length).toBeGreaterThan(0)
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
    expect(clones.map((c) => c.closed)).toEqual([1])
    p.dispose()
  })

  it('a stale provider’s second dispose leaves the newer singleton in place', () => {
    const p = createAppStudyProvider(() => undefined)
    p.dispose()
    const q = createAppStudyProvider(() => undefined)
    p.dispose()
    expect(createAppStudyProvider(() => undefined)).toBe(q)
    q.dispose()
  })

  it('after dispose, the next call makes a fresh provider', () => {
    const p = createAppStudyProvider(() => undefined)
    p.dispose()
    const q = createAppStudyProvider(() => undefined)
    expect(q).not.toBe(p)
    q.dispose()
  })
})
