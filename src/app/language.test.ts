// @vitest-environment happy-dom
import i18next, { type i18n as I18nInstance } from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { installDocumentLanguage, readLangHint } from './language'

function at(url: string): { location: Location; history: History } {
  window.history.replaceState({ keep: 1 }, '', url)
  return { location: window.location, history: window.history }
}

describe('readLangHint', () => {
  it('returns the ?lang value and removes it with replaceState, keeping other params and the hash', () => {
    const { location, history } = at('/artistica/app/?a=1&lang=ja&b=2#tools')
    const replace = vi.spyOn(history, 'replaceState')
    expect(readLangHint(location, history)).toBe('ja')
    expect(replace).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/artistica/app/')
    expect(window.location.search).toBe('?a=1&b=2')
    expect(window.location.hash).toBe('#tools')
    expect(history.state).toEqual({ keep: 1 })
    replace.mockRestore()
  })

  it('leaves no stray ? when lang was the only parameter', () => {
    const { location, history } = at('/artistica/app/?lang=xx')
    expect(readLangHint(location, history)).toBe('xx')
    expect(window.location.href).toBe(`${window.location.origin}/artistica/app/`)
  })

  it('returns null and leaves the address alone without ?lang', () => {
    const { location, history } = at('/artistica/app/?a=1#x')
    const replace = vi.spyOn(history, 'replaceState')
    expect(readLangHint(location, history)).toBeNull()
    expect(replace).not.toHaveBeenCalled()
    replace.mockRestore()
  })
})

async function i18nWithTitles(): Promise<I18nInstance> {
  const i18n = i18next.createInstance()
  await i18n.init({
    resources: {
      en: { app: { documentTitle: 'Artistica app' } },
      ja: { app: { documentTitle: 'Artistica アプリ' } },
    },
    lng: 'en',
    fallbackLng: 'en',
    ns: ['app'],
    initAsync: false,
  })
  return i18n
}

describe('installDocumentLanguage', () => {
  it('sets lang, dir and the translated title now and on every change', async () => {
    const i18n = await i18nWithTitles()
    const html = document.documentElement
    html.lang = 'xx'
    html.dir = 'rtl'
    document.title = 'old'
    const uninstall = installDocumentLanguage(i18n, document)
    expect([html.lang, html.dir, document.title]).toEqual(['en', 'ltr', 'Artistica app'])

    await i18n.changeLanguage('ja')
    expect([html.lang, html.dir, document.title]).toEqual(['ja', 'ltr', 'Artistica アプリ'])

    await i18n.changeLanguage('ar')
    expect([html.lang, html.dir, document.title]).toEqual(['ar', 'rtl', 'Artistica app'])

    uninstall()
    await i18n.changeLanguage('en')
    expect(html.lang).toBe('ar')
  })
})
