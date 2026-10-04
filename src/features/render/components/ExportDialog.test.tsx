import { act, render, screen } from '@testing-library/react'
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
      getBitmap={() => undefined}
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
    expect(screen.getByText(/can't make PDFs/)).toBeInTheDocument()
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
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
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
})
