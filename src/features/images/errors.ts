import type { ImportErrorCode } from './types'

export class ImportFailure extends Error {
  readonly code: ImportErrorCode
  constructor(code: ImportErrorCode, options?: ErrorOptions) {
    super(code, options)
    this.name = 'ImportFailure'
    this.code = code
  }
}

const camel = (code: string): string =>
  code.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())

/** i18n keys (with namespace prefix) for an error code. Codes are kebab-case, keys are camelCase. */
export function importErrorKeys(code: ImportErrorCode): { title: string; message: string } {
  const base = `errors:images.${camel(code)}`
  return { title: `${base}.title`, message: `${base}.message` }
}

export function toImportErrorCode(e: unknown): ImportErrorCode {
  if (e instanceof ImportFailure) return e.code
  if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
    return 'network'
  }
  return 'decode-failed'
}
