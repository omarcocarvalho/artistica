import i18n, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, LANGUAGES, NAMESPACES, type LanguageCode } from './languages'
import { setAppLanguage } from './load'
import { resources } from './resources'

export interface InitI18nOptions {
  /** The resolved language (M6-R3). It is loaded before init returns; if it fails, English stays. */
  readonly language?: LanguageCode
}

/** Initialise i18next once; later calls return the same instance and switch to `language` if given. */
export async function initI18n(options: InitI18nOptions = {}): Promise<I18nInstance> {
  const { language } = options
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...LANGUAGES],
      nonExplicitSupportedLngs: false,
      ns: [...NAMESPACES],
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      initAsync: false,
    })
  }
  if (language && language !== i18n.language) await setAppLanguage(language)
  return i18n
}
