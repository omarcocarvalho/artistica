import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type CalloutTone = 'info' | 'warning' | 'danger' | 'success' | 'quiet'

const ICONS: Record<CalloutTone, IconName> = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  success: 'check',
  quiet: 'info',
}

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CalloutTone
  title?: string
  /** Buttons or links shown under the text. */
  actions?: ReactNode
  /**
   * Announce the callout to screen readers when it appears (danger → alert, others → status).
   * Leave off for notes that are simply part of the page.
   */
  live?: boolean
}

export function Callout({
  tone = 'info',
  title,
  actions,
  live = false,
  className,
  children,
  ...rest
}: CalloutProps) {
  const role = live ? (tone === 'danger' ? 'alert' : 'status') : undefined
  return (
    <div
      role={role}
      className={cx('ds-note', tone !== 'info' && `ds-note--${tone}`, className)}
      {...rest}
    >
      <Icon name={ICONS[tone]} />
      <div className="ds-note__body">
        {title ? <strong>{title}</strong> : null}
        {children}
        {actions ? <div className="ds-note__actions">{actions}</div> : null}
      </div>
    </div>
  )
}
