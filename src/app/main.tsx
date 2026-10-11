import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { useSettings } from '../features/settings'
import { availableLanguages, initI18n, resolveLanguage, setPseudoLanguage } from '../shared/i18n'
import { registerServiceWorker } from '../sw/register'
import { App } from './App'
import { NotifyOnMount } from './components/NotifyOnMount'
import { installDocumentLanguage, listenForPseudo, readLangHint, wantsPseudo } from './language'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element in app/index.html')

const language = resolveLanguage({
  saved: useSettings.getState().language,
  hint: readLangHint(window.location, window.history),
  browser: navigator.languages.length > 0 ? navigator.languages : [navigator.language],
  available: availableLanguages(),
})

void initI18n({ language }).then(async (i18n) => {
  const failed = i18n.language !== language
  installDocumentLanguage(i18n, document)
  if (wantsPseudo(window.location)) await setPseudoLanguage()
  listenForPseudo(window, setPseudoLanguage)
  createRoot(rootElement).render(
    <StrictMode>
      <App />
      {failed && <NotifyOnMount kind="error" message={i18n.t('app:language.loadFailed')} />}
    </StrictMode>,
  )
})

void registerServiceWorker()
