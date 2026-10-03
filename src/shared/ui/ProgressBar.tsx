export interface ProgressBarProps {
  /** 0..1, or null while the amount is unknown. */
  value: number | null
  /** Accessible name, e.g. "Exporting PDF". */
  label: string
  /** Optional spoken value, e.g. "Page 2 of 5". */
  valueText?: string
  className?: string
}

export function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const percent = value === null ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className={className ? `ds-progress ${className}` : 'ds-progress'}
    >
      <div
        className={
          value === null
            ? 'ds-progress__fill ds-progress__fill--indeterminate'
            : 'ds-progress__fill'
        }
        style={value === null ? undefined : { width: `${String(percent)}%` }}
      />
    </div>
  )
}
