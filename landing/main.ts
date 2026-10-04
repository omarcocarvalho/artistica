import '../src/shared/styles.css'
import {
  applyTheme,
  SETTINGS_KEY,
  nextTheme,
  parseTheme,
  saveTheme,
  type ThemeSetting,
} from './theme'

const LABELS: Record<ThemeSetting, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }

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
  if (label) label.textContent = LABELS[theme]
  button?.setAttribute('aria-label', `Change theme: ${LABELS[theme]}`)
}

button?.addEventListener('click', () => {
  theme = nextTheme(theme)
  saveTheme(localStorage, theme)
  render()
})
render()
