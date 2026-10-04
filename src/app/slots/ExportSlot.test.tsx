import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../features/render', () => ({
  ExportDialog: (p: { open: boolean }) => <p data-testid="dialog">{String(p.open)}</p>,
}))
vi.mock('../../features/images', () => {
  const state = { images: [] as unknown[] }
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
  it('closes the request when the pages vanish', () => {
    useAppUi.setState({ exportOpen: true })
    render(<ExportSlot />)
    expect(screen.getByTestId('dialog')).toHaveTextContent('false')
    expect(useAppUi.getState().exportOpen).toBe(false)
  })
})
