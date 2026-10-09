export type ExportBlock = 'no-images' | 'error' | 'updating' | 'no-room' | 'guides' | null

/** `hasLayout`: a layout for the current inputs has arrived (false while the first one is pending). `guidesPending`: M4-R18. */
export function exportBlock(
  imageCount: number,
  status: 'idle' | 'computing' | 'error',
  hasLayout: boolean,
  pageCount: number,
  guidesPending = false,
): ExportBlock {
  if (imageCount === 0) return 'no-images'
  if (status === 'error') return 'error'
  if (status === 'computing' || !hasLayout) return 'updating'
  if (pageCount === 0) return 'no-room'
  if (guidesPending) return 'guides'
  return null
}
