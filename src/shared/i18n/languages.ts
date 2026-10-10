export const LANGUAGES = ['en', 'pt-BR', 'ja', 'ko', 'it', 'es', 'zh-CN'] as const
export type LanguageCode = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

/** One JSON file per namespace per language: `src/locales/<lang>/<ns>.json`. */
export const NAMESPACES = [
  'common',
  'app',
  'images',
  'pageSetup',
  'preview',
  'export',
  'errors',
  'studies',
  'lines',
  'presets',
] as const
export type Namespace = (typeof NAMESPACES)[number]

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

export const ENDONYMS: Readonly<Record<LanguageCode, string>> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
  ja: '日本語',
  ko: '한국어',
  it: 'Italiano',
  es: 'Español',
  'zh-CN': '简体中文',
}

export const OG_LOCALES: Readonly<Record<LanguageCode, string>> = {
  en: 'en_US',
  'pt-BR': 'pt_BR',
  ja: 'ja_JP',
  ko: 'ko_KR',
  it: 'it_IT',
  es: 'es_LA',
  'zh-CN': 'zh_CN',
}
