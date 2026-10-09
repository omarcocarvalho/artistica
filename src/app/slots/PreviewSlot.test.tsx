import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_LINES, type LineSettings } from '../../shared/model/lines'
import { stubDesktop } from '../test-utils'

const h = vi.hoisted(() => ({
  select: vi.fn(),
  selectedId: null as string | null,
  studyTiles: [] as unknown[],
  provider: { name: 'app study provider' },
  lines: undefined as LineSettings | undefined,
}))
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
  }) => {
    h.studyTiles.push(p.studyTiles)
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
  })
  return { useImages }
})

import { usePages } from '../pages-store'
import { useAppUi } from '../state/useAppUi'
import { PreviewSlot, PreviewToolbar } from './PreviewSlot'

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
  h.lines = undefined
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
  it('keeps the "Updating layout…" live region mounted and only changes its text', () => {
    render(<PreviewSlot />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    act(() => {
      usePages.setState({ status: 'computing' })
    })
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Updating layout…')
    act(() => {
      usePages.setState({ status: 'idle' })
    })
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toBeEmptyDOMElement()
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
