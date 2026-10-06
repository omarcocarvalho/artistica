import { useLayoutEffect, useRef } from 'react'

/**
 * Remembers the element focused when `open` turns true and returns an `onCloseAutoFocus` handler
 * for a Radix dialog that focuses it again on close. When that element has left the document,
 * `returnFocus` names the target instead.
 */
export function useReturnFocus(
  open: boolean,
  returnFocus?: () => HTMLElement | null,
): (event: Event) => void {
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [open])
  return (event) => {
    event.preventDefault()
    const stored = opener.current
    const target = stored?.isConnected ? stored : (returnFocus?.() ?? null)
    target?.focus()
  }
}
