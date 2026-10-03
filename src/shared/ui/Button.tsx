import type { ComponentPropsWithRef, ReactNode } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type { ButtonSize, ButtonVariant }

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** neutral = the plain mockup `.btn`; primary = terracotta; secondary = ultramarine. */
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the full width of the container. */
  block?: boolean
  /** Decorative icon shown before the label. */
  icon?: IconName
  children?: ReactNode
}

/** `type` defaults to "button" so a Button inside a form never submits by accident. */
export function Button({
  variant = 'neutral',
  size = 'md',
  block = false,
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClasses(variant, size, { block }), className)}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  )
}
