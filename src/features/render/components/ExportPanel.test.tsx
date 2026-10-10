import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { PT_BR, switchLanguage } from '../../../test/languages'
import { useSettings } from '../../settings'
import { exportPdf } from '../export/export-pdf'
import type { ExportOptions } from '../export/run-export'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { ExportPanel } from './ExportPanel'

vi.mock('../export/export-pdf', () => ({ exportPdf: vi.fn() }))
const mockedExport = vi.mocked(exportPdf)

const createObjectURL = vi.fn(() => 'blob:test')
const revokeObjectURL = vi.fn()

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0))
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
  pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('b') })]),
  pageModel([drawTile({ imageId: id('c') })], { index: 1 }),
]

function deferredExport() {
  let resolve: (b: Blob) => void = () => undefined
  let options: ExportOptions = {}
  mockedExport.mockImplementation((_p, _g, opts = {}) => {
    options = opts
    return new Promise<Blob>((res) => {
      resolve = res
    })
  })
  return {
    resolve: (b: Blob) => {
      resolve(b)
    },
    options: () => options,
  }
}

const base = { pages, paperLabel: 'A4', getSource: () => undefined }

describe('ExportPanel (inline)', () => {
  it('renders the summary, the file name and Create PDF without a dialog', () => {
    render(<ExportPanel {...base} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('2 · A4 portrait')).toBeInTheDocument()
    expect(screen.getByText('3 from 3 images')).toBeInTheDocument()
    expect(screen.getByLabelText('File name')).toHaveValue('artistica-A4-2026-10-10.pdf')
    expect(screen.getAllByRole('button', { name: 'Create PDF' })).toHaveLength(1)
  })

  it('starts the export with one press, then offers the download in place', async () => {
    const run = deferredExport()
    render(<ExportPanel {...base} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create PDF' }))
    expect(mockedExport).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('progressbar', { name: 'PDF progress' })).toBeInTheDocument()
    await act(async () => {
      run.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'download',
      'artistica-A4-2026-10-10.pdf',
    )
    expect(screen.getByText('Print at 100%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make another' })).toBeInTheDocument()
  })

  it('unmounting while running aborts the export and never creates an object URL', async () => {
    const run = deferredExport()
    const view = render(<ExportPanel {...base} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create PDF' }))
    view.unmount()
    expect(run.options().signal?.aborted).toBe(true)
    await act(async () => {
      run.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('revokes the object URL when unmounted after a finished export', async () => {
    const run = deferredExport()
    const view = render(<ExportPanel {...base} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create PDF' }))
    await act(async () => {
      run.resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    view.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  describe('with a reason Create PDF is unavailable', () => {
    const reason = 'The layout is updating. Export is available in a moment.'

    it('keeps Create PDF focusable, shows the reason as text under it and ignores presses', async () => {
      render(<ExportPanel {...base} unavailableReason={reason} />)
      const create = screen.getByRole('button', { name: 'Create PDF' })
      expect(create).toHaveAttribute('aria-disabled', 'true')
      expect(create).not.toBeDisabled()
      expect(create).toHaveAccessibleDescription(reason)
      const text = screen.getByText(reason)
      expect(text).toBeVisible()
      expect(create.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      await userEvent.setup().click(create)
      expect(mockedExport).not.toHaveBeenCalled()
    })

    it('says it once, without the panel’s own empty-pages note', () => {
      render(
        <ExportPanel {...base} pages={[]} unavailableReason="Add at least one image to export." />,
      )
      expect(screen.getAllByText('Add at least one image to export.')).toHaveLength(1)
    })

    it('becomes available in place when the reason goes', async () => {
      deferredExport()
      const view = render(<ExportPanel {...base} unavailableReason={reason} />)
      view.rerender(<ExportPanel {...base} unavailableReason={null} />)
      const create = screen.getByRole('button', { name: 'Create PDF' })
      expect(create).not.toHaveAttribute('aria-disabled')
      expect(screen.queryByText(reason)).not.toBeInTheDocument()
      await userEvent.setup().click(create)
      expect(mockedExport).toHaveBeenCalledTimes(1)
    })
  })
})

describe('ExportPanel in other languages', () => {
  afterAll(async () => {
    await switchLanguage('en')
  })

  it('shows the bleed with the language decimal separator and unit symbol', async () => {
    useSettings.getState().setUnit('mm')
    const bled = [pageModel([drawTile({ bleedMm: 3.5 })])]
    await switchLanguage('pt-BR', PT_BR)
    const view = render(<ExportPanel {...base} pages={bled} />)
    expect(screen.getByText('3,5 mm')).toBeInTheDocument()
    view.unmount()
    await switchLanguage('zh-CN')
    render(<ExportPanel {...base} pages={bled} />)
    expect(screen.getByText('3.5毫米')).toBeInTheDocument()
  })
})
