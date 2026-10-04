export type ThemeSetting = 'auto' | 'light' | 'dark'
export const SETTINGS_KEY = 'artistica:settings'

interface ThemeRoot {
  dataset: Record<string, string | undefined>
}
interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function parseTheme(raw: string | null): ThemeSetting {
  if (raw === null) return 'auto'
  try {
    const theme: unknown = (JSON.parse(raw) as { state?: { theme?: unknown } }).state?.theme
    return theme === 'light' || theme === 'dark' ? theme : 'auto'
  } catch {
    return 'auto'
  }
}

export function nextTheme(theme: ThemeSetting): ThemeSetting {
  return theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
}

export function applyTheme(root: ThemeRoot, theme: ThemeSetting): void {
  if (theme === 'auto') delete root.dataset.theme
  else root.dataset.theme = theme
}

/** Persist only by merging into the app's own settings blob; never invent a partial one. */
export function saveTheme(storage: SettingsStorage, theme: ThemeSetting): void {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    if (raw === null) return
    const blob = JSON.parse(raw) as { state?: Record<string, unknown> | null }
    if (typeof blob.state !== 'object' || blob.state === null) return
    blob.state.theme = theme
    storage.setItem(SETTINGS_KEY, JSON.stringify(blob))
  } catch {
    /* storage unavailable or corrupt: session-only */
  }
}
