import type { ComponentPropsWithRef } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'aria-label'
> {
  /** The accessible name. Required: an icon alone says nothing to a screen reader. */
  label: string
  icon: IconName
  variant?: ButtonVariant
  size?: ButtonSize
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(buttonClasses(variant, size, { iconOnly: true }), className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}
