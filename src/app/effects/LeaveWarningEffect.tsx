import { useEffect } from 'react'
import { useImageCount } from '../state/hasImages'

/** R12: images are memory-only, so warn before the tab is closed or reloaded. `preventDefault` is
 * `returnValue` is also set because some WebKit and older Chromium versions only prompt with it. */
export function LeaveWarningEffect(): null {
  const imageCount = useImageCount()
  const hasImages = imageCount > 0
  useEffect(() => {
    if (!hasImages) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- still required by some browsers
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [hasImages])
  return null
}
