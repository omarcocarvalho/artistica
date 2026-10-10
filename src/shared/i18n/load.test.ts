import i18next, { type i18n as I18nInstance } from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { createLanguageLoader, groupLoaders, type LocaleLoader } from './load'

async function freshI18n(): Promise<I18nInstance> {
  const i18n = i18next.createInstance()
  await i18n.init({
    resources: { en: { common: { hello: 'Hello' }, app: { title: 'App' } } },
    lng: 'en',
    fallbackLng: 'en',
    ns: ['common', 'app'],
    defaultNS: 'common',
    initAsync: false,
  })
  return i18n
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('groupLoaders', () => {
  it('groups glob entries by language and namespace', () => {
    const a: LocaleLoader = () => Promise.resolve({})
    const b: LocaleLoader = () => Promise.resolve({})
    const c: LocaleLoader = () => Promise.resolve({})
    expect(
      groupLoaders({
        '../../locales/ja/common.json': a,
        '../../locales/ja/app.json': b,
        '../../locales/pt-BR/common.json': c,
        '../../locales/xx/common.json': c,
        './unrelated.json': c,
      }),
    ).toEqual({ ja: { common: a, app: b }, 'pt-BR': { common: c } })
  })
})

describe('availableLanguages', () => {
  it('lists English plus each language with a loader, in LANGUAGES order', async () => {
    const i18n = await freshI18n()
    const loader: LocaleLoader = () => Promise.resolve({})
    const { availableLanguages } = createLanguageLoader(i18n, {
      'zh-CN': { common: loader },
      ja: { common: loader },
    })
    expect(availableLanguages()).toEqual(['en', 'ja', 'zh-CN'])
    expect(createLanguageLoader(i18n, {}).availableLanguages()).toEqual(['en'])
  })
})

describe('loadLanguage', () => {
  it('adds every namespace before resolving', async () => {
    const i18n = await freshI18n()
    const common = deferred<Record<string, unknown>>()
    const app = deferred<Record<string, unknown>>()
    const { loadLanguage } = createLanguageLoader(i18n, {
      ja: { common: () => common.promise, app: () => app.promise },
    })
    let done = false
    const loading = loadLanguage('ja').then(() => {
      done = true
    })
    common.resolve({ hello: 'こんにちは' })
    await Promise.resolve()
    expect(done).toBe(false)
    expect(i18n.hasResourceBundle('ja', 'common')).toBe(false)
    app.resolve({ title: 'アプリ' })
    await loading
    expect(i18n.getResource('ja', 'common', 'hello')).toBe('こんにちは')
    expect(i18n.getResource('ja', 'app', 'title')).toBe('アプリ')
  })

  it('is idempotent: each loader is called once', async () => {
    const i18n = await freshI18n()
    const common = vi.fn<LocaleLoader>(() => Promise.resolve({ hello: 'Ciao' }))
    const { loadLanguage } = createLanguageLoader(i18n, { it: { common } })
    await Promise.all([loadLanguage('it'), loadLanguage('it')])
    await loadLanguage('it')
    expect(common).toHaveBeenCalledOnce()
  })

  it('resolves at once for en without calling any loader', async () => {
    const i18n = await freshI18n()
    const loader = vi.fn<LocaleLoader>(() => Promise.resolve({}))
    const { loadLanguage } = createLanguageLoader(i18n, { ja: { common: loader } })
    await expect(loadLanguage('en')).resolves.toBeUndefined()
    expect(loader).not.toHaveBeenCalled()
  })

  it('rejects when a chunk fails, adds nothing, and tries again next time', async () => {
    const i18n = await freshI18n()
    const app = vi
      .fn<LocaleLoader>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValue({ title: 'App (ko)' })
    const { loadLanguage } = createLanguageLoader(i18n, {
      ko: { common: () => Promise.resolve({ hello: '안녕하세요' }), app },
    })
    await expect(loadLanguage('ko')).rejects.toThrow('chunk failed')
    expect(i18n.hasResourceBundle('ko', 'common')).toBe(false)
    await loadLanguage('ko')
    expect(i18n.getResource('ko', 'app', 'title')).toBe('App (ko)')
    expect(app).toHaveBeenCalledTimes(2)
  })

  it('rejects for a language without strings', async () => {
    const i18n = await freshI18n()
    await expect(createLanguageLoader(i18n, {}).loadLanguage('es')).rejects.toThrow()
  })
})

describe('setAppLanguage', () => {
  it('changes the language only after the load', async () => {
    const i18n = await freshI18n()
    const events: string[] = []
    const original = i18n.addResourceBundle.bind(i18n)
    vi.spyOn(i18n, 'addResourceBundle').mockImplementation((lng, ns, ...rest) => {
      events.push(`add ${lng}/${ns}`)
      return original(lng, ns, ...rest)
    })
    i18n.on('languageChanged', (lng: string) => events.push(`changed ${lng}`))
    const { setAppLanguage } = createLanguageLoader(i18n, {
      es: {
        common: () => Promise.resolve({ hello: 'Hola' }),
        app: () => Promise.resolve({ title: 'Aplicación' }),
      },
    })
    await expect(setAppLanguage('es')).resolves.toBe('changed')
    expect(events).toEqual(['add es/common', 'add es/app', 'changed es'])
    expect(i18n.language).toBe('es')
    expect(i18n.t('hello')).toBe('Hola')
  })

  it("returns 'failed' and keeps the language when the load fails", async () => {
    const i18n = await freshI18n()
    const changed = vi.fn()
    i18n.on('languageChanged', changed)
    const { setAppLanguage } = createLanguageLoader(i18n, {
      ja: { common: () => Promise.reject(new Error('offline')) },
    })
    await expect(setAppLanguage('ja')).resolves.toBe('failed')
    expect(i18n.language).toBe('en')
    expect(changed).not.toHaveBeenCalled()
  })

  it('switches back to English without a load', async () => {
    const i18n = await freshI18n()
    const { setAppLanguage } = createLanguageLoader(i18n, {
      it: { common: () => Promise.resolve({ hello: 'Ciao' }) },
    })
    await setAppLanguage('it')
    await expect(setAppLanguage('en')).resolves.toBe('changed')
    expect(i18n.t('hello')).toBe('Hello')
  })
})
