import { useId, useState, type KeyboardEvent } from 'react'
import { cx } from './cx'
import { parseDecimal } from './parse-decimal'

export interface CountFieldProps {
  label: string
  value: number
  min: number
  max: number
  onValueChange: (value: number) => void
  /** The range in words, e.g. "1 to 20": the field's description. */
  rangeHint: string
  disabled?: boolean
  /** Id(s) of more text that describes the field, e.g. why it is disabled. */
  describedBy?: string
  className?: string
}

/**
 * A whole-number text box. A text input, not `type=number`, whose spinner and parsing differ by
 * engine. It commits on blur and Enter (rounded, clamped; text that is not a number keeps the
 * value) and steps with the arrow keys.
 */
export function CountField({
  label,
  value,
  min,
  max,
  onValueChange,
  rangeHint,
  disabled,
  describedBy,
  className,
}: CountFieldProps) {
  const id = useId()
  const hintId = `${id}-range`
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (n: number) => {
    const next = Math.min(max, Math.max(min, Math.round(n)))
    if (next !== value) onValueChange(next)
    setDraft(null)
  }

  const commitDraft = () => {
    if (draft === null) return
    const parsed = parseDecimal(draft)
    if (parsed === null) setDraft(null)
    else commit(parsed)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const typed = draft === null ? null : parseDecimal(draft)
      const base = typed === null ? value : Math.round(typed)
      commit(base + (e.key === 'ArrowUp' ? 1 : -1))
    }
  }

  return (
    <div className={cx('ds-field', className)}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="ds-input ds-count"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-describedby={[hintId, describedBy].filter(Boolean).join(' ')}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.currentTarget.value)
        }}
        onBlur={commitDraft}
        onKeyDown={onKeyDown}
      />
      <span id={hintId} className="sr-only">
        {rangeHint}
      </span>
    </div>
  )
}
