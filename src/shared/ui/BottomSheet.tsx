import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  closeLabel: string
  children: ReactNode
  footer?: ReactNode
}

/** The phone variant of Dialog: slides up from the bottom edge, same focus handling. */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
}: BottomSheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ds-overlay" />
        <RadixDialog.Content
          className="ds-sheet"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="ds-sheet__grab" aria-hidden="true" />
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
          <div className="ds-sheet__body">{children}</div>
          {footer ? <div className="ds-dialog__foot">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
