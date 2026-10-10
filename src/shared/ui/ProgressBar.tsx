import { useSyncExternalStore } from 'react'

export interface ProgressBarProps {
  /** 0..1, or null while the amount is unknown. */
  value: number | null
  /** Accessible name, e.g. "Exporting PDF". */
  label: string
  /** Optional spoken value, e.g. "Page 2 of 5". */
  valueText?: string
  className?: string
}

const REDUCE = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const mql = window.matchMedia(REDUCE)
  mql.addEventListener('change', onChange)
  return () => {
    mql.removeEventListener('change', onChange)
  }
}
const getSnapshot = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches
const getServerSnapshot = () => false

function fillClass(value: number | null, reduceMotion: boolean): string {
  if (value !== null) return 'ds-progress__fill'
  return reduceMotion
    ? 'ds-progress__fill ds-progress__fill--indeterminate-static'
    : 'ds-progress__fill ds-progress__fill--indeterminate'
}

export function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const reduceMotion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
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
        className={fillClass(value, reduceMotion)}
        style={value === null ? undefined : { width: `${String(percent)}%` }}
      />
    </div>
  )
}
