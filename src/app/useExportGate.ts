import { useTranslation } from 'react-i18next'
import { exportBlock, type ExportBlock } from './exportState'
import { usePages } from './pages-store'
import { useImageCount } from './state/hasImages'

const REASON_KEYS = {
  'no-images': 'topBar.exportNoImages',
  updating: 'topBar.exportUpdating',
  'no-room': 'topBar.exportNoRoom',
  error: 'topBar.exportError',
} as const

/** One rule for the top bar and the phone Export step. */
export function useExportGate(): { block: ExportBlock; reason: string | null } {
  const { t } = useTranslation('app')
  const imageCount = useImageCount()
  const status = usePages((s) => s.status)
  const hasLayout = usePages((s) => s.layout !== null && !s.empty)
  const pageCount = usePages((s) => s.pages.length)
  const block = exportBlock(imageCount, status, hasLayout, pageCount)
  return { block, reason: block === null ? null : t(REASON_KEYS[block]) }
}
