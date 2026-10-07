import { useEffect } from 'react'
import { decodeFull, useImages } from '../../features/images'
import { ExportDialog, type GetSource } from '../../features/render'
import { useSettings } from '../../features/settings'
import { usePages } from '../pages-store'
import { useImageCount } from '../state/hasImages'
import { useAppUi } from '../state/useAppUi'
import { appStudyProvider } from '../study-provider'

const getSource: GetSource = (id) => {
  const image = useImages.getState().images.find((i) => i.id === id)
  if (!image) return undefined
  return { pxW: image.pxW, pxH: image.pxH, decode: () => decodeFull(image) }
}

export function ExportSlot() {
  const open = useAppUi((s) => s.exportOpen)
  const pages = usePages((s) => s.pages)
  const imageCount = useImageCount()
  const paper = useSettings((s) => s.pageSetup.paper)

  const dialogOpen = open && pages.length > 0 && imageCount > 0

  useEffect(() => {
    if (open && (pages.length === 0 || imageCount === 0)) useAppUi.getState().closeExport()
  }, [open, pages.length, imageCount])

  useEffect(() => {
    if (!dialogOpen) return
    appStudyProvider.pause()
    return () => {
      appStudyProvider.resume()
    }
  }, [dialogOpen])

  return (
    <ExportDialog
      open={dialogOpen}
      onOpenChange={(next) => {
        if (!next) useAppUi.getState().closeExport()
      }}
      pages={pages}
      paperLabel={paper}
      getSource={getSource}
    />
  )
}
