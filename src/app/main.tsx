import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { useSettings } from '../features/settings'
import { pageTitle } from '../shared/app-info'
import { initI18n } from '../shared/i18n'
import { App } from './App'

document.title = pageTitle('App')

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element in app/index.html')

// Resources are bundled, so this resolves immediately; waiting keeps the first paint translated.
void initI18n({ savedLanguage: useSettings.getState().language }).then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
