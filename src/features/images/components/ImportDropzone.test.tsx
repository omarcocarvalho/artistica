import { fireEvent, screen, waitFor } from '@testing-library/react'
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
  const addFromUrl = vi.fn().mockResolvedValue(ok('1'))
  useImages.setState({ addFiles, addFromClipboard, addFromUrl, ...over })
  return { addFiles, addFromClipboard, addFromUrl }
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
    const { addFromClipboard } = mockStore()
    addFromClipboard.mockResolvedValue([
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
    expect(addFromClipboard).toHaveBeenCalledTimes(1)
    expect((addFromClipboard.mock.calls[0]?.[0] as DataTransfer).files).toEqual(dataTransfer.files)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("notes.pdf can't be added")
    expect(alert).toHaveTextContent('Use JPG, PNG, WebP, GIF or HEIC.')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a drop with nothing importable says there is no image', async () => {
    const { addFromClipboard } = mockStore()
    addFromClipboard.mockResolvedValue([])
    const { container } = renderWithProviders(<ImportDropzone />)
    fireEvent.drop(pick(container, '[data-dropzone]'), {
      dataTransfer: { files: [], types: ['text/plain'], getData: () => 'just words' },
    })
    expect(await screen.findByRole('status')).toHaveTextContent('No image on the clipboard')
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
    const { addFromClipboard } = mockStore()
    renderWithProviders(<ImportDropzone />)
    const notPrevented = fireEvent.drop(document.body, {
      dataTransfer: { files: [file('a.jpg')], types: ['Files'], getData: () => '' },
    })
    expect(notPrevented).toBe(false) // default prevented
    expect(addFromClipboard).not.toHaveBeenCalled()
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
})
