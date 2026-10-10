import type { i18n as I18nInstance } from 'i18next'

/** Reads the landing page's one-time `?lang=` hint (M6-R3) and removes it from the address bar. */
export function readLangHint(location: Location, history: History): string | null {
  const url = new URL(location.href)
  const hint = url.searchParams.get('lang')
  if (hint === null) return null
  url.searchParams.delete('lang')
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return hint
}

/** M6-R6: `lang`, `dir` and the translated title follow the language. Returns the uninstaller. */
export function installDocumentLanguage(i18n: I18nInstance, doc: Document): () => void {
  const apply = (lng: string) => {
    doc.documentElement.lang = lng
    doc.documentElement.dir = i18n.dir(lng)
    doc.title = i18n.t('app:documentTitle', { lng })
  }
  apply(i18n.language)
  i18n.on('languageChanged', apply)
  return () => {
    i18n.off('languageChanged', apply)
  }
}
