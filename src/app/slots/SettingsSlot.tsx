import { PageSetupPanel } from '../../features/page-setup'
import { usePages } from '../pages-store'
import { useImageCount } from '../state/hasImages'

export function SettingsSlot() {
  const layout = usePages((s) => s.layout)
  const imageCount = useImageCount()
  return (
    <PageSetupPanel
      suggestedPerPage={layout?.suggestedPerPage ?? null}
      resolvedOrientation={imageCount > 0 ? (layout?.orientation ?? null) : null}
    />
  )
}
