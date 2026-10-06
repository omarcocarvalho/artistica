import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { exportPdf } from '../export/export-pdf'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { ExportDialog } from './ExportDialog'

vi.mock('../export/export-pdf', () => ({ exportPdf: vi.fn() }))

// A plain container, so closing the dialog commits without overlay layout effects that would
// flush the passive effects of the closing render early.
vi.mock('../../../shared/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof import('../../../shared/ui')>()
  return {
    ...ui,
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
  }
})

const createObjectURL = vi.fn(() => 'blob:test')
const revokeObjectURL = vi.fn()
const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
let actEnvironment: boolean | undefined

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  actEnvironment = env.IS_REACT_ACT_ENVIRONMENT
  env.IS_REACT_ACT_ENVIRONMENT = false
})

afterEach(() => {
  env.IS_REACT_ACT_ENVIRONMENT = actEnvironment
})

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 20)
  })

it('never creates an object URL for an export that finishes in the render that closes the dialog', async () => {
  let resolveExport: (blob: Blob) => void = () => undefined
  vi.mocked(exportPdf).mockImplementation(
    () =>
      new Promise<Blob>((resolve) => {
        resolveExport = resolve
      }),
  )
  const pages = [pageModel([drawTile({ imageId: id('a') })])]
  function Parent({ open }: { open: boolean }) {
    useLayoutEffect(() => {
      if (!open) resolveExport(new Blob(['%PDF']))
    }, [open])
    return (
      <ExportDialog
        open={open}
        onOpenChange={() => undefined}
        pages={pages}
        paperLabel="A4"
        getSource={() => undefined}
      />
    )
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    root.render(<Parent open />)
    await tick()
    screen.getByRole('button', { name: 'Create PDF' }).click()
    await tick()
    expect(exportPdf).toHaveBeenCalledTimes(1)
    root.render(<Parent open={false} />)
    await tick()
    expect(createObjectURL).not.toHaveBeenCalled()
  } finally {
    root.unmount()
    host.remove()
  }
})
