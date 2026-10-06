const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password', 'number'])

export function shouldHandlePaste(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  if (target.closest('[role="dialog"]') !== null) return false
  if (target.isContentEditable || target.closest('[contenteditable="true"]') !== null) return false
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return false
  if (target instanceof HTMLInputElement) return !TEXT_INPUT_TYPES.has(target.type)
  return true
}
