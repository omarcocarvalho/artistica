import { useEffect } from 'react'
import { useImages } from '../../features/images'
import { useSettings } from '../../features/settings'
import { DEFAULT_STUDY, studyEqual, type StudySettings } from '../../shared/model/study'

const remembered = (study: StudySettings): StudySettings => ({
  ...study,
  versions: DEFAULT_STUDY.versions,
})

/** Owner Q5/M2-1: the last-used blur and values (an edit to the selected image, or "Apply to all") become the defaults; versions never do (Q1). */
export function StudyDefaultsEffect(): null {
  const defaults = useSettings((s) => s.studyDefaults)

  useEffect(() => {
    const images = useImages.getState()
    const next = { versions: DEFAULT_STUDY.versions, ...defaults }
    // A preset's session default (M5-R6) survives the defaults its own apply wrote.
    const current = images.getDefaults()
    if (current.sessionStudy && studyEqual(remembered(current.study), next)) return
    images.setDefaultStudy(next)
  }, [defaults])

  useEffect(
    () =>
      useImages.subscribe((s, prev) => {
        if (s.appliedStudy !== prev.appliedStudy && s.appliedStudy !== null) {
          const { blurPct, values } = s.appliedStudy.study
          useSettings.getState().setStudyDefaults({ blurPct, values })
          return
        }
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
