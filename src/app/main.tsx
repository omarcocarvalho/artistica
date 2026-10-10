import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { useSettings } from '../features/settings'
import { availableLanguages, initI18n, resolveLanguage } from '../shared/i18n'
import { registerServiceWorker } from '../sw/register'
import { App } from './App'
import { installDocumentLanguage, readLangHint } from './language'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element in app/index.html')

const language = resolveLanguage({
  saved: useSettings.getState().language,
  hint: readLangHint(window.location, window.history),
  browser: navigator.languages.length > 0 ? navigator.languages : [navigator.language],
  available: availableLanguages(),
})

void initI18n({ language }).then((i18n) => {
  installDocumentLanguage(i18n, document)
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

void registerServiceWorker()
