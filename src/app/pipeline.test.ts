import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAGE_SETUP } from '../shared/model/page-setup'
import type { ImageDescriptor, ImageId } from '../shared/model/image'
import { DEFAULT_EDITS } from '../shared/model/image'
import { DEFAULT_STUDY } from '../shared/model/study'
import { createPipeline, type PipelineDeps, type PipelineSink } from './pipeline'
import type { LayoutItemInput, LayoutResult } from '../features/layout'
import { buildLayoutItems } from '../features/layout/build-items'
import { computeLayout } from '../features/layout/compute-layout'
import type { PageModel } from '../features/render'
import { buildPageModels } from '../features/render/page-model/build-page-models'
import type { StudyVersion } from '../shared/model/study'

const img = (id: string): ImageDescriptor => ({
  id: id as ImageId,
  contentHash: `hash-${id}`,
  pxW: 800,
  pxH: 600,
  edits: DEFAULT_EDITS,
  study: DEFAULT_STUDY,
})
const layoutOf = (n: number): LayoutResult => ({
  orientation: 'portrait',
  pageSize: { w: 210, h: 297 },
  pages: [],
  suggestedPerPage: n,
})

function setup() {
  const sink: PipelineSink = {
    computing: vi.fn(),
    cleared: vi.fn(),
    done: vi.fn(),
    failed: vi.fn(),
  }
  const resolvers: ((l: LayoutResult) => void)[] = []
  const rejecters: ((e: unknown) => void)[] = []
  const deps: PipelineDeps = {
    delayMs: 80,
    buildItems: vi.fn(() => []),
    layout: vi.fn(
      () =>
        new Promise<LayoutResult>((resolve, reject) => {
          resolvers.push(resolve)
          rejecters.push(reject)
        }),
    ),
    buildModels: vi.fn(() => [] as PageModel[]),
  }
  return { sink, deps, resolvers, rejecters, pipeline: createPipeline(deps, sink) }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createPipeline', () => {
  it('debounces: three rapid schedules run the layout once, with the last input', async () => {
    const { pipeline, deps, sink, resolvers } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a'), img('b')])
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a'), img('b'), img('c')])
    expect(sink.computing).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(80)
    expect(deps.layout).toHaveBeenCalledTimes(1)
    expect(deps.buildItems).toHaveBeenCalledWith([img('a'), img('b'), img('c')])
    resolvers[0]?.(layoutOf(3))
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.done).toHaveBeenCalledTimes(1)
  })

  it('latest wins even when an older call resolves later', async () => {
    const { pipeline, sink, resolvers } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('b')])
    await vi.advanceTimersByTimeAsync(80)
    expect(resolvers).toHaveLength(2)
    resolvers[1]?.(layoutOf(2))
    await vi.advanceTimersByTimeAsync(0)
    resolvers[0]?.(layoutOf(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.done).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sink.done).mock.calls[0]?.[0].suggestedPerPage).toBe(2)
  })

  it('ignores AbortError from a superseded layout call', async () => {
    const { pipeline, sink, rejecters } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('b')])
    rejecters[0]?.(new DOMException('superseded', 'AbortError'))
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.failed).not.toHaveBeenCalled()
  })

  it('reports a real failure for the current call', async () => {
    const { pipeline, sink, rejecters } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    rejecters[0]?.(new Error('worker crashed'))
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.failed).toHaveBeenCalledTimes(1)
  })

  it('with no images it still asks for the empty layout (the per-page suggestion shows on an empty workspace) and reports no pages', async () => {
    const { pipeline, deps, sink, resolvers } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [])
    await vi.advanceTimersByTimeAsync(80)
    expect(deps.layout).toHaveBeenCalledWith(DEFAULT_PAGE_SETUP, [])
    resolvers[0]?.(layoutOf(8))
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.buildModels).not.toHaveBeenCalled()
    expect(sink.done).not.toHaveBeenCalled()
    expect(sink.cleared).toHaveBeenCalledWith(layoutOf(8))
  })

  it('with no images a failing layout clears quietly instead of raising an error', async () => {
    const { pipeline, sink, rejecters } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [])
    await vi.advanceTimersByTimeAsync(80)
    rejecters[0]?.(new Error('worker crashed'))
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.failed).not.toHaveBeenCalled()
    expect(sink.cleared).toHaveBeenCalledWith(null)
  })

  it('a RangeError that lost its class over the worker is still a real failure', async () => {
    const { pipeline, sink, rejecters } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    const e = new Error('too many')
    e.name = 'RangeError'
    rejecters[0]?.(e)
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.failed).toHaveBeenCalledWith(e)
  })

  it('dispose cancels a pending run and silences an in-flight one', async () => {
    const { pipeline, deps, sink, resolvers } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    pipeline.dispose()
    await vi.advanceTimersByTimeAsync(200)
    expect(deps.layout).not.toHaveBeenCalled()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    pipeline.dispose()
    resolvers[0]?.(layoutOf(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.done).not.toHaveBeenCalled()
  })

  it('reuses the layout when only study parameters change (M2-R15)', async () => {
    const { deps, sink, resolvers, pipeline } = setup()
    deps.buildItems = vi.fn(tileItems)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [withStudy(img('a'), 40)])
    await vi.advanceTimersByTimeAsync(80)
    resolvers[0]?.(layoutOf(4))
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.done).toHaveBeenCalledTimes(1)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [withStudy(img('a'), 41)])
    await vi.advanceTimersByTimeAsync(80)
    expect(sink.done).toHaveBeenCalledTimes(2)
    expect(deps.layout).toHaveBeenCalledTimes(1)
    expect(deps.buildModels).toHaveBeenCalledTimes(2)
    expect(vi.mocked(deps.buildModels).mock.calls[1]?.[0]).toBe(
      vi.mocked(deps.buildModels).mock.calls[0]?.[0],
    )
    expect(vi.mocked(deps.buildModels).mock.calls[1]?.[2][0]?.study.blurPct).toBe(41)
  })

  it('runs the layout again when the number of versions changes', async () => {
    const { deps, resolvers, pipeline } = setup()
    deps.buildItems = vi.fn(tileItems)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    resolvers[0]?.(layoutOf(4))
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.buildModels).toHaveBeenCalledTimes(1)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [withStudy(img('a'), 40)])
    await vi.advanceTimersByTimeAsync(80)
    expect(deps.layout).toHaveBeenCalledTimes(2)
  })

  it('runs the layout again when the page setup changes', async () => {
    const { deps, resolvers, pipeline } = setup()
    deps.buildItems = vi.fn(tileItems)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    resolvers[0]?.(layoutOf(4))
    await vi.advanceTimersByTimeAsync(0)
    pipeline.schedule({ ...DEFAULT_PAGE_SETUP, paper: 'A3' }, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    expect(deps.layout).toHaveBeenCalledTimes(2)
  })

  it('does not memoise a failed layout', async () => {
    const { deps, rejecters, pipeline } = setup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    rejecters[0]?.(new Error('boom'))
    await vi.advanceTimersByTimeAsync(0)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [img('a')])
    await vi.advanceTimersByTimeAsync(80)
    expect(deps.layout).toHaveBeenCalledTimes(2)
  })
})

const withStudy = (d: ImageDescriptor, blurPct: number): ImageDescriptor => ({
  ...d,
  study: { ...d.study, versions: ['original', 'blurred'], blurPct },
})
const tileItems = (images: readonly ImageDescriptor[]): LayoutItemInput[] =>
  images.map((i) => ({ key: i.id, tiles: i.study.versions.length }) as unknown as LayoutItemInput)

describe('createPipeline with the real layout and page models', () => {
  const versioned = (versions: readonly StudyVersion[]): ImageDescriptor => ({
    ...img('a'),
    study: { ...DEFAULT_STUDY, versions },
  })
  function realSetup() {
    const pending: { run: () => void }[] = []
    const sink: PipelineSink = {
      computing: vi.fn(),
      cleared: vi.fn(),
      done: vi.fn(),
      failed: vi.fn(),
    }
    const deps: PipelineDeps = {
      delayMs: 80,
      buildItems: buildLayoutItems,
      layout: vi.fn<PipelineDeps['layout']>(
        (s, items) =>
          new Promise<LayoutResult>((resolve) => {
            pending.push({
              run: () => {
                resolve(computeLayout(s, items))
              },
            })
          }),
      ),
      buildModels: buildPageModels,
    }
    return { sink, deps, pending, pipeline: createPipeline(deps, sink) }
  }
  const lastTiles = (sink: PipelineSink) =>
    vi
      .mocked(sink.done)
      .mock.calls.at(-1)?.[1]
      .flatMap((p) => p.tiles.map((t) => t.version))

  it('a version toggled while a layout is in flight ends with one tile per selected version', async () => {
    const { sink, pending, pipeline } = realSetup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original'])])
    await vi.advanceTimersByTimeAsync(80)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original', 'blurred', 'values'])])
    pending[0]?.run()
    await vi.advanceTimersByTimeAsync(80)
    pending[1]?.run()
    await vi.advanceTimersByTimeAsync(0)
    expect(sink.done).toHaveBeenCalledTimes(1)
    expect(lastTiles(sink)).toEqual(['original', 'blurred', 'values'])
  })

  it('toggling back to the memoised versions while a new layout is in flight reuses the memo and ignores the late result', async () => {
    const { deps, sink, pending, pipeline } = realSetup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original'])])
    await vi.advanceTimersByTimeAsync(80)
    pending[0]?.run()
    await vi.advanceTimersByTimeAsync(0)
    expect(lastTiles(sink)).toEqual(['original'])
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original', 'blurred'])])
    await vi.advanceTimersByTimeAsync(80)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original'])])
    await vi.advanceTimersByTimeAsync(80)
    pending[1]?.run()
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.layout).toHaveBeenCalledTimes(2)
    expect(sink.done).toHaveBeenCalledTimes(2)
    expect(lastTiles(sink)).toEqual(['original'])
  })

  it('a superseded layout that resolves late does not replace the memo', async () => {
    const { deps, sink, pending, pipeline } = realSetup()
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original'])])
    await vi.advanceTimersByTimeAsync(80)
    pending[0]?.run()
    await vi.advanceTimersByTimeAsync(0)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original', 'blurred'])])
    await vi.advanceTimersByTimeAsync(80)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original'])])
    await vi.advanceTimersByTimeAsync(80)
    pending[1]?.run()
    await vi.advanceTimersByTimeAsync(0)
    pipeline.schedule(DEFAULT_PAGE_SETUP, [versioned(['original'])])
    await vi.advanceTimersByTimeAsync(80)
    expect(deps.layout).toHaveBeenCalledTimes(2)
    expect(sink.done).toHaveBeenCalledTimes(3)
    expect(lastTiles(sink)).toEqual(['original'])
  })
})
