import { useImages } from '../features/images'
import { useSettings } from '../features/settings'
import { presetFromSettings, type Preset } from '../shared/model/preset'

/** The current page setup, and the study and lines of the selected photo, else what new photos start with (M5-R2). */
export function presetFromCurrent(name: string): Preset {
  const state = useImages.getState()
  const source = state.images.find((i) => i.id === state.selectedId) ?? state.getDefaults()
  return presetFromSettings(name, {
    pageSetup: useSettings.getState().pageSetup,
    study: source.study,
    lines: source.lines,
  })
}

/**
 * M5-R6, in order: the page setup; the remembered defaults (normalised: no versions, no line types);
 * the session defaults that photos added later in this tab start with; then "Apply to all" for
 * studies and lines when photos are loaded. Refused while a photo is importing (M2-2).
 */
export function applyPreset(preset: Preset): 'applied' | 'importing' {
  const images = useImages.getState()
  if (images.importing > 0) return 'importing'
  const settings = useSettings.getState()
  settings.setPageSetup(preset.pageSetup)
  settings.setStudyDefaults({ blurPct: preset.study.blurPct, values: preset.study.values })
  settings.setLineDefaults(preset.lines)
  images.setDefaultStudy(preset.study, { session: true })
  images.setDefaultLines(preset.lines, { session: true })
  const source = images.images.find((i) => i.id === images.selectedId) ?? images.images[0]
  if (source !== undefined) {
    images.updateStudy(source.id, preset.study)
    images.applyStudyToAll(source.id)
    images.updateLines(source.id, preset.lines)
    images.applyLinesToAll(source.id)
  }
  return 'applied'
}
