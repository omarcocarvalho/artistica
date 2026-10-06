export type RowAction = 'edit' | 'remove'

/** Marks a list row's action button so focus can land on its counterpart after a removal. */
export function rowAction(action: RowAction): { 'data-row-action': RowAction } {
  return { 'data-row-action': action }
}

/** The import "Upload" button: the images panel's on desktop, the empty state's once the panel is gone. */
export function uploadButton(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-images-panel] [data-dropzone] button') ??
    document.querySelector<HTMLElement>('[data-dropzone] button')
  )
}

/**
 * Where focus goes once the image at `index` has left the list: the same action in the row that
 * took its place, else in the row before it, else the Upload button.
 */
export function removalFocusTarget(index: number, action: RowAction): HTMLElement | null {
  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-row-action="${action}"]`),
  )
  return buttons[index] ?? buttons[index - 1] ?? uploadButton()
}
