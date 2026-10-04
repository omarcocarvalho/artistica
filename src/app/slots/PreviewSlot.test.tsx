import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { stubDesktop } from '../test-utils'

const h = vi.hoisted(() => ({ select: vi.fn(), selectedId: null as string | null }))
vi.mock('../../features/render', () => ({
  PagePreview: (p: {
    label: string
    getName: (id: ImageId) => string
    onSelect: (id: ImageId) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        p.onSelect('a' as ImageId)
      }}
    >
      {p.label} / {p.getName('a' as ImageId)}
    </button>
  ),
  GuidesToggle: () => null,
  GuidesLegend: () => <p>legend</p>,
}))
vi.mock('../../features/images', () => {
  const state = {
    images: [{ id: 'a', name: 'anna.jpg', bitmap: {} }],
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
        tiles: [{ imageId: 'a', trim: { x: 10, y: 10, w: 100, h: 60 } }],
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
    expect(screen.getByRole('status')).toHaveTextContent(
      'This page setup leaves no room for images.',
    )
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
