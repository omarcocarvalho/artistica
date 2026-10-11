import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENGLISH_WORDS } from '../e2e/support/english-words.ts'
import { readLocales, type LocaleTree } from './check-locales.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Every string of a locale tree as `ns:key` and its text, variables and tags taken out. */
function texts(tree: LocaleTree): [string, string][] {
  const out: [string, string][] = []
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      out.push([path, value.replace(/\{\{[^}]*\}\}/g, ' ').replace(/<[^>]*>/g, ' ')])
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value))
        walk(v, path.endsWith(':') ? path + k : `${path}.${k}`)
    }
  }
  for (const [ns, file] of Object.entries(tree)) walk(file, `${ns}:`)
  return out
}

/** The same whole-word, case-insensitive match as `findEnglish`. */
const wordIn = (word: string) => new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, 'iu')

describe('ENGLISH_WORDS, the English-left check of the language walk', () => {
  const { en, others } = readLocales(ROOT)

  it('names no word that a translation uses, so a hit in the walk is always English left on screen', () => {
    const hits = Object.entries(others).flatMap(([lang, tree]) =>
      texts(tree).flatMap(([key, text]) =>
        ENGLISH_WORDS.filter((w) => wordIn(w).test(text)).map((w) => `${lang} ${key}: ${w}`),
      ),
    )
    expect(Object.keys(others).length).toBeGreaterThanOrEqual(6)
    expect(hits).toEqual([])
  })

  it('names only words the English UI shows', () => {
    const english = texts(en).map(([, text]) => text)
    expect(ENGLISH_WORDS.filter((w) => !english.some((text) => wordIn(w).test(text)))).toEqual([])
  })
})
