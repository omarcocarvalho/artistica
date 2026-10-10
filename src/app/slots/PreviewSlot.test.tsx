import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_LINES, type LineSettings } from '../../shared/model/lines'
import type { SheetRegistry } from '../../features/render'
import { stubDesktop } from '../test-utils'

const h = vi.hoisted(() => ({
  select: vi.fn(),
  selectedId: null as string | null,
  studyTiles: [] as unknown[],
  scrollAxes: [] as unknown[],
  onDrawn: [] as ((page: number) => void)[],
  mark: vi.fn(),
  provider: { name: 'app study provider' },
  lines: undefined as LineSettings | undefined,
  arranges: [] as unknown[],
  view: { manual: null as object | null, blocks: [] as { id: string }[] },
  undo: vi.fn(),
  registry: {
    register: () => () => undefined,
    at: () => ({ page: 1, box: {} as DOMRect }),
  },
}))
vi.mock('../arrange-controller', () => ({
  useArrangeView: () => h.view,
  commitOp: vi.fn(() => true),
  pickUpBlock: vi.fn(),
  previewOp: vi.fn(() => ({ ok: false })),
  selectBlock: vi.fn(),
  undoArrange: h.undo,
  rerunAutoLayout: vi.fn(),
  setArrangeMode: (on: boolean) => {
    useArrange.getState().setMode(on)
  },
}))
vi.mock('../perf-marks', () => ({ mark: h.mark }))
vi.mock('../study-provider', () => ({
  appStudyProvider: h.provider,
  getPreviewSource: () => undefined,
}))
vi.mock('../../features/render', () => ({
  PagePreview: (p: {
    label: string
    getName: (id: ImageId) => string
    onSelect: (id: ImageId) => void
    studyTiles?: unknown
    scrollAxis?: unknown
    onDrawn?: (page: number) => void
    arrange?: unknown
  }) => {
    h.arranges.push(p.arrange)
    h.studyTiles.push(p.studyTiles)
    h.scrollAxes.push(p.scrollAxis)
    if (p.onDrawn) h.onDrawn.push(p.onDrawn)
    return (
      <button
        type="button"
        onClick={() => {
          p.onSelect('a' as ImageId)
        }}
      >
        {p.label} / {p.getName('a' as ImageId)}
      </button>
    )
  },
  GuidesToggle: () => null,
  GuidesLegend: () => <p>legend</p>,
  createSheetRegistry: () => h.registry,
}))
vi.mock('../../features/images', () => {
  const state = {
    get images() {
      return [{ id: 'a', name: 'anna.jpg', bitmap: {}, lines: h.lines }]
    },
    get selectedId() {
      return h.selectedId
    },
    select: h.select,
  }
  const useImages = Object.assign((sel: (s: typeof state) => unknown) => sel(state), {
    getState: () => state,
    subscribe: () => () => undefined,
  })
  return { useImages, selectImageDescriptors: () => [] }
})

import { useArrange } from '../arrange-store'
import { useArrangeUi } from '../arrange-ui'
import { usePages } from '../pages-store'
import { useAppUi } from '../state/useAppUi'
import { PreviewSlot, PreviewToolbar, UPDATING_ANNOUNCE_DELAY_MS } from './PreviewSlot'

const layout = (pages: number) =>
  ({
    orientation: 'portrait',
    pageSize: { w: 210, h: 297 },
    pages: Array(pages).fill({ placements: [] }),
    suggestedPerPage: 8,
  }) as never

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  stubDesktop(true)
  h.selectedId = null
  h.select.mockClear()
  h.studyTiles = []
  h.scrollAxes = []
  h.onDrawn = []
  h.mark.mockClear()
  h.lines = undefined
  h.arranges = []
  h.view = { manual: null, blocks: [] }
  h.undo.mockClear()
  useArrange.setState(useArrange.getInitialState(), true)
  useArrangeUi.setState(useArrangeUi.getInitialState(), true)
  useAppUi.setState({ editingId: null })
  usePages.setState({
    status: 'idle',
    layout: layout(1),
    pages: [
      {
        index: 0,
        size: { w: 210, h: 297 },
        safeArea: { x: 5, y: 5, w: 200, h: 287 },
        cropMarks: [],
        lines: [],
        tiles: [{ imageId: 'a', version: 'original', trim: { x: 10, y: 10, w: 100, h: 60 } }],
      },
    ] as never,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PreviewSlot', () => {
  it('passes the full caption as the label and the image name as getName, adds a text alternative, and selects on tile click (D6)', async () => {
    render(<PreviewSlot />)
    expect(
      screen.getByRole('button', { name: /Page 1 of 1 · A4 · portrait \/ anna\.jpg/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Page 1 contents' })).toHaveTextContent(
      'anna.jpg, 100 × 60 mm',
    )
    expect(screen.getByText('legend')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Page 1 of 1/ }))
    expect(h.select).toHaveBeenCalledWith('a')
  })
  it.each([true, false])(
    'marks artistica:draw:end with the page index when a page reports a draw (desktop %s, M5-R27)',
    (desktop) => {
      stubDesktop(desktop)
      render(<PreviewSlot />)
      expect(h.onDrawn).not.toHaveLength(0)
      expect(h.mark).not.toHaveBeenCalled()
      h.onDrawn.at(-1)?.(3)
      expect(h.mark.mock.calls).toEqual([['draw:end', { page: 3 }]])
    },
  )
  it('passes the one app study provider to every page', () => {
    act(() => {
      usePages.setState({
        layout: layout(2),
        pages: [0, 1].map((index) => ({
          index,
          size: { w: 210, h: 297 },
          safeArea: { x: 5, y: 5, w: 200, h: 287 },
          cropMarks: [],
          lines: [],
          tiles: [],
        })) as never,
      })
    })
    render(<PreviewSlot />)
    expect(h.studyTiles).toHaveLength(2)
    for (const p of h.studyTiles) expect(p).toBe(h.provider)
  })
  it.each([
    [true, 'y'],
    [false, 'x'],
  ] as const)(
    'tells every page the scroll axis (desktop %s: %s), so it can tell when it is near the view (M5-R21)',
    (desktop, axis) => {
      stubDesktop(desktop)
      render(<PreviewSlot />)
      expect(h.scrollAxes).not.toHaveLength(0)
      for (const a of h.scrollAxes) expect(a).toBe(axis)
    },
  )
  it('names the version of study tiles in the text alternative', () => {
    act(() => {
      usePages.setState({
        pages: [
          {
            index: 0,
            size: { w: 210, h: 297 },
            safeArea: { x: 5, y: 5, w: 200, h: 287 },
            cropMarks: [],
            lines: [],
            tiles: [
              { imageId: 'a', version: 'original', trim: { x: 10, y: 10, w: 60, h: 40 } },
              { imageId: 'a', version: 'blurValues', trim: { x: 76, y: 10, w: 60, h: 40 } },
            ],
          },
        ] as never,
      })
    })
    render(<PreviewSlot />)
    const items = within(screen.getByRole('list', { name: 'Page 1 contents' })).getAllByRole(
      'listitem',
    )
    expect(items.map((i) => i.textContent)).toEqual([
      'anna.jpg, 60 × 40 mm',
      'anna.jpg, Blur + Values, 60 × 40 mm',
    ])
  })
  it('names the line types a tile prints, as a list in the current language (M3-R20)', () => {
    act(() => {
      usePages.setState({
        pages: [
          {
            index: 0,
            size: { w: 210, h: 297 },
            safeArea: { x: 5, y: 5, w: 200, h: 287 },
            cropMarks: [],
            lines: [
              { tileIndex: 0, types: ['thirds', 'golden', 'centre'] },
              { tileIndex: 1, types: ['spiral'] },
            ],
            tiles: [
              { imageId: 'a', version: 'original', trim: { x: 10, y: 10, w: 60, h: 40 } },
              { imageId: 'a', version: 'blurred', trim: { x: 76, y: 10, w: 60, h: 40 } },
              { imageId: 'a', version: 'values', trim: { x: 10, y: 56, w: 60, h: 40 } },
            ],
          },
        ] as never,
      })
    })
    render(<PreviewSlot />)
    const items = within(screen.getByRole('list', { name: 'Page 1 contents' })).getAllByRole(
      'listitem',
    )
    expect(items.map((i) => i.textContent)).toEqual([
      'anna.jpg, 60 × 40 mm, lines: Rule of thirds, Golden ratio, and Centre lines',
      'anna.jpg, Blurred, 60 × 40 mm, lines: Golden spiral',
      'anna.jpg, Values, 60 × 40 mm',
    ])
  })
  it('names the switched-on guides after the composition lines, found or not (M4-R22)', () => {
    h.lines = { ...DEFAULT_LINES, thirds: true, face: true }
    act(() => {
      usePages.setState({
        pages: [
          {
            index: 0,
            size: { w: 210, h: 297 },
            safeArea: { x: 5, y: 5, w: 200, h: 287 },
            cropMarks: [],
            lines: [{ tileIndex: 0, types: ['thirds'] }],
            tiles: [{ imageId: 'a', version: 'original', trim: { x: 10, y: 10, w: 60, h: 40 } }],
          },
        ] as never,
      })
    })
    render(<PreviewSlot />)
    expect(screen.getByRole('list', { name: 'Page 1 contents' })).toHaveTextContent(
      'anna.jpg, 60 × 40 mm, lines: Rule of thirds and Face construction',
    )
  })
  it("holds each page's text list inside its page, so the phone carousel clips it", () => {
    render(<PreviewSlot />)
    const list = screen.getByRole('list', { name: /Page 1/ })
    expect(list).toHaveClass('sr-only')
    expect(list.parentElement).toHaveClass('relative')
  })
  it('renders no figure or caption of its own (PagePreview owns them)', () => {
    const { container } = render(<PreviewSlot />)
    expect(container.querySelector('figure')).toBeNull()
    expect(container.querySelector('figcaption')).toBeNull()
  })
  it('marks the region busy while computing', () => {
    act(() => {
      usePages.setState({ status: 'computing' })
    })
    const { container } = render(<PreviewSlot />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })
  it('says the page setup leaves no room when there are images but no pages (CR-B2)', () => {
    act(() => {
      usePages.setState({ layout: layout(0), pages: [] })
    })
    render(<PreviewSlot />)
    expect(
      screen.getByText(/This page setup leaves no room for images\./).closest('[role="status"]'),
    ).not.toBeNull()
  })
  it('keeps the status live region mounted and empty while idle', () => {
    render(<PreviewSlot />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
  it('shows a persistent error callout while the layout has failed', () => {
    act(() => {
      usePages.setState({ status: 'error', layout: null, pages: [] })
    })
    render(<PreviewSlot />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The layout could not be computed. Change a setting or reload the page.',
    )
    act(() => {
      usePages.setState({ status: 'idle', layout: layout(1) })
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('PreviewSlot status region (M5-R24)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  const setStatus = (status: 'idle' | 'computing' | 'error') => {
    act(() => {
      usePages.setState({ status })
    })
  }
  const wait = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('waits 500 ms', () => {
    expect(UPDATING_ANNOUNCE_DELAY_MS).toBe(500)
  })

  it('says nothing for a layout that ends sooner, though the region is busy at once', () => {
    const { container } = render(<PreviewSlot />)
    const region = screen.getByRole('status')
    setStatus('computing')
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(region).toBeEmptyDOMElement()
    wait(UPDATING_ANNOUNCE_DELAY_MS - 1)
    expect(region).toBeEmptyDOMElement()
    setStatus('idle')
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(region).toBeEmptyDOMElement()
    wait(5000)
    expect(region).toBeEmptyDOMElement()
  })

  it('says "Updating layout…" once the layout has computed for the delay, then "Layout updated." in the same region', () => {
    render(<PreviewSlot />)
    const region = screen.getByRole('status')
    setStatus('computing')
    wait(UPDATING_ANNOUNCE_DELAY_MS)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent(/^Updating layout…$/)
    setStatus('idle')
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent(/^Layout updated\.$/)
  })

  it('clears "Layout updated." when the next layout starts, and stays silent if that one is fast', () => {
    render(<PreviewSlot />)
    const region = screen.getByRole('status')
    setStatus('computing')
    wait(UPDATING_ANNOUNCE_DELAY_MS)
    setStatus('idle')
    setStatus('computing')
    expect(region).toBeEmptyDOMElement()
    wait(100)
    setStatus('idle')
    expect(region).toBeEmptyDOMElement()
  })

  it('times each layout from its own start', () => {
    render(<PreviewSlot />)
    const region = screen.getByRole('status')
    setStatus('computing')
    wait(400)
    setStatus('idle')
    setStatus('computing')
    wait(400)
    expect(region).toBeEmptyDOMElement()
    wait(100)
    expect(region).toHaveTextContent('Updating layout…')
  })

  it('does not say "Layout updated." when the slow layout failed', () => {
    render(<PreviewSlot />)
    const region = screen.getByRole('status')
    setStatus('computing')
    wait(UPDATING_ANNOUNCE_DELAY_MS)
    act(() => {
      usePages.setState({ status: 'error', layout: null, pages: [] })
    })
    expect(region).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('PreviewToolbar', () => {
  it('disables "Edit selected image" without a selection', () => {
    render(<PreviewToolbar />)
    expect(screen.getByRole('button', { name: 'Edit selected image' })).toBeDisabled()
  })
  it('selects then opens the edit sheet for the selected image', async () => {
    h.selectedId = 'a'
    render(<PreviewToolbar />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit selected image' }))
    expect(h.select).toHaveBeenCalledWith('a')
    expect(useAppUi.getState().editingId).toBe('a')
  })
})

describe('PreviewSlot in Arrange mode (B4)', () => {
  const manual = { content: { x: 10, y: 10, w: 190, h: 277 }, gutter: 5, pageCount: 1, blocks: [] }
  const arranged = () => {
    h.view = { manual, blocks: [{ id: 'a#0' }] }
    act(() => {
      useArrange.setState({ mode: true })
    })
  }
  const lastArrange = () => h.arranges.at(-1) as Record<string, unknown> | undefined

  it('gives the pages no arrange props outside Arrange mode', () => {
    h.view = { manual, blocks: [{ id: 'a#0' }] }
    render(<PreviewSlot />)
    expect(lastArrange()).toBeUndefined()
  })

  it('gives the pages the blocks, content box and gutter on desktop', () => {
    arranged()
    render(<PreviewSlot />)
    expect(lastArrange()).toMatchObject({
      blocks: [{ id: 'a#0' }],
      content: manual.content,
      gutter: 5,
      selected: null,
      pickedUp: null,
    })
  })

  it('gives the phone the blocks too, but no drop target on another page (M5-R13)', () => {
    stubDesktop(false)
    arranged()
    render(<PreviewSlot />)
    const props = lastArrange() as { blocks: unknown; sheets: SheetRegistry } | undefined
    expect(props?.blocks).toEqual([{ id: 'a#0' }])
    const sheet = document.createElement('div')
    props?.sheets.register(1, sheet)
    expect(props?.sheets.at(10, 10)).toBeNull()
  })

  it('lets a desktop drag find another page under the pointer', () => {
    arranged()
    render(<PreviewSlot />)
    const props = lastArrange() as { sheets: SheetRegistry } | undefined
    expect(props?.sheets.at(10, 10)).toMatchObject({ page: 1 })
  })

  it('drops a selection or pick-up whose block is gone (ruling B1-3)', () => {
    arranged()
    act(() => {
      useArrange.setState({ selected: 'gone#0' })
      useArrangeUi.setState({ pickedUp: 'gone#1' })
    })
    render(<PreviewSlot />)
    expect(lastArrange()).toMatchObject({ selected: null, pickedUp: null })
    act(() => {
      useArrange.setState({ selected: 'a#0' })
    })
    expect(lastArrange()).toMatchObject({ selected: 'a#0' })
  })

  it.each([
    [{ ctrlKey: true }, 1],
    [{ metaKey: true }, 1],
    [{ ctrlKey: true, shiftKey: true }, 0],
    [{}, 0],
  ])('Ctrl/Cmd + Z in the preview undoes (%o)', (mods, calls) => {
    arranged()
    render(<PreviewSlot />)
    fireEvent.keyDown(screen.getByRole('button', { name: /Page 1 of 1/ }), { key: 'z', ...mods })
    expect(h.undo).toHaveBeenCalledTimes(calls)
  })

  it('Ctrl + Z does nothing outside Arrange mode', () => {
    render(<PreviewSlot />)
    fireEvent.keyDown(screen.getByRole('button', { name: /Page 1 of 1/ }), {
      key: 'z',
      ctrlKey: true,
    })
    expect(h.undo).not.toHaveBeenCalled()
  })

  it('announces in one polite region outside the busy preview, mounted before use', () => {
    act(() => {
      usePages.setState({ status: 'computing' })
    })
    const { container } = render(<PreviewSlot />)
    const region = container.querySelector('[aria-live="polite"]')
    expect(region).toBeEmptyDOMElement()
    expect(region?.closest('[aria-busy]')).toBeNull()
    act(() => {
      useArrangeUi.getState().announce('Undone.')
    })
    const first = region?.textContent
    expect(first?.trim()).toBe('Undone.')
    act(() => {
      useArrangeUi.getState().announce('Undone.')
    })
    expect(region?.textContent.trim()).toBe('Undone.')
    expect(region?.textContent).not.toBe(first)
  })
})

describe('PreviewToolbar in Arrange mode (B4)', () => {
  it('has the Arrange toggle, and hides "Edit selected image" while arranging', async () => {
    render(<PreviewToolbar />)
    const toggle = screen.getByRole('button', { name: 'Arrange' })
    expect(screen.getByRole('button', { name: 'Edit selected image' })).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(useArrange.getState().mode).toBe(true)
    expect(screen.queryByRole('button', { name: 'Edit selected image' })).toBeNull()
  })
})
