import { cx } from './cx'

export type ButtonVariant = 'neutral' | 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

/** Class names shared by Button and IconButton (the CSS lives in ui/css/basics.css). */
export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  extra?: { block?: boolean; iconOnly?: boolean },
): string {
  return cx(
    'ds-btn',
    variant !== 'neutral' && `ds-btn--${variant}`,
    size === 'lg' && 'ds-btn--lg',
    extra?.block && 'ds-btn--block',
    extra?.iconOnly && 'ds-btn--icon',
  )
}
