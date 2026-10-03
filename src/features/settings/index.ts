export { DEFAULT_SETTINGS, THEMES, parseSettings, settingsSchema } from './schema'
export type { SettingsData, Theme } from './schema'
export {
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  createSettingsStore,
  initialUnitFromNavigator,
  safeStorage,
  useSettings,
} from './store'
export type { PageSetupPatch, SettingsState } from './store'
