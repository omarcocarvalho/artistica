import type { HTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Decorative icon. Colour is never the only signal: warnings should always pass an icon. */
  icon?: IconName
}

/** Small status pill. A low-DPI chip is `<Badge tone="warning" icon="warning">…</Badge>`. */
export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('ds-badge', tone !== 'neutral' && `ds-badge--${tone}`, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  )
}
