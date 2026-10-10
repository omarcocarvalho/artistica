import i18next, { type i18n as I18nInstance } from 'i18next'
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguageCode, type LanguageCode } from './languages'
import { lazyLocaleFiles } from './resources'

export type LocaleLoader = () => Promise<Record<string, unknown>>
export type LocaleLoaders = Partial<Record<LanguageCode, Readonly<Record<string, LocaleLoader>>>>

/** Groups `import.meta.glob` loaders (`…/locales/<lang>/<ns>.json`) by language and namespace. */
export function groupLoaders(files: Readonly<Record<string, LocaleLoader>>): LocaleLoaders {
  const out: Partial<Record<LanguageCode, Record<string, LocaleLoader>>> = {}
  for (const [path, loader] of Object.entries(files)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
    const lang = match?.[1]
    const ns = match?.[2]
    if (!isLanguageCode(lang) || !ns) continue
    ;(out[lang] ??= {})[ns] = loader
  }
  return out
}

export interface LanguageLoader {
  readonly availableLanguages: () => readonly LanguageCode[]
  readonly loadLanguage: (code: LanguageCode) => Promise<void>
  readonly setAppLanguage: (code: LanguageCode) => Promise<'changed' | 'failed'>
}

export function createLanguageLoader(i18n: I18nInstance, loaders: LocaleLoaders): LanguageLoader {
  const loading = new Map<LanguageCode, Promise<void>>()

  async function fetchAndAdd(code: LanguageCode): Promise<void> {
    const namespaces = loaders[code]
    if (!namespaces) throw new Error(`No strings for ${code}`)
    const bundles = await Promise.all(
      Object.entries(namespaces).map(async ([ns, load]) => [ns, await load()] as const),
    )
    for (const [ns, bundle] of bundles) i18n.addResourceBundle(code, ns, bundle, true, true)
  }

  function loadLanguage(code: LanguageCode): Promise<void> {
    if (code === DEFAULT_LANGUAGE) return Promise.resolve()
    let pending = loading.get(code)
    if (!pending) {
      pending = fetchAndAdd(code).catch((error: unknown) => {
        loading.delete(code)
        throw error
      })
      loading.set(code, pending)
    }
    return pending
  }

  return {
    availableLanguages: () =>
      LANGUAGES.filter((code) => code === DEFAULT_LANGUAGE || loaders[code] !== undefined),
    loadLanguage,
    setAppLanguage: async (code) => {
      try {
        await loadLanguage(code)
        await i18n.changeLanguage(code)
        return 'changed'
      } catch {
        return 'failed'
      }
    },
  }
}

export const { availableLanguages, loadLanguage, setAppLanguage } = createLanguageLoader(
  i18next,
  groupLoaders(lazyLocaleFiles),
)
