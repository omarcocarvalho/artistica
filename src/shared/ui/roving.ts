import type { KeyboardEvent } from 'react'

/**
 * Takes a Radix roving-focus group out of the Tab order on Shift+Tab, at once. Radix does the same
 * in a re-render, which Firefox runs after it has moved the focus: the group then takes the focus
 * and hands it straight back to its item, so Shift+Tab never leaves the group (WCAG 2.1.2).
 */
export function leaveOnShiftTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === 'Tab' && event.shiftKey) event.currentTarget.setAttribute('tabindex', '-1')
}
