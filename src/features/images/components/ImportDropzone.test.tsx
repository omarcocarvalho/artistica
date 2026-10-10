import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageId } from '../../../shared/model/image'
import { renderWithProviders } from '../test-utils'
import { useImages } from '../store'
import type { ImportOutcome } from '../types'
import { ImportDropzone } from './ImportDropzone'

const ok = (id: string): ImportOutcome => ({ ok: true, id: id as ImageId })
const file = (name: string, type = 'image/jpeg') => new File(['x'], name, { type })

beforeEach(() => {
  useImages.setState(useImages.getInitialState(), true)
})
afterEach(() => {
  vi.restoreAllMocks()
})

function pick(container: HTMLElement, selector: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`missing ${selector}`)
  return el
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const el = pick(container, 'input[type="file"]')
  if (!(el instanceof HTMLInputElement)) throw new Error('not an input')
  return el
}

function mockStore(over: Partial<ReturnType<typeof useImages.getState>> = {}) {
  const addFiles = vi.fn().mockResolvedValue([ok('1')])
  const addFromClipboard = vi.fn().mockResolvedValue([ok('1')])
  const addFromDrop = vi.fn().mockResolvedValue([ok('1')])
  const addFromUrl = vi.fn().mockResolvedValue(ok('1'))
  useImages.setState({ addFiles, addFromClipboard, addFromDrop, addFromUrl, ...over })
  return { addFiles, addFromClipboard, addFromDrop, addFromUrl }
}

describe('ImportDropzone', () => {
  it('card variant renders the empty-state copy and the three actions', () => {
    mockStore()
    renderWithProviders(<ImportDropzone variant="card" />)
    expect(screen.getByRole('heading', { name: 'Add some reference photos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload photos/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paste/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add link/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing is uploaded. Photos stay on this device.')).toBeInTheDocument()
  })

  it('compact is the default and has an "Add images" group', () => {
    mockStore()
    renderWithProviders(<ImportDropzone />)
    expect(screen.getByRole('group', { name: 'Add images' })).toBeInTheDocument()
    expect(screen.getByText('or drop photos here')).toBeInTheDocument()
  })

  it('sends picked files to addFiles', async () => {
    const { addFiles } = mockStore()
    const { container } = renderWithProviders(<ImportDropzone />)
    const input = fileInput(container)
    expect(input.accept).toContain('.heic')
    expect(input.multiple).toBe(true)
    const f = file('a.jpg')
    await userEvent.upload(input, [f])
    expect(addFiles).toHaveBeenCalledWith([f])
  })

  it('a mixed drop: one callout for the bad file, the good ones are accepted', async () => {
    const { addFromClipboard, addFromDrop } = mockStore()
    addFromDrop.mockResolvedValue([
      ok('1'),
      { ok: false, source: 'notes.pdf', error: 'unsupported-format' },
    ])
    const { container } = renderWithProviders(<ImportDropzone variant="card" />)
    const zone = pick(container, '[data-dropzone]')
    const dataTransfer = {
      files: [file('a.jpg'), file('notes.pdf', 'application/pdf')],
      types: ['Files'],
      getData: () => '',
    }
    fireEvent.drop(zone, { dataTransfer })
    expect(addFromDrop).toHaveBeenCalledTimes(1)
    expect((addFromDrop.mock.calls[0]?.[0] as DataTransfer).files).toEqual(dataTransfer.files)
    expect(addFromClipboard).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("notes.pdf can't be added")
    expect(alert).toHaveTextContent('Use JPG, PNG, WebP, GIF or HEIC.')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a drop with nothing importable says there is no image in what was dropped (owner Q-H10)', async () => {
    const { addFromDrop } = mockStore()
    addFromDrop.mockResolvedValue([])
    const { container } = renderWithProviders(<ImportDropzone />)
    fireEvent.drop(pick(container, '[data-dropzone]'), {
      dataTransfer: { files: [], types: ['text/plain'], getData: () => 'just words' },
    })
    const status = await screen.findByRole('status')
    await waitFor(() => {
      expect(status).toHaveTextContent('No image in what you dropped')
    })
    expect(status).toHaveTextContent('Drop a photo file, or an image from another page.')
    expect(status).not.toHaveTextContent('clipboard')
  })

  it('a paste with nothing importable keeps the clipboard wording', async () => {
    const { addFromClipboard } = mockStore()
    addFromClipboard.mockResolvedValue([])
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      read: () => Promise.resolve([]),
    } as unknown as Clipboard)
    renderWithProviders(<ImportDropzone />)
    await userEvent.click(screen.getByRole('button', { name: /Paste/ }))
    const status = screen.getByRole('status')
    await waitFor(() => {
      expect(status).toHaveTextContent('No image on the clipboard')
    })
    expect(status).toHaveTextContent('Copy an image first, then paste again.')
    expect(status).not.toHaveTextContent('dropped')
  })

  it('registers no document paste listener (CR-E3): a window paste is not handled here', () => {
    const { addFromClipboard } = mockStore()
    renderWithProviders(<ImportDropzone variant="card" />)
    fireEvent.paste(document.body, {
      clipboardData: { files: [file('a.png')], types: ['Files'], getData: () => '' },
    })
    expect(addFromClipboard).not.toHaveBeenCalled()
  })

  it('guards the window against navigating to a dropped file, without importing it', () => {
    const { addFromClipboard, addFromDrop } = mockStore()
    renderWithProviders(<ImportDropzone />)
    const notPrevented = fireEvent.drop(document.body, {
      dataTransfer: { files: [file('a.jpg')], types: ['Files'], getData: () => '' },
    })
    expect(notPrevented).toBe(false) // default prevented
    expect(addFromClipboard).not.toHaveBeenCalled()
    expect(addFromDrop).not.toHaveBeenCalled()
  })

  it('the Paste button reads the clipboard into a DataTransfer and imports it', async () => {
    const { addFromClipboard } = mockStore()
    const png = new Blob(['x'], { type: 'image/png' })
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      read: () => Promise.resolve([{ types: ['image/png'], getType: () => Promise.resolve(png) }]),
    } as unknown as Clipboard)
    renderWithProviders(<ImportDropzone variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: /Paste/ }))
    await waitFor(() => {
      expect(addFromClipboard).toHaveBeenCalledTimes(1)
    })
    const dt = addFromClipboard.mock.calls[0]?.[0] as DataTransfer
    expect(dt.files).toHaveLength(1)
    expect(dt.files[0]?.type).toBe('image/png')
  })

  it('the Paste button passes a text/plain URL item along', async () => {
    const { addFromClipboard } = mockStore()
    const text = new Blob(['https://x.com/a.jpg'], { type: 'text/plain' })
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      read: () =>
        Promise.resolve([{ types: ['text/plain'], getType: () => Promise.resolve(text) }]),
    } as unknown as Clipboard)
    renderWithProviders(<ImportDropzone variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: /Paste/ }))
    await waitFor(() => {
      expect(addFromClipboard).toHaveBeenCalledTimes(1)
    })
    const dt = addFromClipboard.mock.calls[0]?.[0] as DataTransfer
    expect(dt.getData('text/plain')).toBe('https://x.com/a.jpg')
  })

  it('the Paste button shows the hint when navigator.clipboard is missing', async () => {
    const { addFromClipboard } = mockStore()
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard)
    renderWithProviders(<ImportDropzone variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: /Paste/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('Press Ctrl+V')
    expect(addFromClipboard).not.toHaveBeenCalled()
  })

  it('a store failure after a successful clipboard read does not show the paste hint', async () => {
    const { addFromClipboard } = mockStore()
    addFromClipboard.mockRejectedValue(new Error('boom'))
    const png = new Blob(['x'], { type: 'image/png' })
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      read: () => Promise.resolve([{ types: ['image/png'], getType: () => Promise.resolve(png) }]),
    } as unknown as Clipboard)
    renderWithProviders(<ImportDropzone variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: /Paste/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent('Press Ctrl+V')
  })

  it('the status region is mounted before anything is announced', () => {
    mockStore()
    renderWithProviders(<ImportDropzone variant="card" />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('the window guard also covers dragover, ignores non-file drags and cleans up', () => {
    mockStore()
    const { unmount } = renderWithProviders(<ImportDropzone />)
    const over = fireEvent.dragOver(document.body, { dataTransfer: { types: ['Files'] } })
    expect(over).toBe(false)
    const text = fireEvent.drop(document.body, { dataTransfer: { types: ['text/plain'] } })
    expect(text).toBe(true)
    unmount()
    const after = fireEvent.drop(document.body, { dataTransfer: { types: ['Files'] } })
    expect(after).toBe(true)
  })

  it('two mounted instances both guard, and one unmounting leaves the other guarding', () => {
    mockStore()
    const a = renderWithProviders(<ImportDropzone />)
    renderWithProviders(<ImportDropzone />)
    a.unmount()
    expect(fireEvent.drop(document.body, { dataTransfer: { types: ['Files'] } })).toBe(false)
  })

  it('the Paste button explains the keyboard shortcut when the clipboard cannot be read', async () => {
    mockStore()
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      read: () => Promise.reject(new Error('denied')),
    } as unknown as Clipboard)
    renderWithProviders(<ImportDropzone variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: /Paste/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('Press Ctrl+V')
  })

  it('submits a link and closes the form on success', async () => {
    const { addFromUrl } = mockStore()
    renderWithProviders(<ImportDropzone variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: /Add link/ }))
    await userEvent.type(screen.getByLabelText('Image link'), 'example.com/a.jpg{enter}')
    expect(addFromUrl).toHaveBeenCalledWith('example.com/a.jpg')
    await waitFor(() => expect(screen.queryByLabelText('Image link')).not.toBeInTheDocument())
  })

  it('a CORS failure shows the exact spec message with the two next steps', async () => {
    const { addFromUrl } = mockStore()
    addFromUrl.mockResolvedValue({ ok: false, source: 'https://x.com/a.jpg', error: 'cors' })
    renderWithProviders(<ImportDropzone variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: /Add link/ }))
    await userEvent.type(screen.getByLabelText('Image link'), 'https://x.com/a.jpg{enter}')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Can't read this image")
    expect(alert).toHaveTextContent(
      "This site doesn't allow other apps to read its images. Download it and upload it instead.",
    )
    expect(screen.getByLabelText('Image link')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Try another link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload instead' })).toBeInTheDocument()
  })

  it('shows progress while importing', () => {
    mockStore({ importing: 2 })
    renderWithProviders(<ImportDropzone variant="card" />)
    expect(screen.getByText('Adding 2 photos…')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Adding photos' })).toBeInTheDocument()
  })

  describe('Cancel while importing (owner Q-H5)', () => {
    it('shows no Cancel button while nothing is importing', () => {
      mockStore()
      renderWithProviders(<ImportDropzone />)
      expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument()
    })

    for (const variant of ['compact', 'card'] as const) {
      it(`${variant}: Cancel next to the progress stops every import, announces it and moves focus to Upload`, async () => {
        const cancelImports = vi.fn(() => {
          useImages.setState({ importing: 0 })
        })
        mockStore({ importing: 3, cancelImports })
        renderWithProviders(<ImportDropzone variant={variant} />)
        expect(screen.getByText('Adding 3 photos…')).toBeInTheDocument()
        const cancel = screen.getByRole('button', { name: 'Cancel adding photos' })
        expect(cancel).toHaveTextContent('Cancel')
        expect(screen.getByRole('status')).not.toContainElement(cancel)
        await userEvent.click(cancel)
        expect(cancelImports).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('status')).toHaveTextContent('Stopped adding photos.')
        expect(screen.queryByText('Adding 3 photos…')).not.toBeInTheDocument()
        expect(
          screen.queryByRole('button', { name: 'Cancel adding photos' }),
        ).not.toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: variant === 'card' ? /Upload photos/ : /Upload/ }),
        ).toHaveFocus()
      })
    }

    it('the stopped notice goes once the next import starts', async () => {
      const cancelImports = vi.fn(() => {
        useImages.setState({ importing: 0 })
      })
      mockStore({ importing: 1, cancelImports })
      renderWithProviders(<ImportDropzone />)
      await userEvent.click(screen.getByRole('button', { name: 'Cancel adding photos' }))
      expect(screen.getByRole('status')).toHaveTextContent('Stopped adding photos.')
      act(() => {
        useImages.setState({ importing: 2 })
      })
      expect(screen.getByRole('status')).not.toHaveTextContent('Stopped adding photos.')
      expect(screen.getByText('Adding 2 photos…')).toBeInTheDocument()
      act(() => {
        useImages.setState({ importing: 0 })
      })
      expect(screen.getByRole('status')).not.toHaveTextContent('Stopped adding photos.')
    })
  })

  it('reports outcomes to the shell', async () => {
    const { addFiles } = mockStore()
    const onOutcomes = vi.fn()
    const { container } = renderWithProviders(<ImportDropzone onOutcomes={onOutcomes} />)
    await userEvent.upload(fileInput(container), [file('a.jpg')])
    await waitFor(() => {
      expect(onOutcomes).toHaveBeenCalledWith([ok('1')])
    })
    expect(addFiles).toHaveBeenCalled()
  })

  it('a failed import shows exactly one inline alert and still reports it (CR-X2: E must not toast it again)', async () => {
    const { addFiles } = mockStore()
    const failure = {
      ok: false as const,
      source: 'notes.pdf',
      error: 'unsupported-format' as const,
    }
    addFiles.mockResolvedValue([failure])
    const onOutcomes = vi.fn()
    const { container } = renderWithProviders(<ImportDropzone onOutcomes={onOutcomes} />)
    // the real picker filters by `accept`; this checks how a failure is shown, so let the pdf through
    await userEvent
      .setup({ applyAccept: false })
      .upload(fileInput(container), [file('notes.pdf', 'application/pdf')])
    await waitFor(() => {
      expect(onOutcomes).toHaveBeenCalledWith([failure])
    })
    expect(await screen.findAllByRole('alert')).toHaveLength(1)
  })

  describe('the "too large" message names the limit for this device (owner Q-H7)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    it.each([
      [true, 'Photos can be up to 100 MB and 100 megapixels. Try a smaller version.'],
      [false, 'Photos can be up to 100 MB and 200 megapixels. Try a smaller version.'],
    ])('coarse pointer %s', async (coarse, message) => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse }))
      const { addFiles } = mockStore()
      addFiles.mockResolvedValue([{ ok: false, source: 'huge.jpg', error: 'too-large' }])
      const { container } = renderWithProviders(<ImportDropzone />)
      await userEvent.setup().upload(fileInput(container), [file('huge.jpg')])
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('huge.jpg is too large')
      expect(alert).toHaveTextContent(message)
    })

    it('a link that is too large names the touch-screen limit too', async () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }))
      const { addFromUrl } = mockStore()
      addFromUrl.mockResolvedValue({ ok: false, source: 'https://x.com/a.jpg', error: 'too-large' })
      renderWithProviders(<ImportDropzone variant="card" />)
      await userEvent.click(screen.getByRole('button', { name: /Add link/ }))
      await userEvent.type(screen.getByLabelText('Image link'), 'https://x.com/a.jpg{enter}')
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Photos can be up to 100 MB and 100 megapixels.',
      )
    })
  })

  describe('imports discarded by Remove all report nothing', () => {
    it('a picked file batch resolving to null shows no alert and reports no outcomes', async () => {
      const { addFiles } = mockStore()
      addFiles.mockResolvedValue(null)
      const onOutcomes = vi.fn()
      const { container } = renderWithProviders(<ImportDropzone onOutcomes={onOutcomes} />)
      await userEvent.upload(fileInput(container), [file('a.jpg')])
      await waitFor(() => {
        expect(addFiles).toHaveBeenCalled()
      })
      await new Promise((r) => setTimeout(r, 0))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(onOutcomes).not.toHaveBeenCalled()
    })

    it('a drop resolving to null does not say there is no image', async () => {
      const { addFromDrop } = mockStore()
      addFromDrop.mockResolvedValue(null)
      const { container } = renderWithProviders(<ImportDropzone />)
      fireEvent.drop(pick(container, '[data-dropzone]'), {
        dataTransfer: { types: ['Files'], files: [file('a.jpg')], items: [], getData: () => '' },
      })
      await waitFor(() => {
        expect(addFromDrop).toHaveBeenCalled()
      })
      await new Promise((r) => setTimeout(r, 0))
      expect(screen.getByRole('status')).not.toHaveTextContent('No image on the clipboard')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('a link resolving to null shows no error and keeps the form as it was', async () => {
      const { addFromUrl } = mockStore()
      addFromUrl.mockResolvedValue(null)
      const onOutcomes = vi.fn()
      renderWithProviders(<ImportDropzone variant="card" onOutcomes={onOutcomes} />)
      await userEvent.click(screen.getByRole('button', { name: /Add link/ }))
      await userEvent.type(screen.getByLabelText('Image link'), 'https://x.com/a.jpg{enter}')
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
      })
      expect(addFromUrl).toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Image link')).not.toHaveAttribute('aria-invalid')
      expect(onOutcomes).not.toHaveBeenCalled()
    })
  })
})
