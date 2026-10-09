import { useTranslation } from 'react-i18next'
import { selectImageDescriptors, useImages } from '../features/images'
import { guidesPending, useDetections } from '../features/lines'
import { exportBlock, type ExportBlock } from './exportState'
import { usePages } from './pages-store'
import { useImageCount } from './state/hasImages'

const REASON_KEYS = {
  'no-images': 'topBar.exportNoImages',
  updating: 'topBar.exportUpdating',
  'no-room': 'topBar.exportNoRoom',
  error: 'topBar.exportError',
  guides: 'topBar.exportGuides',
} as const

/** One rule for the top bar and the phone Export step. */
export function useExportGate(): { block: ExportBlock; reason: string | null } {
  const { t } = useTranslation('app')
  const imageCount = useImageCount()
  const status = usePages((s) => s.status)
  const hasLayout = usePages((s) => s.layout !== null && !s.empty)
  const pageCount = usePages((s) => s.pages.length)
  const images = useImages(selectImageDescriptors)
  const pending = useDetections((s) => guidesPending(s, images))
  const block = exportBlock(imageCount, status, hasLayout, pageCount, pending)
  return { block, reason: block === null ? null : t(REASON_KEYS[block]) }
}
