import { Dialog as RadixDialog } from 'radix-ui'
import type { FocusEvent, ReactNode } from 'react'
import { Icon } from './Icon'
import { useReturnFocus } from './use-return-focus'

export interface ModalSurfaceProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Accessible name of the close (X) button, e.g. "Close". */
  closeLabel: string
  /** The body; leave out for a title-and-buttons confirmation. */
  children?: ReactNode
  /** Buttons for the footer bar. */
  footer?: ReactNode
  /** Where focus goes on close when the element that opened the overlay has left the document. */
  returnFocus?: () => HTMLElement | null
  /** Called after the overlay has closed and focus has gone back. */
  onClosed?: () => void
  /** Called before Esc closes the overlay; `event.preventDefault()` keeps it open. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void
}

/** WebKit on touch screens leaves a focused text field where it is, even under the overlay's edge. */
function revealField(event: FocusEvent<HTMLElement>): void {
  if (event.target.matches('input, textarea, select'))
    event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export interface SurfaceLayout {
  content: string
  body: string
  grab?: boolean
}

export function ModalSurface({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
  returnFocus,
  onEscapeKeyDown,
  onClosed,
  layout,
}: ModalSurfaceProps & { layout: SurfaceLayout }) {
  const returnFocusOnClose = useReturnFocus(open, returnFocus)
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ds-overlay" />
        <RadixDialog.Content
          className={layout.content}
          onCloseAutoFocus={(event) => {
            returnFocusOnClose(event)
            onClosed?.()
          }}
          onEscapeKeyDown={onEscapeKeyDown}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {layout.grab ? <div className="ds-sheet__grab" aria-hidden="true" /> : null}
          <div className="ds-dialog__head">
            <RadixDialog.Title>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label={closeLabel}
                className="ds-btn ds-btn--ghost ds-btn--icon ds-dialog__close"
              >
                <Icon name="close" />
              </button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="ds-dialog__desc">
              {description}
            </RadixDialog.Description>
          ) : null}
          {children === undefined ? null : (
            <div className={layout.body} onFocus={revealField}>
              {children}
            </div>
          )}
          {footer ? <div className="ds-dialog__foot">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
