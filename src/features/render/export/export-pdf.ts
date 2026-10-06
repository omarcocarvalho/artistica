import { releaseProxy, transfer, wrap } from 'comlink'
import type { PageModel } from '../types'
import { ExportError, isAbortError, toExportError } from './errors'
import { runExport, type ExportOptions, type ExportWorkerApi, type GetSource } from './run-export'

/**
 * Export pages to a PDF Blob in a dedicated module worker (one worker per export, terminated at the
 * end, so all its memory is returned at once — important on phones).
 * Rejects with an AbortError when `signal` aborts, otherwise with an ExportError.
 */
/* v8 ignore start -- browser-only Worker wiring; the logic it drives (runExport, createExportWorkerApi) is unit-tested and E's E2E exports a real PDF. Keep this wrapper minimal. */
export async function exportPdf(
  pages: readonly PageModel[],
  getSource: GetSource,
  options: ExportOptions = {},
): Promise<Blob> {
  const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  const api = wrap<ExportWorkerApi>(worker)
  let crash: (e: ExportError) => void = () => undefined
  const crashed = new Promise<never>((_, reject) => {
    crash = reject
    worker.addEventListener('error', (e) => {
      reject(new ExportError('failed', { cause: e }))
    })
  })
  worker.addEventListener('messageerror', (e) => {
    crash(new ExportError('failed', { cause: e }))
  })
  void crashed.catch(() => undefined)
  try {
    const bytes = await runExport(pages, getSource, options, {
      api,
      cropBitmap: (bitmap, r) => createImageBitmap(bitmap, r.x, r.y, r.w, r.h),
      transfer,
      crashed,
    })
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  } catch (e) {
    if (isAbortError(e)) throw e
    throw toExportError(e)
  } finally {
    api[releaseProxy]()
    worker.terminate()
  }
}
/* v8 ignore stop */
