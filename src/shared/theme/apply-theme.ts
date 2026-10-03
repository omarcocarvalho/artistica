import { useEffect } from 'react'
import { useSettings, type Theme } from '../../features/settings'

/**
 * Reflect the theme on `<html data-theme>`. "auto" removes the attribute so the
 * `prefers-color-scheme` media query in tokens.css decides.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/** The theme a toggle button switches to next: auto → light → dark → auto. */
export function nextTheme(theme: Theme): Theme {
  if (theme === 'auto') return 'light'
  if (theme === 'light') return 'dark'
  return 'auto'
}

/**
 * Keep `<html data-theme>` in step with the stored theme. Call once, in the app root.
 * (An inline script in the HTML, owned by E, sets the attribute before first paint; this hook
 * takes over from there and handles changes.)
 */
export function useApplyTheme(): void {
  const theme = useSettings((state) => state.theme)
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
}
