import { useId } from 'react'
import { cx } from './cx'

export interface ColourFieldProps {
  label: string
  /** '#rrggbb'. */
  value: string
  /** Receives a lowercase '#rrggbb' on every change while the picker is open. */
  onValueChange: (hex: string) => void
  disabled?: boolean
  /** Id(s) of more text that describes the field, e.g. why it is disabled. */
  describedBy?: string
  className?: string
}

const HEX = /^#[0-9a-f]{6}$/

/** A native colour input with its hex beside it as text, which screen readers and forced colors rely on. */
export function ColourField({
  label,
  value,
  onValueChange,
  disabled,
  describedBy,
  className,
}: ColourFieldProps) {
  const id = useId()
  const hexId = `${id}-hex`
  const hex = value.toLowerCase()
  return (
    <div className={cx('ds-colour-field', className)}>
      <label htmlFor={id}>{label}</label>
      <span id={hexId} className="ds-colour-field__hex">
        {hex}
      </span>
      <input
        id={id}
        type="color"
        className="ds-colour-input"
        value={hex}
        disabled={disabled}
        aria-describedby={[hexId, describedBy].filter(Boolean).join(' ')}
        onChange={(e) => {
          const next = e.currentTarget.value.toLowerCase()
          if (HEX.test(next)) onValueChange(next)
        }}
      />
    </div>
  )
}
