import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'

export interface ChipProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'onChange' | 'aria-pressed'
> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/** A toggle chip (the mockup's checkbox chip): a button with `aria-pressed`. */
export function Chip({
  checked,
  onCheckedChange,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={checked}
      className={cx('ds-chip', className)}
      onClick={() => {
        onCheckedChange(!checked)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
