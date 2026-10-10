import { DEFAULT_LANGUAGE, LANGUAGES, isLanguageCode, type LanguageCode } from './languages'

const BY_PRIMARY: Readonly<Record<string, LanguageCode>> = {
  pt: 'pt-BR',
  es: 'es',
  it: 'it',
  ja: 'ja',
  ko: 'ko',
  en: 'en',
}

function matchTag(raw: string): LanguageCode | null {
  const tag = raw.trim().replaceAll('_', '-').toLowerCase()
  const exact = LANGUAGES.find((code) => code.toLowerCase() === tag)
  if (exact) return exact
  const [primary = '', second = ''] = tag.split('-')
  if (primary === 'zh') {
    return second === '' || second === 'cn' || second === 'sg' || second === 'hans' ? 'zh-CN' : null
  }
  return BY_PRIMARY[primary] ?? null
}

/** M6-R4: the first tag that maps to one of the seven languages. */
export function matchLanguage(tags: readonly string[]): LanguageCode | null {
  for (const tag of tags) {
    const code = matchTag(tag)
    if (code) return code
  }
  return null
}

/** M6-R3: saved choice, then the landing page's `?lang` hint, then the browser, then English. */
export function resolveLanguage(input: {
  saved: LanguageCode | null
  hint: string | null
  browser: readonly string[]
  available: readonly LanguageCode[]
}): LanguageCode {
  const usable = (code: LanguageCode | null): code is LanguageCode =>
    code !== null && (code === DEFAULT_LANGUAGE || input.available.includes(code))
  if (usable(input.saved)) return input.saved
  if (isLanguageCode(input.hint) && usable(input.hint)) return input.hint
  for (const tag of input.browser) {
    const code = matchLanguage([tag])
    if (usable(code)) return code
  }
  return DEFAULT_LANGUAGE
}
