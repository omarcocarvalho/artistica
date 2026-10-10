import '../src/shared/styles.css'
import { applyTheme, SETTINGS_KEY, nextTheme, parseTheme, saveTheme } from './theme'

const raw = ((): string | null => {
  try {
    return localStorage.getItem(SETTINGS_KEY)
  } catch {
    return null
  }
})()
let theme = parseTheme(raw)
const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')
const label = document.querySelector<HTMLElement>('[data-theme-label]')

function render(): void {
  applyTheme(document.documentElement, theme)
  const text = button?.getAttribute(`data-label-${theme}`)
  const name = button?.getAttribute(`data-aria-${theme}`)
  if (label && text) label.textContent = text
  if (name) button?.setAttribute('aria-label', name)
}

button?.addEventListener('click', () => {
  theme = nextTheme(theme)
  saveTheme(localStorage, theme)
  render()
})
render()
