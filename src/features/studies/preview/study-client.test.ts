import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TilePixelPlan } from '../../render/pixels/tile-plan'
import { RENDERER_RESTARTED } from './provider'
import { createAppStudyProvider, createStudyRenderer, type StudyEngine } from './study-client'
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
})

describe('createAppStudyProvider', () => {
  afterEach(() => {
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

  it('after dispose, the next call makes a fresh provider', () => {
    const p = createAppStudyProvider(() => undefined)
    p.dispose()
    const q = createAppStudyProvider(() => undefined)
    expect(q).not.toBe(p)
    q.dispose()
  })
})
