import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { APP_NAME, pageTitle } from './app-info'

describe('pageTitle', () => {
  it('is just the app name when no section is given', () => {
    expect(pageTitle()).toBe('Artistica')
    expect(APP_NAME).toBe('Artistica')
  })

  it('prefixes the trimmed section name', () => {
    expect(pageTitle('  App ')).toBe('App · Artistica')
  })

  it('ignores whitespace-only sections', () => {
    expect(pageTitle('   ')).toBe('Artistica')
  })

  it('always ends with the app name (property)', () => {
    fc.assert(
      fc.property(fc.string(), (section) => {
        expect(pageTitle(section).endsWith(APP_NAME)).toBe(true)
      }),
    )
  })
})
