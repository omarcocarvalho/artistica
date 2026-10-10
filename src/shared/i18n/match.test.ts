import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, type LanguageCode } from './languages'
import { matchLanguage, resolveLanguage } from './match'

describe('matchLanguage', () => {
  it.each<[string, LanguageCode | null]>([
    ['pt', 'pt-BR'],
    ['pt-BR', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['PT_br', 'pt-BR'],
    ['es', 'es'],
    ['es-MX', 'es'],
    ['es-419', 'es'],
    ['it', 'it'],
    ['it-CH', 'it'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['ko', 'ko'],
    ['ko-KR', 'ko'],
    ['en', 'en'],
    ['en-GB', 'en'],
    ['EN-us', 'en'],
    ['zh', 'zh-CN'],
    ['zh-CN', 'zh-CN'],
    ['zh_cn', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-Hans', 'zh-CN'],
    ['zh-Hans-CN', 'zh-CN'],
    ['zh-Hans-HK', 'zh-CN'],
    ['zh-TW', null],
    ['zh-HK', null],
    ['zh-MO', null],
    ['zh-Hant', null],
    ['zh-Hant-TW', null],
    ['fr', null],
    ['de-DE', null],
    ['ptx', null],
    ['english', null],
    ['', null],
  ])('maps every tag of M6-R4: %j → %j', (tag, expected) => {
    expect(matchLanguage([tag])).toBe(expected)
  })

  it('walks the list in order', () => {
    expect(matchLanguage(['zh-TW', 'ja'])).toBe('ja')
    expect(matchLanguage(['ko', 'ja'])).toBe('ko')
    expect(matchLanguage(['fr', 'de'])).toBeNull()
    expect(matchLanguage([])).toBeNull()
  })
})

const ALL = LANGUAGES

describe('resolveLanguage', () => {
  it.each<
    [
      string,
      { saved: LanguageCode | null; hint: string | null; browser: string[] },
      readonly LanguageCode[],
      LanguageCode,
    ]
  >([
    ['saved beats hint', { saved: 'ko', hint: 'ja', browser: ['es'] }, ALL, 'ko'],
    ['hint beats browser', { saved: null, hint: 'ja', browser: ['es'] }, ALL, 'ja'],
    ['browser beats English', { saved: null, hint: null, browser: ['es-MX'] }, ALL, 'es'],
    ['English last', { saved: null, hint: null, browser: ['fr'] }, ALL, 'en'],
    ['no browser languages', { saved: null, hint: null, browser: [] }, ALL, 'en'],
    ['an invalid hint is ignored', { saved: null, hint: 'xx', browser: ['it'] }, ALL, 'it'],
    ['the hint is an exact code', { saved: null, hint: 'pt', browser: ['it'] }, ALL, 'it'],
    ['the hint is case-sensitive', { saved: null, hint: 'JA', browser: [] }, ALL, 'en'],
    ['an empty hint is ignored', { saved: null, hint: '', browser: ['ko'] }, ALL, 'ko'],
    ['zh-TW falls through', { saved: null, hint: null, browser: ['zh-TW', 'ja'] }, ALL, 'ja'],
    ['zh-TW alone gives English', { saved: null, hint: null, browser: ['zh-TW'] }, ALL, 'en'],
    [
      'a browser match without strings is skipped',
      { saved: null, hint: null, browser: ['pt-BR', 'it'] },
      ['en', 'it'],
      'it',
    ],
    [
      'a pt-BR browser gets English while only English has strings',
      { saved: null, hint: null, browser: ['pt-BR'] },
      ['en'],
      'en',
    ],
    [
      'a hint without strings is skipped',
      { saved: null, hint: 'ja', browser: ['it'] },
      ['en', 'it'],
      'it',
    ],
    [
      'a saved language without strings is skipped',
      { saved: 'ja', hint: null, browser: ['it'] },
      ['en', 'it'],
      'it',
    ],
    ['English always has strings', { saved: null, hint: null, browser: ['en-GB'] }, [], 'en'],
  ])('%s', (_name, input, available, expected) => {
    expect(resolveLanguage({ ...input, available })).toBe(expected)
  })

  const code = fc.constantFrom(...LANGUAGES)
  const tag = fc.oneof(fc.string(), code, fc.constantFrom('pt-PT', 'zh-TW', 'zh-Hans', 'es-419'))
  const input = fc.record({
    saved: fc.option(code, { nil: null }),
    hint: fc.option(fc.oneof(fc.string(), code), { nil: null }),
    browser: fc.array(tag, { maxLength: 5 }),
    available: fc.subarray([...LANGUAGES]),
  })

  it('always returns a language with strings (or English)', () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = resolveLanguage(i)
        expect(LANGUAGES).toContain(result)
        expect([...i.available, 'en']).toContain(result)
      }),
    )
  })

  it('returns a saved language that has strings, whatever the hint and browser say', () => {
    fc.assert(
      fc.property(input, code, (i, saved) => {
        expect(resolveLanguage({ ...i, saved, available: [...i.available, saved] })).toBe(saved)
      }),
    )
  })

  it('ignores a hint that is not a language code', () => {
    fc.assert(
      fc.property(
        input,
        fc.string().filter((s) => !(LANGUAGES as readonly string[]).includes(s)),
        (i, hint) => {
          expect(resolveLanguage({ ...i, hint })).toBe(resolveLanguage({ ...i, hint: null }))
        },
      ),
    )
  })
})
