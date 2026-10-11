import i18next from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { initI18n } from './init'

const gates = vi.hoisted(() => {
  function deferred() {
    let resolve: (value: Record<string, unknown>) => void = () => undefined
    let reject: (reason: unknown) => void = () => undefined
    const promise = new Promise<Record<string, unknown>>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
  return { ja: deferred(), ko: deferred() }
})

vi.mock('./load', async (importOriginal) => {
  const real = await importOriginal<typeof import('./load')>()
  const loader = real.createLanguageLoader(i18next, {
    ja: { common: () => gates.ja.promise },
    ko: { common: () => gates.ko.promise },
  })
  return { ...real, ...loader }
})

async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false
  void promise.then(
    () => (done = true),
    () => (done = true),
  )
  for (let i = 0; i < 10; i++) await Promise.resolve()
  return done
}

describe('initI18n with the resolved language (M6-R5)', () => {
  it('keeps English when the language fails to load', async () => {
    const init = initI18n({ language: 'ko' })
    gates.ko.reject(new Error('chunk failed'))
    const i18n = await init
    expect(i18n.language).toBe('en')
    expect(i18n.t('common:actions.close')).toBe('Close')
  })

  it('resolves only once the strings are loaded, then shows the language', async () => {
    const init = initI18n({ language: 'ja' })
    expect(await settled(init)).toBe(false)
    expect(i18next.language).toBe('en')
    gates.ja.resolve({ actions: { close: '閉じる' } })
    const i18n = await init
    expect(i18n.language).toBe('ja')
    expect(i18n.t('common:actions.close')).toBe('閉じる')
  })
})
