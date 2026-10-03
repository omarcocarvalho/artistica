import { useId } from 'react'
import { cx } from './cx'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  hint?: string
  disabled?: boolean
  className?: string
}

/**
 * A native `<select>`: on phones the OS picker is far easier to use than any custom list, and it is
 * accessible for free.
 */
export function Select({
  label,
  value,
  onValueChange,
  options,
  hint,
  disabled,
  className,
}: SelectProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={cx('ds-field', className)}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="ds-select"
        value={value}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => {
          onValueChange(e.currentTarget.value)
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span id={hintId} className="ds-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
