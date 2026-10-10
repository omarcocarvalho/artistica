import { Tooltip as RadixTooltip } from 'radix-ui'
import { useState, type ReactElement } from 'react'

export interface TooltipProps {
  /** The tip text. Never the only place an important instruction lives: touch users cannot hover. */
  content: string
  /** The element that triggers the tip; it must accept a ref and props (a button, a link…). */
  children: ReactElement
  /** Shows no tip, keeping the trigger mounted (so it keeps focus when the tip comes and goes). */
  disabled?: boolean
}

export function Tooltip({ content, children, disabled = false }: TooltipProps) {
  const [open, setOpen] = useState(false)
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root open={open && !disabled} onOpenChange={setOpen}>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="ds-tooltip" sideOffset={6}>
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
