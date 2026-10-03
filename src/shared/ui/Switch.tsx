import { Switch as RadixSwitch } from 'radix-ui'
import { useId } from 'react'
import { cx } from './cx'

export interface SwitchProps {
  /** Visible label. */
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Small helper text under the label. */
  hint?: string
  disabled?: boolean
  className?: string
}

export function Switch({
  label,
  checked,
  onCheckedChange,
  hint,
  disabled,
  className,
}: SwitchProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={cx('ds-switch-row', className)}>
      <div className="ds-switch-row__text">
        <label htmlFor={id} className="ds-switch-label">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="ds-field-hint">
            {hint}
          </span>
        ) : null}
      </div>
      <RadixSwitch.Root
        id={id}
        className="ds-switch"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
      >
        <RadixSwitch.Thumb className="ds-switch__thumb" />
      </RadixSwitch.Root>
    </div>
  )
}
