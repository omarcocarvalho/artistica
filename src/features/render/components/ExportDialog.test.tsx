import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { ExportError } from '../export/errors'
import { exportPdf } from '../export/export-pdf'
import type { ExportOptions } from '../export/run-export'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { ExportDialog } from './ExportDialog'

vi.mock('../export/export-pdf', () => ({ exportPdf: vi.fn() }))
const mockedExport = vi.mocked(exportPdf)

beforeAll(async () => {
  await initI18n()
})

const createObjectURL = vi.fn(() => 'blob:test')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 3, 12, 0))
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  mockedExport.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

const pages = [
  pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('a') })], {
    cropMarks: [{ x1: 19, y1: 20, x2: 15, y2: 20 }],
  }),
  pageModel([drawTile({ imageId: id('b') })], { index: 1 }),
]

/** A controllable fake export: resolves/rejects on demand, exposes the options it got. */
function deferredExport() {
  let resolve: (b: Blob) => void = () => undefined
  let reject: (e: unknown) => void = () => undefined
  let options: ExportOptions = {}
  mockedExport.mockImplementation((_p, _g, opts = {}) => {
    options = opts
    return new Promise<Blob>((res, rej) => {
      resolve = res
      reject = rej
    })
  })
  return {
    resolve: (b: Blob) => {
      resolve(b)
    },
    reject: (e: unknown) => {
      reject(e)
    },
    options: () => options,
  }
}

function setup(open = true) {
  const onOpenChange = vi.fn()
  render(
    <ExportDialog
      open={open}
      onOpenChange={onOpenChange}
      pages={pages}
      paperLabel="A4"
      getSource={() => undefined}
    />,
  )
  return { onOpenChange, user: userEvent.setup() }
}

describe('ExportDialog', () => {
  it('shows the summary and the D10 file name', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Export PDF' })).toBeInTheDocument()
    expect(screen.getByText('2 · A4 portrait')).toBeInTheDocument()
    expect(screen.getByText('3 from 2 images')).toBeInTheDocument()
    expect(screen.getByText('300 DPI, never upscaled')).toBeInTheDocument()
    expect(screen.getByLabelText('File name')).toHaveValue('artistica-A4-2026-10-03.pdf')
  })

  it('shows progress per page, then a download link with the file name', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    act(() => {
      run.options().onProgress?.({ pageIndex: 1, pageCount: 2, fraction: 0.75 })
    })
    expect(screen.getByText('Page 2 of 2…')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'PDF progress' })).toHaveAttribute(
      'aria-valuenow',
      '75',
    )
    await act(async () => {
      run.resolve(new Blob(['%PDF'], { type: 'application/pdf' }))
      await Promise.resolve()
    })
    const link = screen.getByRole('link', { name: 'Download PDF' })
    expect(link).toHaveAttribute('href', 'blob:test')
    expect(link).toHaveAttribute('download', 'artistica-A4-2026-10-03.pdf')
  })

  it('uses an edited file name, forcing .pdf', async () => {
    const run = deferredExport()
    const { user } = setup()
    const input = screen.getByLabelText('File name')
    await user.clear(input)
    await user.type(input, 'my sheet')
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'download',
      'my sheet.pdf',
    )
  })

  it('cancel aborts the export and returns to the summary', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(run.options().signal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeInTheDocument()
    await act(async () => {
      run.resolve(new Blob(['%PDF'])) // late completion is ignored
      await Promise.resolve()
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('closing while running aborts and reports the close', async () => {
    const run = deferredExport()
    const { user, onOpenChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(run.options().signal?.aborted).toBe(true)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows the error message for the failure code and offers a retry', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.reject(new ExportError('unsupported'))
      await Promise.resolve()
    })
    expect(await screen.findByText(/can't make PDFs/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('maps unknown failures to the generic message', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.reject(new Error('QuotaExceededError'))
      await Promise.resolve()
    })
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('revokes the object URL when starting over', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    await user.click(screen.getByRole('button', { name: 'Make another' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('ignores late events from a cancelled run after a restart', async () => {
    const runs: { options: ExportOptions; reject: (e: unknown) => void }[] = []
    mockedExport.mockImplementation((_p, _g, opts = {}) => {
      return new Promise<Blob>((_res, rej) => {
        runs.push({ options: opts, reject: rej })
      })
    })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      runs[0]?.reject(new Error('boom'))
      runs[0]?.options.onProgress?.({ pageIndex: 1, pageCount: 2, fraction: 0.9 })
      await Promise.resolve()
    })
    expect(screen.getByText('Page 1 of 2…')).toBeInTheDocument()
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument()
  })

  it('moves focus to the download link and announces completion', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Your PDF is ready')
  })

  it('announces errors with an alert', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.reject(new ExportError('failed'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Something went wrong/)
    })
  })

  it('treats an AbortError as a quiet return to the summary', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.reject(new DOMException('aborted', 'AbortError'))
      await Promise.resolve()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retries after an error', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.reject(new ExportError('failed'))
      await Promise.resolve()
    })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mockedExport).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Page 1 of 2…')).toBeInTheDocument()
  })

  it('revokes the object URL on close and on unmount', async () => {
    const run = deferredExport()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')

    revokeObjectURL.mockClear()
    const run2 = deferredExport()
    const second = render(
      <ExportDialog
        open
        onOpenChange={vi.fn()}
        pages={pages}
        paperLabel="A4"
        getSource={() => undefined}
      />,
    )
    const button = screen.getAllByRole('button', { name: 'Create PDF' }).at(-1)
    if (!button) throw new Error('no Create PDF button')
    await user.click(button)
    await act(async () => {
      run2.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    second.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('cancels and resets when the parent closes it', async () => {
    const run = deferredExport()
    const onOpenChange = vi.fn()
    const props = { onOpenChange, pages, paperLabel: 'A4', getSource: () => undefined }
    const view = render(<ExportDialog open {...props} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create PDF' }))
    view.rerender(<ExportDialog open={false} {...props} />)
    expect(run.options().signal?.aborted).toBe(true)
    view.rerender(<ExportDialog open {...props} />)
    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeInTheDocument()
  })

  it('explains why Create PDF is disabled with no pages', () => {
    render(
      <ExportDialog
        open
        onOpenChange={vi.fn()}
        pages={[]}
        paperLabel="A4"
        getSource={() => undefined}
      />,
    )
    expect(screen.getByText('Add at least one image to export.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeDisabled()
  })

  describe('focus moves', () => {
    it('focuses Cancel when the export starts and Create PDF after cancelling', async () => {
      deferredExport()
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Create PDF' }))
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('button', { name: 'Create PDF' })).toHaveFocus()
    })

    it('focuses Create PDF after Make another', async () => {
      const run = deferredExport()
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Create PDF' }))
      await act(async () => {
        run.resolve(new Blob(['%PDF']))
        await Promise.resolve()
      })
      await user.click(screen.getByRole('button', { name: 'Make another' }))
      expect(screen.getByRole('button', { name: 'Create PDF' })).toHaveFocus()
    })

    it('focuses Try again after a failure', async () => {
      const run = deferredExport()
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Create PDF' }))
      await act(async () => {
        run.reject(new ExportError('failed'))
        await Promise.resolve()
      })
      expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus()
    })
  })

  it('announces progress through a live region that is mounted before the export starts', async () => {
    deferredExport()
    const { user } = setup()
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('')
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Page 1 of 2…')
  })
})
