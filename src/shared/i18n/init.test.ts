import { readFileSync } from 'node:fs'
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import { initI18n } from './init'
import { ENDONYMS, LANGUAGES, NAMESPACES, OG_LOCALES } from './languages'

describe('initI18n', () => {
  it('serves English strings from every namespace file', async () => {
    const i18n = await initI18n({ language: 'en' })
    expect(i18n.language).toBe('en')
    expect(i18n.t('common:app.comingSoon')).toBe('The workspace is coming soon.')
    expect(i18n.t('errors:generic.unexpected')).toBe('Something went wrong. Please try again.')
    for (const ns of NAMESPACES) expect(i18n.hasResourceBundle('en', ns)).toBe(true)
  })

  it('is idempotent', async () => {
    const a = await initI18n({ language: 'en' })
    const b = await initI18n()
    expect(b).toBe(a)
    expect(b).toBe(i18next)
  })

  it('keeps English when the resolved language has no strings to load', async () => {
    const i18n = await initI18n({ language: 'ja' })
    expect(i18n.language).toBe('en')
    expect(i18n.t('common:actions.close')).toBe('Close')
  })

  it('falls back to English for a language that is not supported at all', async () => {
    const i18n = await initI18n({ language: 'en' })
    await i18n.changeLanguage('fr')
    expect(i18n.t('common:actions.close')).toBe('Close')
    await i18n.changeLanguage('en')
  })

  it('no longer reads navigator through the detector', () => {
    const source = readFileSync(new URL('./init.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('i18next-browser-languagedetector')
    expect(source).not.toContain('navigator')
  })

  it('lists the seven planned languages', () => {
    expect(LANGUAGES).toEqual(['en', 'pt-BR', 'ja', 'ko', 'it', 'es', 'zh-CN'])
  })

  it('names each language in its own language (owner Q17) and maps og:locale (M6-R2)', () => {
    expect(LANGUAGES.map((code) => ENDONYMS[code])).toEqual([
      'English',
      'Português (Brasil)',
      '日本語',
      '한국어',
      'Italiano',
      'Español',
      '简体中文',
    ])
    expect(LANGUAGES.map((code) => OG_LOCALES[code])).toEqual([
      'en_US',
      'pt_BR',
      'ja_JP',
      'ko_KR',
      'it_IT',
      'es_LA',
      'zh_CN',
    ])
  })
})
