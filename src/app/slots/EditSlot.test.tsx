import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { stubDesktop } from '../test-utils'
import { useAppUi } from '../state/useAppUi'

interface Item {
  id: string
  name: string
}
const store = vi.hoisted(() => ({
  ref: undefined as { setState(s: object): void } | undefined,
  useImages: undefined as (<T>(select: (s: { images: Item[] }) => T) => T) | undefined,
}))
vi.mock('../../features/images', async () => {
  const { create } = await import('zustand')
  const useImages = create<{ images: { id: string; name: string }[] }>()(() => ({
    images: [{ id: 'a', name: 'anna.jpg' }],
  }))
  store.ref = useImages
  store.useImages = useImages
  const focus = await import('../../features/images/focus-after-removal')
  return {
    useImages,
    removalFocusTarget: focus.removalFocusTarget,
    ImageEditSheet: ({ imageId }: { imageId: string }) => <p>editor for {imageId}</p>,
  }
})

import { EditSlot } from './EditSlot'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  stubDesktop(true)
  useAppUi.setState(useAppUi.getInitialState())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EditSlot', () => {
  it('opens a titled dialog for the image being edited', () => {
    useAppUi.getState().openEdit('a' as ImageId)
    render(<EditSlot />)
    expect(screen.getByRole('dialog', { name: 'anna.jpg' })).toBeInTheDocument()
    expect(screen.getByText('editor for a')).toBeInTheDocument()
  })
  it('has a Done button that closes the sheet (edits are live, there is no draft)', async () => {
    useAppUi.getState().openEdit('a' as ImageId)
    render(<EditSlot />)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(useAppUi.getState().editingId).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('closes itself when the image is removed while its sheet is open', async () => {
    useAppUi.getState().openEdit('a' as ImageId)
    render(<EditSlot />)
    act(() => {
      store.ref?.setState({ images: [] })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useAppUi.getState().editingId).toBeNull()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  })

  describe('focus after removing the image from its sheet', () => {
    function Rows() {
      const images = (
        store.ref as unknown as (
          sel: (s: { images: { id: string; name: string }[] }) => unknown,
        ) => unknown
      )((s) => s.images) as { id: string; name: string }[]
      return (
        <>
          <section data-dropzone>
            <button type="button">Upload</button>
          </section>
          {images.map((i) => (
            <button key={i.id} type="button" data-row-action="edit">
              Edit {i.name}
            </button>
          ))}
        </>
      )
    }
    const open = (id: string) => {
      render(
        <>
          <Rows />
          <EditSlot />
        </>,
      )
      act(() => {
        screen.getByRole('button', { name: `Edit ${id}.jpg` }).focus()
        useAppUi.getState().openEdit(id as ImageId)
      })
    }
    const remove = (id: string, rest: string[]) => {
      act(() => {
        store.ref?.setState({ images: rest.map((r) => ({ id: r, name: `${r}.jpg` })) })
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: `Edit ${id}.jpg` })).not.toBeInTheDocument()
    }

    beforeEach(() => {
      store.ref?.setState({
        images: ['a', 'b', 'c'].map((id) => ({ id, name: `${id}.jpg` })),
      })
    })

    it('focuses the next row Edit button', async () => {
      open('b')
      remove('b', ['a', 'c'])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit c.jpg' })).toHaveFocus()
      })
    })

    it('focuses the previous row Edit button when the last row goes', async () => {
      open('c')
      remove('c', ['a', 'b'])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit b.jpg' })).toHaveFocus()
      })
    })

    it('focuses Upload when no image is left', async () => {
      store.ref?.setState({ images: [{ id: 'a', name: 'a.jpg' }] })
      open('a')
      remove('a', [])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Upload' })).toHaveFocus()
      })
    })
  })
})
