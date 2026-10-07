import { useId, useState, type KeyboardEvent } from 'react'
import { cx } from './cx'
import { VisuallyHidden } from './VisuallyHidden'

export interface ColourFieldProps {
  label: string
  /** Accessible name of the hex text box; starts with `label`. */
  hexLabel: string
  /** How to type a colour in the hex text box: its description. */
  hexHint: string
  /** '#rrggbb'. */
  value: string
  /** Receives a lowercase '#rrggbb': on every change while the picker is open, and when a typed hex is committed. */
  onValueChange: (hex: string) => void
  disabled?: boolean
  /** Id(s) of more text that describes the field, e.g. why it is disabled. */
  describedBy?: string
  className?: string
}

const HEX = /^#[0-9a-f]{6}$/

function parseHex(text: string): string | null {
  const hex = `#${text.trim().replace(/^#/, '').toLowerCase()}`
  return HEX.test(hex) ? hex : null
}

/**
 * A native colour swatch for pointers, and its hex as a text box for the keyboard: WebKit leaves
 * `type=color` out of the Tab order. The text box commits on blur and Enter; text that is not six
 * hex digits keeps the value.
 */
export function ColourField({
  label,
  hexLabel,
  hexHint,
  value,
  onValueChange,
  disabled,
  describedBy,
  className,
}: ColourFieldProps) {
  const id = useId()
  const hexId = `${id}-hex`
  const valueId = `${id}-value`
  const hintId = `${id}-hint`
  const hex = value.toLowerCase()
  const [draft, setDraft] = useState<string | null>(null)

  const commitDraft = () => {
    if (draft === null) return
    const next = parseHex(draft)
    if (next !== null && next !== hex) onValueChange(next)
    setDraft(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    commitDraft()
  }

  return (
    <div className={cx('ds-colour-field', className)}>
      <label htmlFor={id}>{label}</label>
      <input
        id={hexId}
        type="text"
        className="ds-input ds-colour-field__hex"
        aria-label={hexLabel}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        aria-describedby={[hintId, describedBy].filter(Boolean).join(' ')}
        value={draft ?? hex}
        onChange={(e) => {
          setDraft(e.currentTarget.value)
        }}
        onBlur={commitDraft}
        onKeyDown={onKeyDown}
      />
      <VisuallyHidden id={hintId}>{hexHint}</VisuallyHidden>
      <VisuallyHidden id={valueId}>{hex}</VisuallyHidden>
      <input
        id={id}
        type="color"
        className="ds-colour-input"
        value={hex}
        disabled={disabled}
        aria-describedby={[valueId, describedBy].filter(Boolean).join(' ')}
        onChange={(e) => {
          const next = e.currentTarget.value.toLowerCase()
          if (HEX.test(next)) onValueChange(next)
        }}
      />
    </div>
  )
}
