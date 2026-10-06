import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { useReturnFocus } from './use-return-focus'

export interface ModalSurfaceProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Accessible name of the close (X) button, e.g. "Close". */
  closeLabel: string
  children: ReactNode
  /** Buttons for the footer bar. */
  footer?: ReactNode
  /** Where focus goes on close when the element that opened the overlay has left the document. */
  returnFocus?: () => HTMLElement | null
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
  layout,
}: ModalSurfaceProps & { layout: SurfaceLayout }) {
  const onCloseAutoFocus = useReturnFocus(open, returnFocus)
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ds-overlay" />
        <RadixDialog.Content
          className={layout.content}
          onCloseAutoFocus={onCloseAutoFocus}
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
          <div className={layout.body}>{children}</div>
          {footer ? <div className="ds-dialog__foot">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
