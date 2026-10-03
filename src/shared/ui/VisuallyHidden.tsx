import type { HTMLAttributes } from 'react'
import { cx } from './cx'

/** Text for screen readers only. */
export function VisuallyHidden({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx('sr-only', className)} {...rest} />
}
