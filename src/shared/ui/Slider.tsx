import { useId, type CSSProperties } from 'react'
import { cx } from './cx'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (value: number) => void
  /** Text shown beside the label and announced as the range's value text; defaults to the number. */
  formatValue?: (value: number) => string
  /** Captions under the track ends, e.g. "Fewer" / "More". */
  minLabel?: string
  maxLabel?: string
  disabled?: boolean
  className?: string
}

/** A native range input (best touch and keyboard behaviour for free) with the mockup's look. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  formatValue = String,
  minLabel,
  maxLabel,
  disabled,
  className,
}: SliderProps) {
  const id = useId()
  const span = max - min
  const fill = span > 0 ? ((value - min) / span) * 100 : 0
  const text = formatValue(value)
  return (
    <div className={cx('ds-slider', className)}>
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id} aria-hidden="true">
        {text}
      </output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        style={{ '--fill': `${String(fill)}%` } as CSSProperties}
        onChange={(e) => {
          const raw = e.currentTarget.value
          const next = Number(raw)
          if (raw.trim() !== '' && Number.isFinite(next)) onValueChange(next)
        }}
      />
      {minLabel || maxLabel ? (
        <div className="ds-slider__ends" aria-hidden="true">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
