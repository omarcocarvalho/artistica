import { act, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { tileRenderKey } from '../../features/render/pixels/tile-plan'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectImageDescriptors, useImages } from '../../features/images'
import { buildLayoutItems, computeLayout } from '../../features/layout'
import { layoutFromManual } from '../../features/layout/manual'
import { nudge } from '../../features/layout/manual-ops'
import { NO_GUIDES } from '../../features/lines/guides/types'
import { buildPageModels } from '../../features/render/page-model/build-page-models'
import { detectionKey, INITIAL_DETECTIONS, useDetections } from '../../features/lines'
import { useSettings } from '../../features/settings'
import { initI18n } from '../../shared/i18n'
import { DEFAULT_EDITS, type ImageId } from '../../shared/model/image'
import { DEFAULT_LINES } from '../../shared/model/lines'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { stubDesktop } from '../test-utils'

type LayoutAsync = typeof import('../../features/layout').layoutAsync

const layoutAsync = vi.hoisted(() => vi.fn<LayoutAsync>())
vi.mock('../../features/layout', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, layoutAsync }
})
vi.mock('../../features/render', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, PagePreview: () => <p>page</p>, GuidesLegend: () => null }
})

import { useArrange } from '../arrange-store'
import { usePages } from '../pages-store'
import { PreviewSlot } from '../slots/PreviewSlot'
import { useNotices } from '../state/useNotices'
import { PipelineEffect } from './PipelineEffect'

const ERROR_TEXT = 'The layout could not be computed. Change a setting or reload the page.'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  stubDesktop(true)
  localStorage.clear()
  useSettings.getState().reset()
  useNotices.getState().clear()
  usePages.setState({ status: 'idle', layout: null, empty: false, pages: [] })
  useImages.setState({
    images: [
      {
        id: 'a' as ImageId,
        name: 'anna.jpg',
        contentHash: 'h-a',
        pxW: 400,
        pxH: 300,
        originalPxW: 400,
        originalPxH: 300,
        edits: DEFAULT_EDITS,
        study: DEFAULT_STUDY,
        lines: DEFAULT_LINES,
        preview: {} as ImageBitmap,
        source: new Blob(),
        thumbUrl: 'blob:a',
      },
    ],
  })
})
afterEach(() => {
  layoutAsync.mockReset()
  useImages.setState({ images: [] })
  vi.unstubAllGlobals()
})

describe('PipelineEffect + PreviewSlot on a layout failure', () => {
  it('keeps the error visible after the toast is dismissed and hides it once a layout succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    layoutAsync.mockRejectedValue(new Error('worker crashed'))
    render(
      <>
        <PipelineEffect />
        <PreviewSlot />
      </>,
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(ERROR_TEXT)
    })
    act(() => {
      useNotices.getState().clear()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_TEXT)

    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    act(() => {
      useSettings.getState().setPageSetup({ paper: 'A3' })
    })
    await waitFor(() => {
      expect(screen.getByText('page')).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(ERROR_TEXT)).not.toBeInTheDocument()
  })
})

describe('PipelineEffect layout memo (M2-R15)', () => {
  it('keeps one pipeline across changes: a version toggle runs the layout, a blur change reuses it', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(layoutAsync).toHaveBeenCalledTimes(1)
    act(() => {
      useImages.getState().updateStudy('a' as ImageId, { versions: ['original', 'blurred'] })
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles.map((t) => t.version)).toEqual([
        'original',
        'blurred',
      ])
    })
    expect(layoutAsync).toHaveBeenCalledTimes(2)
    act(() => {
      useImages.getState().updateStudy('a' as ImageId, { blurPct: 12 })
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles[1]?.study?.blurPct).toBe(12)
    })
    expect(layoutAsync).toHaveBeenCalledTimes(2)
  })
})

describe('PipelineEffect with a line change (M3-R5)', () => {
  it('skips the layout worker and keeps every tile render key: only the page model’s lines change', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    act(() => {
      useImages
        .getState()
        .updateStudy('a' as ImageId, { versions: ['original', 'blurred', 'values'] })
    })
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles).toHaveLength(3)
    })
    expect(layoutAsync).toHaveBeenCalledTimes(1)
    const before = usePages.getState().pages[0]
    const keys = before?.tiles.map((t) => tileRenderKey(t))
    expect(before?.lines).toEqual([])
    act(() => {
      useImages.getState().updateLines('a' as ImageId, {
        thirds: true,
        spiral: { on: true },
        style: { colour: '#1f3fbf', widthMm: 1, opacityPct: 50 },
      })
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.lines).toHaveLength(3)
    })
    const after = usePages.getState().pages[0]
    expect(layoutAsync).toHaveBeenCalledTimes(1)
    expect(after?.tiles.map((t) => tileRenderKey(t))).toEqual(keys)
    expect(after?.lines.map((l) => l.types)).toEqual([
      ['thirds', 'spiral'],
      ['thirds', 'spiral'],
      ['thirds', 'spiral'],
    ])
  })
})

describe('PipelineEffect lifetime', () => {
  it('under StrictMode runs one layout and fills the pages', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    render(
      <StrictMode>
        <PipelineEffect />
      </StrictMode>,
    )
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(layoutAsync).toHaveBeenCalledTimes(1)
  })

  it('unmounted before the debounce ends, it runs no layout', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    const { unmount } = render(<PipelineEffect />)
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(layoutAsync).not.toHaveBeenCalled()
    expect(usePages.getState().pages).toEqual([])
  })
})

describe('PipelineEffect with guides (M4)', () => {
  const edgesOn = () => {
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { edges: { on: true } })
    })
  }
  const keyOfA = () => {
    const img = selectImageDescriptors(useImages.getState())[0]
    if (!img) throw new Error('no image')
    return detectionKey('edges', img)
  }
  afterEach(() => {
    useDetections.setState(INITIAL_DETECTIONS, true)
  })

  it('a detection result reschedules the pipeline with guidesFor: the page model gains the guide, the layout is reused', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    edgesOn()
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(usePages.getState().pages[0]?.lines).toEqual([])
    act(() => {
      useDetections.setState({
        results: new Map([
          [
            keyOfA(),
            {
              polylines: [
                [
                  { x: 0.1, y: 0.1 },
                  { x: 0.9, y: 0.9 },
                ],
              ],
            },
          ],
        ]),
      })
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.lines.map((l) => l.types)).toEqual([['edges']])
    })
    expect(layoutAsync).toHaveBeenCalledTimes(1)
  })

  it('a detection result marks the pages as updating in the same store update, so Export never sees the result before the page model has it', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    edgesOn()
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(usePages.getState().status).toBe('idle')
    const key = keyOfA()
    useDetections.setState({
      results: new Map([[key, { polylines: [] }]]),
      status: new Map([[key, { state: 'done', found: 0 }]]),
    })
    expect(usePages.getState().status).toBe('computing')
    await waitFor(() => {
      expect(usePages.getState().status).toBe('idle')
    })
  })

  it('a status change alone (download progress) does not reschedule the pipeline', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    edgesOn()
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    const pages = usePages.getState().pages
    act(() => {
      useDetections.setState({ status: new Map([[keyOfA(), { state: 'running' }]]) })
    })
    expect(usePages.getState().status).toBe('idle')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(usePages.getState().pages).toBe(pages)
  })
})

describe('PipelineEffect with a manual layout (M5-R8, M5-R14)', () => {
  const real = () => {
    layoutAsync.mockImplementation((setup, items, manual) =>
      Promise.resolve(computeLayout(setup, items, manual)),
    )
  }
  const addB = () => {
    const a = useImages.getState().images[0]
    if (!a) throw new Error('no image')
    useImages.setState({
      images: [a, { ...a, id: 'b' as ImageId, name: 'bea.jpg', contentHash: 'h-b' }],
    })
  }
  const items = () => buildLayoutItems(selectImageDescriptors(useImages.getState()))
  const blockX = (id: string) =>
    useArrange.getState().manual?.blocks.find((b) => b.blockId === id)?.x
  const settle = () => new Promise((resolve) => setTimeout(resolve, 250))

  beforeEach(() => {
    useArrange.setState(useArrange.getInitialState(), true)
  })

  async function arrangeOneMm(): Promise<void> {
    real()
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    act(() => {
      expect(useArrange.getState().apply((m) => nudge(m, 'a#0', 1, 0, items()))).toBeNull()
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles[0]?.trim.x).toBeCloseTo(11, 6)
    })
  }

  it('an edit runs the pipeline at once with the manual layout, and the pages show it', async () => {
    real()
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(layoutAsync).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null)
    act(() => {
      useArrange.getState().apply((m) => nudge(m, 'a#0', 1, 0, items()))
    })
    expect(usePages.getState().status).toBe('computing')
    const manual = useArrange.getState().manual
    await waitFor(() => {
      expect(layoutAsync).toHaveBeenCalledWith(expect.anything(), expect.anything(), manual)
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles[0]?.trim.x).toBeCloseTo(11, 6)
    })
    if (!manual) throw new Error('not arranged')
    const setup = useSettings.getState().pageSetup
    expect(usePages.getState().pages).toEqual(
      buildPageModels(
        layoutFromManual(manual, items(), setup),
        setup,
        selectImageDescriptors(useImages.getState()),
        () => NO_GUIDES,
      ),
    )
  })

  it('adopts a kept or adjusted outcome without an undo step, and settles', async () => {
    await arrangeOneMm()
    const undo = useArrange.getState().undo
    act(() => {
      addB()
    })
    await waitFor(() => {
      expect(useArrange.getState().manual?.blocks.map((b) => b.blockId)).toEqual(['a#0', 'b#0'])
    })
    expect(useArrange.getState().undo).toBe(undo)
    expect(blockX('a#0')).toBeCloseTo(11, 6)
    await settle()
    const calls = layoutAsync.mock.calls.length
    await settle()
    expect(layoutAsync).toHaveBeenCalledTimes(calls)
    expect(usePages.getState().status).toBe('idle')
  })

  it('a paper change drops the arrangement with its notice', async () => {
    await arrangeOneMm()
    act(() => {
      useSettings.getState().setPageSetup({ paper: 'A3' })
    })
    await waitFor(() => {
      expect(useArrange.getState().manual).toBeNull()
    })
    expect(useArrange.getState().undo).toEqual([])
    expect(useNotices.getState().notices.map((n) => [n.kind, n.message])).toEqual([
      ['info', 'The paper changed, so the photos were arranged automatically again.'],
    ])
    await waitFor(() => {
      expect(layoutAsync).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null)
    })
  })

  it('margins the arrangement no longer fits drop it with their notice', async () => {
    await arrangeOneMm()
    act(() => {
      useSettings.getState().setPageSetup({ safeAreaMm: 20 })
    })
    await waitFor(() => {
      expect(useArrange.getState().manual).toBeNull()
    })
    expect(useNotices.getState().notices.map((n) => [n.kind, n.message])).toEqual([
      [
        'info',
        'Your arrangement no longer fits the new margins, so the photos were arranged automatically again.',
      ],
    ])
  })

  it('removing the last photo drops the arrangement with no notice', async () => {
    await arrangeOneMm()
    act(() => {
      useImages.setState({ images: [] })
    })
    await waitFor(() => {
      expect(usePages.getState().empty).toBe(true)
    })
    expect(useArrange.getState()).toMatchObject({ manual: null, undo: [] })
    expect(useNotices.getState().notices).toEqual([])
  })

  it('an empty outcome from the engine posts no notice', async () => {
    await arrangeOneMm()
    const manual = useArrange.getState().manual
    layoutAsync.mockImplementation((setup) =>
      Promise.resolve({
        ...computeLayout(setup, []),
        manual: { kind: 'dropped', reason: 'empty' },
      }),
    )
    act(() => {
      useSettings.getState().setPageSetup({ cropMarks: false })
    })
    await waitFor(() => {
      expect(useArrange.getState().manual).toBeNull()
    })
    expect(manual).not.toBeNull()
    expect(useNotices.getState().notices).toEqual([])
  })

  it('a result computed for the previous arrangement never replaces a newer edit', async () => {
    await arrangeOneMm()
    const pending: (() => void)[] = []
    layoutAsync.mockImplementation(
      (setup, items, manual) =>
        new Promise((resolve) => {
          pending.push(() => {
            resolve(computeLayout(setup, items, manual))
          })
        }),
    )
    act(() => {
      addB()
    })
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    pending[0]?.()
    useArrange.getState().apply((m) => nudge(m, 'a#0', 1, 0, items()))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(blockX('a#0')).toBeCloseTo(12, 6)
    await waitFor(() => {
      expect(pending).toHaveLength(2)
    })
    pending[1]?.()
    await waitFor(() => {
      expect(
        usePages.getState().pages[0]?.tiles.find((t) => t.imageId === 'a')?.trim.x,
      ).toBeCloseTo(12, 6)
    })
    expect(blockX('a#0')).toBeCloseTo(12, 6)
  })

  it('undoing every edit goes back to the automatic layout: a paper change then posts no notice', async () => {
    await arrangeOneMm()
    act(() => {
      useArrange.getState().undoLast()
    })
    await waitFor(() => {
      expect(layoutAsync).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null)
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles[0]?.trim.x).toBeCloseTo(10, 6)
    })
    await settle()
    expect(useArrange.getState().manual).toBeNull()
    act(() => {
      useSettings.getState().setPageSetup({ paper: 'A3' })
    })
    await waitFor(() => {
      expect(usePages.getState().layout?.pageSize.w).toBeCloseTo(297, 6)
    })
    await settle()
    expect(useArrange.getState().manual).toBeNull()
    expect(useNotices.getState().notices).toEqual([])
  })

  it('undo and re-run auto layout run the pipeline with the restored state', async () => {
    await arrangeOneMm()
    act(() => {
      useArrange.getState().undoLast()
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles[0]?.trim.x).toBeCloseTo(10, 6)
    })
    act(() => {
      useArrange.getState().rerunAuto()
    })
    await waitFor(() => {
      expect(layoutAsync).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null)
    })
  })
})

describe('PipelineEffect with a manual layout: what does not run it', () => {
  const items = () => buildLayoutItems(selectImageDescriptors(useImages.getState()))

  beforeEach(() => {
    useArrange.setState(useArrange.getInitialState(), true)
    layoutAsync.mockImplementation((setup, items, manual) =>
      Promise.resolve(computeLayout(setup, items, manual)),
    )
  })
  afterEach(() => {
    useDetections.setState(INITIAL_DETECTIONS, true)
  })

  async function arranged(): Promise<void> {
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    act(() => {
      useArrange.getState().apply((m) => nudge(m, 'a#0', 1, 0, items()))
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles[0]?.trim.x).toBeCloseTo(11, 6)
    })
    await waitFor(() => {
      expect(usePages.getState().status).toBe('idle')
    })
  }

  it('selecting a block or switching Arrange mode runs no layout and marks nothing as updating', async () => {
    await arranged()
    const calls = layoutAsync.mock.calls.length
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select('a#0')
    })
    expect(usePages.getState().status).toBe('idle')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(layoutAsync).toHaveBeenCalledTimes(calls)
  })

  it('a detection result keeps the arrangement on the pages (the layout memo is reused)', async () => {
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { edges: { on: true } })
    })
    await arranged()
    const calls = layoutAsync.mock.calls.length
    const img = selectImageDescriptors(useImages.getState())[0]
    if (!img) throw new Error('no image')
    act(() => {
      useDetections.setState({
        results: new Map([
          [
            detectionKey('edges', img),
            {
              polylines: [
                [
                  { x: 0.1, y: 0.1 },
                  { x: 0.9, y: 0.9 },
                ],
              ],
            },
          ],
        ]),
      })
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.lines.map((l) => l.types)).toEqual([['edges']])
    })
    expect(layoutAsync).toHaveBeenCalledTimes(calls)
    expect(usePages.getState().pages[0]?.tiles[0]?.trim.x).toBeCloseTo(11, 6)
    expect(useArrange.getState().manual).not.toBeNull()
  })

  it('a dropped outcome while nothing is arranged posts no notice', async () => {
    layoutAsync.mockImplementation((setup, items) =>
      Promise.resolve({
        ...computeLayout(setup, items),
        manual: { kind: 'dropped', reason: 'paper' },
      }),
    )
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(useArrange.getState().manual).toBeNull()
    expect(useNotices.getState().notices).toEqual([])
  })
})
