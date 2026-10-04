import { useEffect } from 'react'
import { useImages } from '../../features/images'
import { ExportDialog } from '../../features/render'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'
import { usePages } from '../pages-store'
import { useAppUi } from '../state/useAppUi'

const getBitmap = (id: ImageId) => useImages.getState().images.find((i) => i.id === id)?.bitmap

export function ExportSlot() {
  const open = useAppUi((s) => s.exportOpen)
  const pages = usePages((s) => s.pages)
  const paper = useSettings((s) => s.pageSetup.paper)

  useEffect(() => {
    if (open && pages.length === 0) useAppUi.getState().closeExport()
  }, [open, pages.length])

  return (
    <ExportDialog
      open={open && pages.length > 0}
      onOpenChange={(next) => {
        if (!next) useAppUi.getState().closeExport()
      }}
      pages={pages}
      paperLabel={paper}
      getBitmap={getBitmap}
    />
  )
}
