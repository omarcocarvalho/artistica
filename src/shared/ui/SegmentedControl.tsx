import { RadioGroup } from 'radix-ui'
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx'
import { leaveOnShiftTab } from './roving'

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

type Direction = 'ltr' | 'rtl'

function inheritedDirection(group: HTMLElement): Direction | undefined {
  const dir = group.parentElement?.closest('[dir]')?.getAttribute('dir')
  return dir === 'rtl' || dir === 'ltr' ? dir : undefined
}

const STEP: Partial<Record<string, 1 | -1>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

function optionValue(target: EventTarget): string | null {
  return target instanceof HTMLElement && target.getAttribute('role') === 'radio'
    ? target.getAttribute('value')
    : null
}

/** The option a key selects from the focused one: the next enabled option, wrapping. */
function keyTarget<T extends string>(
  options: readonly SegmentedOption<T>[],
  key: string,
  dir: Direction | undefined,
  focused: string | null,
): T | undefined {
  const enabled = options.filter((o) => !o.disabled).map((o) => o.value)
  if (key === 'Home' || key === 'PageUp') return enabled[0]
  if (key === 'End' || key === 'PageDown') return enabled.at(-1)
  const step = STEP[key]
  const from = enabled.findIndex((v) => v === focused)
  if (step === undefined || from < 0) return undefined
  const forward = dir === 'rtl' && (key === 'ArrowLeft' || key === 'ArrowRight') ? -step : step
  return enabled[(from + forward + enabled.length) % enabled.length]
}

/**
 * A radio group drawn as joined buttons (M5-R26). All four arrows move and select, wrapping,
 * with Left and Right swapped in right-to-left text; Home and End (and Page Up and Page Down,
 * which Radix also moves the focus on) select the first and last enabled option. Radix moves
 * the focus and keeps the roving tabindex; the selection is made here on key down, because
 * Radix selects only an option that gains focus while the key is still down, which a quick
 * tap can miss. The direction is read from the closest `dir` ancestor on mount and on focus.
 */
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
  const [dir, setDir] = useState<Direction | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (root.current) setDir(inheritedDirection(root.current))
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    leaveOnShiftTab(event)
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    const target = keyTarget(options, event.key, dir, optionValue(event.target))
    if (target !== undefined && target !== value) onValueChange(target)
  }

  return (
    <RadioGroup.Root
      ref={root}
      aria-label={label}
      value={value}
      onValueChange={(v) => {
        onValueChange(v as T)
      }}
      dir={dir}
      onFocus={(event) => {
        setDir(inheritedDirection(event.currentTarget))
      }}
      onKeyDown={onKeyDown}
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
