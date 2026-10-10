import { useEffect, useState } from 'react'

/**
 * False until two animation frames after mount when `wait` is set: a live region rendered with it
 * is painted, and so in the accessibility tree, before its message arrives, which Safari and
 * VoiceOver need to announce the first message.
 */
export function useAfterPaint(wait: boolean): boolean {
  const [painted, setPainted] = useState(!wait)
  useEffect(() => {
    if (!wait) return
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        setPainted(true)
      })
    })
    return () => {
      cancelAnimationFrame(id)
    }
  }, [wait])
  return painted
}
