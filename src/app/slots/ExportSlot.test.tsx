import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GetSource } from '../../features/render'
import type { ImageId } from '../../shared/model/image'

const h = vi.hoisted(() => ({
  count: 1,
  images: [] as { id: string; pxW: number; pxH: number }[],
  getSource: undefined as GetSource | undefined,
  decodeFull: vi.fn((image: unknown) => Promise.resolve({ image })),
}))
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
import { ExportSlot } from './ExportSlot'

const page = { index: 0, tiles: [] } as never

beforeEach(() => {
  h.count = 1
  h.images = []
  useAppUi.setState(useAppUi.getInitialState())
  usePages.setState({ status: 'idle', layout: null, pages: [] })
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
})
