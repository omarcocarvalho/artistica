import { useEffect } from 'react'
import { useImageCount } from '../state/hasImages'

/** R12: images are memory-only, so warn before the tab is closed or reloaded. `preventDefault` is
 * enough in current Chrome, Edge, Firefox and Safari; the deprecated `returnValue` is not needed. */
export function LeaveWarningEffect(): null {
  const imageCount = useImageCount()
  const hasImages = imageCount > 0
  useEffect(() => {
    if (!hasImages) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [hasImages])
  return null
}
