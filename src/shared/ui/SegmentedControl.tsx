import { RadioGroup } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Orientation". */
  label: string
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Fill the container width. */
  block?: boolean
  /** Disables every option. */
  disabled?: boolean
  /** Id(s) of text that describes each option, e.g. why they are disabled. */
  describedBy?: string
  className?: string
}

/** A radio group drawn as joined buttons. Arrow keys move the selection (Radix roving focus). */
export function SegmentedControl<T extends string>({
  label,
  value,
  onValueChange,
  options,
  block = false,
  disabled,
  describedBy,
  className,
}: SegmentedControlProps<T>) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => {
        onValueChange(v as T)
      }}
      orientation="horizontal"
      disabled={disabled}
      className={cx('ds-seg', block && 'ds-seg--block', className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-describedby={describedBy}
          className="ds-seg__item"
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
