import { useEffect } from 'react'
import { useImages } from '../../features/images'
import { useSettings } from '../../features/settings'

/** Owner Q7: the last-used line style, grid size and corner (an edit to the selected image, or "Apply lines to all") become the defaults; types never do. */
export function LineDefaultsEffect(): null {
  const defaults = useSettings((s) => s.lineDefaults)

  useEffect(() => {
    useImages.getState().setDefaultLines(defaults)
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
