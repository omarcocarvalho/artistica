import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GetSource } from '../../features/render'
import type { ImageId } from '../../shared/model/image'

const h = vi.hoisted(() => ({
  count: 1,
  images: [] as { id: string; pxW: number; pxH: number }[],
  getSource: undefined as GetSource | undefined,
  decodeFull: vi.fn((image: unknown) => Promise.resolve({ image })),
  provider: { pause: vi.fn(), resume: vi.fn() },
}))
vi.mock('../study-provider', () => ({ appStudyProvider: h.provider }))
vi.mock('../state/hasImages', () => ({ useImageCount: () => h.count }))
vi.mock('../../features/render', () => ({
  ExportDialog: (p: { open: boolean; getSource: GetSource }) => {
    h.getSource = p.getSource
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
