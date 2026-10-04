import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { stubDesktop } from '../test-utils'
import { useAppUi } from '../state/useAppUi'

const store = vi.hoisted(() => ({ ref: undefined as { setState(s: object): void } | undefined }))
vi.mock('../../features/images', async () => {
  const { create } = await import('zustand')
  const useImages = create<{ images: { id: string; name: string }[] }>()(() => ({
    images: [{ id: 'a', name: 'anna.jpg' }],
  }))
  store.ref = useImages
  return {
    useImages,
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
  it('closes itself when the image is removed while its sheet is open', () => {
    useAppUi.getState().openEdit('a' as ImageId)
    render(<EditSlot />)
    act(() => {
      store.ref?.setState({ images: [] })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useAppUi.getState().editingId).toBeNull()
  })
})
