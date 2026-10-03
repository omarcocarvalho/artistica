import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { pageTitle } from '../shared/app-info'
import { App } from './App'

document.title = pageTitle('App')

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element in app/index.html')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
