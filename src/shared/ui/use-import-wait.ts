import { useId, useLayoutEffect, useRef, type RefObject } from 'react'

export interface ImportWait {
  /** True while any photo is importing: disable the controls. */
  readonly waiting: boolean
  /** Id of the visible hint; pass to each control's aria-describedby while waiting. */
  readonly hintId: string
  /** Attach to the hint (a focusable <p tabIndex={-1}>). */
  readonly hintRef: RefObject<HTMLParagraphElement | null>
  /** Attach to the element that holds the controls: only focus inside it moves to the hint. */
  readonly panelRef: RefObject<HTMLDivElement | null>
}

/**
 * Controls wait while photos import. When a focused control inside the panel is disabled, focus
 * moves to the hint; when the wait ends, it returns to that control if the hint still has focus.
 * `importing` comes from the caller (shared/ui never imports a feature store).
 */
export function useImportWait(importing: boolean): ImportWait {
  const hintId = useId()
  const hintRef = useRef<HTMLParagraphElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const focusAfterImport = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const hint = hintRef.current
    const active = document.activeElement
    if (!hint) return
    if (importing) {
      if (active instanceof HTMLElement && active !== hint && panelRef.current?.contains(active)) {
        focusAfterImport.current = active
        hint.focus()
      }
      return
    }
    const back = focusAfterImport.current
    focusAfterImport.current = null
    if (back?.isConnected && active === hint) back.focus()
  }, [importing])

  return { waiting: importing, hintId, hintRef, panelRef }
}
