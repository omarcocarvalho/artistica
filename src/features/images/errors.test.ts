import { describe, expect, it } from 'vitest'
import errors from '../../locales/en/errors.json'
import { ImportFailure, importErrorKeys, toImportErrorCode } from './errors'
import { IMPORT_ERROR_CODES } from './types'

describe('importErrorKeys', () => {
  it('maps kebab-case codes to camelCase keys in the errors namespace', () => {
    expect(importErrorKeys('not-an-image')).toEqual({
      title: 'errors:images.notAnImage.title',
      message: 'errors:images.notAnImage.message',
    })
    expect(importErrorKeys('cors').title).toBe('errors:images.cors.title')
  })

  it('has a title and a message in errors.json for every code', () => {
    const group = errors.images as Record<string, { title?: string; message?: string }>
    for (const code of IMPORT_ERROR_CODES) {
      const key = importErrorKeys(code).title.split('.')[1] ?? ''
      expect(group[key]?.title, code).toBeTruthy()
      expect(group[key]?.message, code).toBeTruthy()
    }
  })

  it('uses the exact spec message for CORS', () => {
    expect(errors.images.cors.message).toBe(
      "This site doesn't allow other apps to read its images. Download it and upload it instead.",
    )
  })
})

describe('toImportErrorCode', () => {
  it('keeps the code of an ImportFailure', () => {
    expect(toImportErrorCode(new ImportFailure('cors'))).toBe('cors')
  })
  it('treats abort and timeout as network', () => {
    expect(toImportErrorCode(new DOMException('x', 'AbortError'))).toBe('network')
    expect(toImportErrorCode(new DOMException('x', 'TimeoutError'))).toBe('network')
  })
  it('falls back to decode-failed for anything else', () => {
    expect(toImportErrorCode(new Error('boom'))).toBe('decode-failed')
    expect(toImportErrorCode('weird')).toBe('decode-failed')
  })
})
