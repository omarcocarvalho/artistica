import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  checkLocales,
  hashOf,
  intlPluralCategories,
  readLocales,
  SAME_AS_ENGLISH,
  stamp,
  type LocaleProblem,
  type LocaleTree,
} from './check-locales.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = fileURLToPath(new URL('./__fixtures__/locales/', import.meta.url))

function checkFixture(name: string) {
  return checkLocales({
    ...readLocales(join(FIXTURES, name)),
    pluralCategories: intlPluralCategories,
  })
}

const problem = (
  lang: string,
  file: string,
  key: string,
  kind: LocaleProblem['kind'],
): LocaleProblem => ({ lang, file, key, kind })

describe('checkLocales on the fixtures (one per problem kind)', () => {
  it('passes a complete, stamped set, with _zero forms in pt-BR and ja', () => {
    expect(checkFixture('ok')).toEqual({ problems: [], sameAsEnglish: [] })
  })

  it.each<[string, LocaleProblem[]]>([
    ['missing-file', [problem('pt-BR', 'common', '', 'missing-file')]],
    ['extra-file', [problem('pt-BR', 'extra', '', 'extra-file')]],
    ['missing', [problem('pt-BR', 'app', 'greeting', 'missing')]],
    ['extra', [problem('pt-BR', 'app', 'bonus', 'extra')]],
    [
      'empty',
      [problem('pt-BR', 'app', 'title', 'empty'), problem('pt-BR', 'app', 'greeting', 'empty')],
    ],
    [
      'variables',
      [
        problem('pt-BR', 'app', 'greeting', 'variables'),
        problem('pt-BR', 'app', 'farewell', 'variables'),
        problem('pt-BR', 'app', 'count_other', 'variables'),
      ],
    ],
    [
      'tags',
      [problem('pt-BR', 'app', 'forImage', 'tags'), problem('pt-BR', 'app', 'help', 'tags')],
    ],
    ['plural-missing', [problem('pt-BR', 'app', 'count_many', 'plural-missing')]],
    ['plural-extra', [problem('ja', 'app', 'count_one', 'plural-extra')]],
    [
      'stale',
      [problem('pt-BR', 'app', 'title', 'stale'), problem('pt-BR', 'app', 'greeting', 'stale')],
    ],
    [
      'landing',
      [
        problem('pt-BR', 'landing', 'hero.leadHtml', 'tags'),
        problem('pt-BR', 'landing', 'cta', 'missing'),
      ],
    ],
  ])('finds exactly the problems of %s', (name, expected) => {
    expect(checkFixture(name).problems).toEqual(expected)
  })

  it('reads the landing locales only when the folder exists', () => {
    expect(Object.keys(readLocales(join(FIXTURES, 'ok')).en)).toEqual(['app', 'common'])
    expect(Object.keys(readLocales(join(FIXTURES, 'landing')).en)).toEqual([
      'app',
      'common',
      'landing',
    ])
  })
})

describe('checkLocales plural rules', () => {
  const en: LocaleTree = { ns: { n_one: '{{count}} cat', n_other: '{{count}} cats' } }
  const fake = (lang: string) => (lang === 'xx' ? ['one', 'few', 'other'] : ['other'])
  const run = (others: Record<string, LocaleTree>) =>
    checkLocales({
      en,
      others,
      stamps: Object.fromEntries(Object.keys(others).map((l) => [l, stamp(en, l)[l] ?? {}])),
      pluralCategories: fake,
    }).problems

  it('requires exactly the categories the plural rules list, plus an optional _zero', () => {
    expect(
      run({
        xx: { ns: { n_one: '{{count}} a', n_many: '{{count}} b', n_other: '{{count}} c' } },
        yy: { ns: { n_zero: 'none', n_other: '{{count}} d' } },
      }),
    ).toEqual([
      problem('xx', 'ns', 'n_few', 'plural-missing'),
      problem('xx', 'ns', 'n_many', 'plural-extra'),
    ])
  })

  it('reads the categories from Intl.PluralRules by default', () => {
    expect(intlPluralCategories('en')).toEqual(['one', 'other'])
    expect([...intlPluralCategories('pt-BR')].sort()).toEqual(['many', 'one', 'other'])
    expect(intlPluralCategories('ja')).toEqual(['other'])
  })

  it('compares a form English lacks with English _other, and lets only _zero drop count', () => {
    expect(
      run({
        yy: { ns: { n_zero: '{{count}} zero {{extra}}', n_other: 'no count here' } },
      }),
    ).toEqual([
      problem('yy', 'ns', 'n_zero', 'variables'),
      problem('yy', 'ns', 'n_other', 'variables'),
    ])
  })

  it('treats a plain key where English has plurals as extra, and the forms as missing', () => {
    expect(run({ yy: { ns: { n: '{{count}} cats' } } })).toEqual([
      problem('yy', 'ns', 'n', 'extra'),
      problem('yy', 'ns', 'n_other', 'plural-missing'),
    ])
  })
})

describe('checkLocales variables and tags', () => {
  const en: LocaleTree = { ns: { a: 'Hi {{name}}, {{count, number}} new', b: 'Lines for <name/>' } }
  const run = (a: string, b = 'Linhas de <name/>') =>
    checkLocales({
      en,
      others: { 'pt-BR': { ns: { a, b } } },
      stamps: stamp(en, 'pt-BR'),
      pluralCategories: () => ['one', 'other'],
    }).problems

  it('accepts the same variables in another order and spacing', () => {
    expect(run('{{count,number}} novas, {{ name }}')).toEqual([])
  })

  it('flags a variable whose format changed', () => {
    expect(run('Oi {{name}}, {{count}} novas')).toEqual([problem('pt-BR', 'ns', 'a', 'variables')])
  })

  it('flags a component tag that changed', () => {
    expect(run('Oi {{name}}, {{count, number}} novas', 'Linhas de <nome/>')).toEqual([
      problem('pt-BR', 'ns', 'b', 'tags'),
    ])
  })
})

describe('sameAsEnglish', () => {
  const en: LocaleTree = {
    common: { actions: { ok: 'OK' }, title: 'Artistica app', times: '×' },
  }
  it('warns about an untranslated value unless it is reviewed or has no letters', () => {
    expect(SAME_AS_ENGLISH).toContain('common:actions.ok')
    const result = checkLocales({
      en,
      others: { 'pt-BR': structuredClone(en) },
      stamps: stamp(en, 'pt-BR'),
      pluralCategories: () => ['one', 'other'],
    })
    expect(result).toEqual({ problems: [], sameAsEnglish: ['pt-BR common:title'] })
  })
})

describe('stamp', () => {
  const en: LocaleTree = {
    app: { title: 'Artistica app', count_one: 'one', count_other: 'many' },
    common: { ok: 'OK' },
  }

  it('hashes the English value with the first 8 hex characters of SHA-256', () => {
    // printf %s 'Artistica app' | shasum -a 256
    expect(hashOf('Artistica app')).toBe('98bce32f')
  })

  it('stamps every English string of a language when no key is given', () => {
    expect(stamp(en, 'ja')).toEqual({
      ja: {
        'app:count_one': hashOf('one'),
        'app:count_other': hashOf('many'),
        'app:title': hashOf('Artistica app'),
        'common:ok': hashOf('OK'),
      },
    })
  })

  it('writes only the given keys and keeps the rest', () => {
    const previous = {
      ja: { 'app:title': 'old00000', 'common:ok': 'old11111' },
      ko: { 'common:ok': 'x' },
    }
    expect(stamp(en, 'ja', ['common:ok'], previous)).toEqual({
      ja: { 'app:title': 'old00000', 'common:ok': hashOf('OK') },
      ko: { 'common:ok': 'x' },
    })
  })

  it('stamps every form of a plural key given by its base', () => {
    expect(stamp(en, 'ja', ['app:count'])).toEqual({
      ja: { 'app:count_one': hashOf('one'), 'app:count_other': hashOf('many') },
    })
  })

  it('refuses a key English does not have', () => {
    expect(() => stamp(en, 'ja', ['app:nope'])).toThrow('app:nope')
  })
})

describe('the repository locales', () => {
  it('pass the check', () => {
    expect(
      checkLocales({ ...readLocales(ROOT), pluralCategories: intlPluralCategories }).problems,
    ).toEqual([])
  })
})
