import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

export interface ChipProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'onChange' | 'aria-pressed'
> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/** A toggle chip (the mockup's checkbox chip): a button with `aria-pressed` and a check box that shows a tick when pressed. */
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
      <span className="ds-chip__box" aria-hidden="true">
        {checked ? <Icon name="check" strokeWidth={3} width="100%" height="100%" /> : null}
      </span>
      {children}
    </button>
  )
}
