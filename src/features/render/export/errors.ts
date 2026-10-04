/** Why an export failed. Each code maps to `errors:export.<key>` via EXPORT_ERROR_KEYS. */
export type ExportErrorCode = 'unsupported' | 'missing-image' | 'empty' | 'failed'

export const EXPORT_ERROR_KEYS: Readonly<Record<ExportErrorCode, string>> = {
  unsupported: 'errors:export.unsupported',
  'missing-image': 'errors:export.missingImage',
  empty: 'errors:export.empty',
  failed: 'errors:export.failed',
}

export class ExportError extends Error {
  readonly code: ExportErrorCode
  constructor(code: ExportErrorCode, options?: ErrorOptions) {
    super(`export:${code}`, options)
    this.name = 'ExportError'
    this.code = code
  }
}

const CODE_IN_MESSAGE = /^export:(unsupported|missing-image|empty|failed)\b/

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/**
 * Normalise anything thrown during export. Comlink re-creates worker errors as plain Errors
 * (class and extra fields are lost), so worker code encodes the code in the message: "export:<code>".
 */
export function toExportError(e: unknown): ExportError {
  if (e instanceof ExportError) return e
  if (e instanceof Error) {
    const match = CODE_IN_MESSAGE.exec(e.message)
    if (match?.[1]) return new ExportError(match[1] as ExportErrorCode, { cause: e })
  }
  return new ExportError('failed', { cause: e })
}
