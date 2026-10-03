import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Accessible name of the close (X) button, e.g. "Close". */
  closeLabel: string
  children: ReactNode
  /** Buttons for the footer bar. */
  footer?: ReactNode
  size?: 'sm' | 'lg'
}

/** Modal dialog: focus is trapped, Esc and the backdrop close it, focus returns to the opener. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
  size = 'lg',
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ds-overlay" />
        <RadixDialog.Content
          className={cx('ds-dialog', size === 'sm' && 'ds-dialog--sm')}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
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
          <div className="ds-dialog__body">{children}</div>
          {footer ? <div className="ds-dialog__foot">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
