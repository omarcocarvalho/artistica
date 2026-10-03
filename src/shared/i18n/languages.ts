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
] as const
export type Namespace = (typeof NAMESPACES)[number]

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}
