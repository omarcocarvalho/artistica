import { useId, useState, type KeyboardEvent } from 'react'
import { cx } from './cx'
import { parseDecimal } from './parse-decimal'
import { mmToUnit, roundForUnit, unitToMm, type Mm, type Unit } from '../model/units'

export interface NumberFieldProps {
  label: string
  /** The value in millimetres. The field shows it in `unit` and always emits millimetres. */
  valueMm: Mm
  unit: Unit
  /** Text shown after the number, e.g. "mm" or "in" (comes from i18n). */
  unitLabel: string
  onChangeMm: (mm: Mm) => void
  minMm?: Mm
  maxMm?: Mm
  /** Arrow-key step in millimetres (Shift = 10×). Default 1. */
  stepMm?: Mm
  hint?: string
  disabled?: boolean
  className?: string
}

function show(mm: Mm, unit: Unit): string {
  return String(roundForUnit(mmToUnit(mm, unit), unit))
}

export function NumberField({
  label,
  valueMm,
  unit,
  unitLabel,
  onChangeMm,
  minMm = 0,
  maxMm = Number.POSITIVE_INFINITY,
  stepMm = 1,
  hint,
  disabled,
  className,
}: NumberFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  // While editing, show exactly what was typed. Otherwise show the (rounded) value.
  const [draft, setDraft] = useState<string | null>(null)

  const commitMm = (mm: Mm) => {
    const clamped = Math.min(maxMm, Math.max(minMm, mm))
    // Emit nothing when the display would not change: avoids drift from re-rounding.
    if (show(clamped, unit) !== show(valueMm, unit)) onChangeMm(clamped)
  }

  const commitDraft = () => {
    if (draft === null) return
    const parsed = parseDecimal(draft)
    if (parsed !== null) commitMm(unitToMm(parsed, unit))
    setDraft(null) // invalid text snaps back to the current value
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault() // do not submit an enclosing form
      commitDraft()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const parsed = draft === null ? null : parseDecimal(draft)
      const base = parsed === null ? valueMm : unitToMm(parsed, unit)
      const step = stepMm * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
      commitMm(base + step)
      setDraft(null)
    }
  }

  return (
    <div className={cx('ds-field', className)}>
      <label htmlFor={id}>{label}</label>
      <div className="ds-unit-input">
        <input
          id={id}
          className="ds-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          role="spinbutton"
          aria-valuenow={roundForUnit(mmToUnit(valueMm, unit), unit)}
          aria-valuemin={
            Number.isFinite(minMm) ? roundForUnit(mmToUnit(minMm, unit), unit) : undefined
          }
          aria-valuemax={
            Number.isFinite(maxMm) ? roundForUnit(mmToUnit(maxMm, unit), unit) : undefined
          }
          aria-valuetext={`${show(valueMm, unit)} ${unitLabel}`}
          aria-describedby={hint ? hintId : undefined}
          disabled={disabled}
          value={draft ?? show(valueMm, unit)}
          onChange={(e) => {
            setDraft(e.currentTarget.value)
          }}
          onBlur={commitDraft}
          onKeyDown={onKeyDown}
        />
        <span className="ds-unit-input__unit" aria-hidden="true">
          {unitLabel}
        </span>
      </div>
      {hint ? (
        <span id={hintId} className="ds-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
