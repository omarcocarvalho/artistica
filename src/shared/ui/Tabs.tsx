import { Tabs as RadixTabs } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from './cx'
import { leaveOnShiftTab } from './roving'

export interface TabItem {
  id: string
  label: string
  content: ReactNode
  /** Optional badge next to the label (e.g. a count). */
  badge?: ReactNode
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string
  items: readonly TabItem[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

/** WAI-ARIA tabs. Arrow keys move between tabs; the panel of the selected tab is shown. */
export function Tabs({ label, items, value, onValueChange, className }: TabsProps) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={onValueChange}
      className={cx('ds-tabs-root', className)}
    >
      <RadixTabs.List aria-label={label} className="ds-tabs" onKeyDown={leaveOnShiftTab}>
        {items.map((item) => (
          <RadixTabs.Trigger key={item.id} value={item.id} className="ds-tab">
            {item.label}
            {item.badge ? <span className="ds-tab__badge">{item.badge}</span> : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.id} value={item.id} className="ds-tabpanel">
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  )
}
