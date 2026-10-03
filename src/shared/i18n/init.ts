import i18n, { type i18n as I18nInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, LANGUAGES, NAMESPACES, type LanguageCode } from './languages'
import { resources } from './resources'

export interface InitI18nOptions {
  /** The language saved in settings. It wins over the browser's language. null = not chosen yet. */
  readonly savedLanguage?: LanguageCode | null
}

/**
 * Initialise i18next once. Detection order: the saved setting, then `navigator`, then `en`.
 * Languages without resources fall back to English, so an unsupported browser language never breaks the UI.
 * Safe to call more than once: later calls return the same instance (and apply `savedLanguage` if given).
 */
export async function initI18n(options: InitI18nOptions = {}): Promise<I18nInstance> {
  const { savedLanguage = null } = options
  if (i18n.isInitialized) {
    if (savedLanguage) await i18n.changeLanguage(savedLanguage)
    return i18n
  }
  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng: savedLanguage ?? undefined,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...LANGUAGES],
      nonExplicitSupportedLngs: false,
      ns: [...NAMESPACES],
      defaultNS: 'common',
      detection: { order: ['navigator'], caches: [] },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      initAsync: false,
    })
  return i18n
}
