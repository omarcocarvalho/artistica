import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GetSource, PageModel } from '../../features/render'
import { layoutFromManual } from '../../features/layout/manual'
import { item } from '../../features/layout/test-support/fixtures'
import { block, manualOf } from '../../features/layout/test-support/manual'
import { NO_GUIDES } from '../../features/lines/guides/types'
import { buildPageModels } from '../../features/render/page-model/build-page-models'
import { DEFAULT_EDITS, type ImageDescriptor, type ImageId } from '../../shared/model/image'
import { DEFAULT_LINES } from '../../shared/model/lines'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { DEFAULT_STUDY } from '../../shared/model/study'

const h = vi.hoisted(() => ({
  count: 1,
  images: [] as { id: string; pxW: number; pxH: number }[],
  getSource: undefined as GetSource | undefined,
  pages: undefined as readonly PageModel[] | undefined,
  decodeFull: vi.fn((image: unknown) => Promise.resolve({ image })),
  provider: { pause: vi.fn(), resume: vi.fn() },
}))
vi.mock('../study-provider', () => ({ appStudyProvider: h.provider }))
vi.mock('../state/hasImages', () => ({ useImageCount: () => h.count }))
vi.mock('../../features/render', () => ({
  ExportDialog: (p: { open: boolean; getSource: GetSource; pages: readonly PageModel[] }) => {
    h.getSource = p.getSource
    h.pages = p.pages
    return <p data-testid="dialog">{String(p.open)}</p>
  },
}))
vi.mock('../../features/images', () => {
  const state = {
    get images() {
      return h.images
    },
  }
  const useImages = Object.assign((sel: (s: typeof state) => unknown) => sel(state), {
    getState: () => state,
  })
  return { useImages, decodeFull: h.decodeFull }
})

import { usePages } from '../pages-store'
import { useAppUi } from '../state/useAppUi'
import { stubDesktop } from '../test-utils'
import { ExportSlot } from './ExportSlot'

const page = { index: 0, tiles: [] } as never

beforeEach(() => {
  h.count = 1
  h.images = []
  h.provider.pause.mockClear()
  h.provider.resume.mockClear()
  useAppUi.setState(useAppUi.getInitialState())
  usePages.setState({ status: 'idle', layout: null, pages: [] })
  stubDesktop(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExportSlot', () => {
  it('keeps the dialog mounted but closed while exportOpen is false', () => {
    usePages.setState({ pages: [page] })
    render(<ExportSlot />)
    expect(screen.getByTestId('dialog')).toHaveTextContent('false')
  })
  it('opens when requested and a page exists', () => {
    usePages.setState({ pages: [page] })
    useAppUi.setState({ exportOpen: true })
    render(<ExportSlot />)
    expect(screen.getByTestId('dialog')).toHaveTextContent('true')
  })
  it('closes the request when there are no pages at mount', () => {
    useAppUi.setState({ exportOpen: true })
    render(<ExportSlot />)
    expect(screen.getByTestId('dialog')).toHaveTextContent('false')
    expect(useAppUi.getState().exportOpen).toBe(false)
  })
  it('closes the request when the pages vanish while open', () => {
    usePages.setState({ pages: [page] })
    useAppUi.setState({ exportOpen: true })
    render(<ExportSlot />)
    expect(screen.getByTestId('dialog')).toHaveTextContent('true')
    act(() => {
      usePages.setState({ pages: [] })
    })
    expect(useAppUi.getState().exportOpen).toBe(false)
    expect(screen.getByTestId('dialog')).toHaveTextContent('false')
  })
  it('closes the request when the last image is removed', () => {
    usePages.setState({ pages: [page] })
    useAppUi.setState({ exportOpen: true })
    const { rerender } = render(<ExportSlot />)
    h.count = 0
    rerender(<ExportSlot />)
    expect(useAppUi.getState().exportOpen).toBe(false)
  })
  it('reads sources from the live images store, not a snapshot, and decodes on demand', async () => {
    usePages.setState({ pages: [page] })
    render(<ExportSlot />)
    const getSource = h.getSource
    expect(getSource?.('a' as ImageId)).toBeUndefined()
    const image = { id: 'a', pxW: 5100, pxH: 3825 }
    h.images = [image]
    const source = getSource?.('a' as ImageId)
    expect(source).toMatchObject({ pxW: 5100, pxH: 3825 })
    expect(h.decodeFull).not.toHaveBeenCalled()
    await expect(source?.decode()).resolves.toEqual({ image })
    expect(h.decodeFull).toHaveBeenCalledWith(image)
  })
  it('pauses the study provider while the dialog is open, and resumes after (M2-R16, D-CR3)', () => {
    usePages.setState({ pages: [page] })
    render(<ExportSlot />)
    expect(h.provider.pause).not.toHaveBeenCalled()
    act(() => {
      useAppUi.getState().openExport()
    })
    expect(h.provider.pause).toHaveBeenCalledTimes(1)
    expect(h.provider.resume).not.toHaveBeenCalled()
    act(() => {
      useAppUi.getState().closeExport()
    })
    expect(h.provider.resume).toHaveBeenCalledTimes(1)
    expect(h.provider.pause).toHaveBeenCalledTimes(1)
  })
  it('does not pause for an export request that cannot open (no pages)', () => {
    render(<ExportSlot />)
    act(() => {
      useAppUi.getState().openExport()
    })
    expect(h.provider.pause).not.toHaveBeenCalled()
  })
  it('resumes the provider when unmounted while open, and never disposes it', () => {
    usePages.setState({ pages: [page] })
    useAppUi.setState({ exportOpen: true })
    const { unmount } = render(<ExportSlot />)
    expect(h.provider.pause).toHaveBeenCalledTimes(1)
    unmount()
    expect(h.provider.resume).toHaveBeenCalledTimes(1)
    expect('dispose' in h.provider).toBe(false)
  })
  it('hands an arranged layout’s pages to the export unchanged (M5-R18)', () => {
    const setup = { ...DEFAULT_PAGE_SETUP, orientation: 'portrait' as const }
    const items = [item('a', 1), item('b', 1.5)]
    const manual = manualOf([block('a#0', 120, 40, 50), block('b#0', 14, 150, 60)])
    const images: ImageDescriptor[] = ['a', 'b'].map((id) => ({
      id: id as ImageId,
      contentHash: `h-${id}`,
      pxW: 3000,
      pxH: 2000,
      edits: DEFAULT_EDITS,
      study: DEFAULT_STUDY,
      lines: DEFAULT_LINES,
    }))
    const pages = buildPageModels(
      layoutFromManual(manual, items, setup),
      setup,
      images,
      () => NO_GUIDES,
    )
    usePages.setState({ pages })
    useAppUi.setState({ exportOpen: true })
    render(<ExportSlot />)
    expect(h.pages).toBe(pages)
    expect(h.pages?.[0]?.tiles.map((t) => [t.imageId, t.trim.x, t.trim.y])).toEqual([
      ['a', 120, 40],
      ['b', 14, 150],
    ])
  })
  it('never opens the dialog in the phone step flow, and drops the request (M5-R28)', () => {
    stubDesktop(false)
    usePages.setState({ pages: [page] })
    useAppUi.setState({ exportOpen: true })
    render(<ExportSlot />)
    expect(screen.getByTestId('dialog')).toHaveTextContent('false')
    expect(useAppUi.getState().exportOpen).toBe(false)
    expect(h.provider.pause).not.toHaveBeenCalled()
  })
})
