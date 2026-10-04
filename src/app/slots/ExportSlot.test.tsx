import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageId } from '../../shared/model/image'

const h = vi.hoisted(() => ({
  count: 1,
  images: [] as { id: string; bitmap: unknown }[],
  getBitmap: undefined as ((id: ImageId) => unknown) | undefined,
}))
vi.mock('../state/hasImages', () => ({ useImageCount: () => h.count }))
vi.mock('../../features/render', () => ({
  ExportDialog: (p: { open: boolean; getBitmap: (id: ImageId) => unknown }) => {
    h.getBitmap = p.getBitmap
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
  return { useImages }
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
  it('reads bitmaps from the live images store, not a snapshot', () => {
    usePages.setState({ pages: [page] })
    render(<ExportSlot />)
    const getBitmap = h.getBitmap
    expect(getBitmap?.('a' as ImageId)).toBeUndefined()
    const bitmap = {}
    h.images = [{ id: 'a', bitmap }]
    expect(getBitmap?.('a' as ImageId)).toBe(bitmap)
  })
})
