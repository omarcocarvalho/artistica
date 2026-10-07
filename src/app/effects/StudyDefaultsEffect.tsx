import { useEffect } from 'react'
import { useImages } from '../../features/images'
import { useSettings } from '../../features/settings'
import { DEFAULT_STUDY, studyEqual } from '../../shared/model/study'

/** Owner Q5: the selected image's last-used blur and values become the defaults; versions never do (Q1). */
export function StudyDefaultsEffect(): null {
  const defaults = useSettings((s) => s.studyDefaults)

  useEffect(() => {
    useImages.getState().setDefaultStudy({ versions: DEFAULT_STUDY.versions, ...defaults })
  }, [defaults])

  useEffect(
    () =>
      useImages.subscribe((s, prev) => {
        if (s.images === prev.images || s.selectedId === null) return
        const now = s.images.find((i) => i.id === s.selectedId)?.study
        const before = prev.images.find((i) => i.id === s.selectedId)?.study
        if (!now || !before || now === before) return
        if (studyEqual({ ...now, versions: before.versions }, before)) return
        useSettings.getState().setStudyDefaults({ blurPct: now.blurPct, values: now.values })
      }),
    [],
  )

  return null
}
