import { useEffect } from 'react'
import { useImages } from '../../features/images'
import { normalizeLineDefaults, useSettings } from '../../features/settings'
import { linesEqual } from '../../shared/model/lines'

/** Owner Q7: the last-used line style, grid size and corner (an edit to the selected image, or "Apply lines to all") become the defaults; types never do. */
export function LineDefaultsEffect(): null {
  const defaults = useSettings((s) => s.lineDefaults)

  useEffect(() => {
    const images = useImages.getState()
    // A preset's session default (M5-R6) survives the defaults its own apply wrote.
    const current = images.getDefaults()
    if (current.sessionLines && linesEqual(normalizeLineDefaults(current.lines), defaults)) return
    images.setDefaultLines(defaults)
  }, [defaults])

  useEffect(
    () =>
      useImages.subscribe((s, prev) => {
        if (s.appliedLines !== prev.appliedLines && s.appliedLines !== null) {
          useSettings.getState().setLineDefaults(s.appliedLines.lines)
          return
        }
        if (s.images === prev.images || s.selectedId === null) return
        const now = s.images.find((i) => i.id === s.selectedId)?.lines
        const before = prev.images.find((i) => i.id === s.selectedId)?.lines
        if (!now || !before || now === before) return
        useSettings.getState().setLineDefaults(now)
      }),
    [],
  )

  return null
}
