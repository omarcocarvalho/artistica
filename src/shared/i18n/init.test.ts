import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from './init'
import { LANGUAGES, NAMESPACES } from './languages'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('initI18n', () => {
  it('serves English strings from every namespace file', async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    expect(i18n.t('common:app.comingSoon')).toBe('The workspace is coming soon.')
    expect(i18n.t('errors:generic.unexpected')).toBe('Something went wrong. Please try again.')
    for (const ns of NAMESPACES) expect(i18n.hasResourceBundle('en', ns)).toBe(true)
  })

  it('is idempotent', async () => {
    const a = await initI18n({ savedLanguage: 'en' })
    const b = await initI18n()
    expect(b).toBe(a)
    expect(b).toBe(i18next)
  })

  it('falls back to English for a saved language without resources', async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    await i18n.changeLanguage('ja')
    expect(i18n.t('common:actions.close')).toBe('Close')
    await i18n.changeLanguage('en')
  })

  it('falls back to English for a language that is not supported at all', async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    await i18n.changeLanguage('fr')
    expect(i18n.t('common:actions.close')).toBe('Close')
    await i18n.changeLanguage('en')
  })

  it('lists the seven planned languages', () => {
    expect(LANGUAGES).toEqual(['en', 'pt-BR', 'ja', 'ko', 'it', 'es', 'zh-CN'])
  })
})
