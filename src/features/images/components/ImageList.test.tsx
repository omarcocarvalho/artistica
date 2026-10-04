import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageId } from '../../../shared/model/image'
import { useSettings } from '../../settings'
import { useImages } from '../store'
import { makeLoadedImage, renderWithProviders } from '../test-utils'
import { ImageList } from './ImageList'

beforeEach(() => {
  useImages.setState(useImages.getInitialState(), true)
  useSettings.getState().reset()
})

const load = (...imgs: ReturnType<typeof makeLoadedImage>[]) => {
  useImages.setState({ images: imgs, selectedId: imgs[0]?.id ?? null })
}

describe('ImageList', () => {
  it('shows the empty hint with no images', () => {
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    expect(screen.getByText('No images yet. Add photos to start your sheets.')).toBeInTheDocument()
    expect(screen.getByText('JPG, PNG, WebP, GIF, HEIC')).toBeInTheDocument()
  })

  it('shows name, pixel size and size mode', () => {
    load(makeLoadedImage({ id: 'a' as ImageId, name: 'portrait-anna.jpg', pxW: 3000, pxH: 4000 }))
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    const list = screen.getByRole('list', { name: 'Loaded images' })
    expect(
      within(list).getByRole('button', { name: 'Select portrait-anna.jpg' }),
    ).toBeInTheDocument()
    expect(within(list).getByText('3000 × 4000')).toBeInTheDocument()
    expect(within(list).getByText('Auto')).toBeInTheDocument()
  })

  it('shows a fixed size in the chosen unit', () => {
    load(
      makeLoadedImage({
        pxW: 1920,
        pxH: 1080,
        edits: { size: { kind: 'fixed', axis: 'width', mm: 112 } },
      }),
    )
    useSettings.getState().setUnit('mm')
    const { unmount } = renderWithProviders(<ImageList onEdit={() => undefined} />)
    expect(screen.getByText('Fixed 112 mm')).toBeInTheDocument()
    unmount()
    useSettings.getState().setUnit('in')
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    expect(screen.getByText('Fixed 4.41 in')).toBeInTheDocument()
  })

  it('shows the copies badge only above one copy', () => {
    load(
      makeLoadedImage({ name: 'one.jpg' }),
      makeLoadedImage({ name: 'two.jpg', edits: { copies: 2 } }),
    )
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    expect(screen.getAllByText('×2')).toHaveLength(1)
  })

  it('flags low-resolution images with their DPI, and only those', () => {
    load(
      makeLoadedImage({ name: 'old.gif', pxW: 480, pxH: 640 }),
      makeLoadedImage({ name: 'sharp.jpg', pxW: 4000, pxH: 3000 }),
    )
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    expect(screen.getAllByText(/DPI/)).toHaveLength(1)
    expect(screen.getByText('203 DPI')).toBeInTheDocument()
  })

  it('selects on click and marks the selected row', async () => {
    const a = makeLoadedImage({ id: 'a' as ImageId, name: 'a.jpg' })
    const b = makeLoadedImage({ id: 'b' as ImageId, name: 'b.jpg' })
    load(a, b)
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Select b.jpg' }))
    expect(useImages.getState().selectedId).toBe('b')
    const rows = screen.getAllByRole('listitem')
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
    expect(rows[0]).not.toHaveAttribute('aria-current')
  })

  it('scrolls a row into view when selection changes from elsewhere', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    load(makeLoadedImage({ id: 'a' as ImageId }), makeLoadedImage({ id: 'b' as ImageId }))
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    scroll.mockClear()
    useImages.getState().select('b' as ImageId)
    return vi.waitFor(() => {
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    })
  })

  it('has no Remove all button when there are no images', () => {
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Remove all images' })).not.toBeInTheDocument()
  })

  it('Remove all with a single image clears at once, without asking', async () => {
    load(makeLoadedImage({ id: 'a' as ImageId }))
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove all images' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useImages.getState().images).toHaveLength(0)
  })

  it('Remove all with 2 or more images asks first (owner Q4, default); Cancel keeps them', async () => {
    load(makeLoadedImage({ id: 'a' as ImageId }), makeLoadedImage({ id: 'b' as ImageId }))
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove all images' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove all images?' })
    expect(within(dialog).getByText(/all 2 images/)).toBeInTheDocument()
    expect(useImages.getState().images).toHaveLength(2)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useImages.getState().images).toHaveLength(2)
  })

  it('confirming Remove all clears the store and the selection', async () => {
    load(makeLoadedImage({ id: 'a' as ImageId }), makeLoadedImage({ id: 'b' as ImageId }))
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove all images' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove all' }),
    )
    expect(useImages.getState().images).toHaveLength(0)
    expect(useImages.getState().selectedId).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape closes the confirmation without removing anything', async () => {
    load(makeLoadedImage({ id: 'a' as ImageId }), makeLoadedImage({ id: 'b' as ImageId }))
    renderWithProviders(<ImageList onEdit={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove all images' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useImages.getState().images).toHaveLength(2)
  })

  it('edit calls onEdit; remove removes', async () => {
    const onEdit = vi.fn()
    load(makeLoadedImage({ id: 'a' as ImageId, name: 'a.jpg' }))
    renderWithProviders(<ImageList onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit a.jpg' }))
    expect(onEdit).toHaveBeenCalledWith('a')
    await userEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }))
    expect(useImages.getState().images).toHaveLength(0)
  })
})
