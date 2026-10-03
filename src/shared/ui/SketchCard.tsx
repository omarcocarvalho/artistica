import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export interface SketchCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Add a strip of washi tape on the top edge. Purely decorative. */
  tape?: boolean
}

/** The hand-drawn card from the mockups: wobbly border, sticker shadow. */
export function SketchCard({ tape = false, className, children, ...rest }: SketchCardProps) {
  return (
    <div className={cx('ds-card', 'ds-card--sketch', className)} {...rest}>
      {tape ? <span className="ds-tape" aria-hidden="true" /> : null}
      {children}
    </div>
  )
}
