import { useEffect } from 'react'
import { decodeFull, useImages } from '../../features/images'
import { ExportDialog, ExportPanel, type GetSource } from '../../features/render'
import { useSettings } from '../../features/settings'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { usePages } from '../pages-store'
import { useImageCount } from '../state/hasImages'
import { useAppUi } from '../state/useAppUi'
import { appStudyProvider } from '../study-provider'

const getSource: GetSource = (id) => {
  const image = useImages.getState().images.find((i) => i.id === id)
  if (!image) return undefined
  return { pxW: image.pxW, pxH: image.pxH, decode: () => decodeFull(image) }
}

/** M2-R16: preview study jobs wait while an export is on screen. */
function usePauseStudies(active: boolean): void {
  useEffect(() => {
    if (!active) return
    appStudyProvider.pause()
    return () => {
      appStudyProvider.resume()
    }
  }, [active])
}

/** Desktop: the export dialog. The phone step flow exports inline (`ExportStepSlot`, M5-R28). */
export function ExportSlot() {
  const open = useAppUi((s) => s.exportOpen)
  const isDesktop = useIsDesktop()
  const pages = usePages((s) => s.pages)
  const imageCount = useImageCount()
  const paper = useSettings((s) => s.pageSetup.paper)

  const canOpen = isDesktop && pages.length > 0 && imageCount > 0
  const dialogOpen = open && canOpen

  useEffect(() => {
    if (open && !canOpen) useAppUi.getState().closeExport()
  }, [open, canOpen])

  usePauseStudies(dialogOpen)

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

/** The phone Export step's inline export; mounted only while that step is shown. */
export function ExportStepSlot({ unavailableReason }: { unavailableReason: string | null }) {
  const pages = usePages((s) => s.pages)
  const paper = useSettings((s) => s.pageSetup.paper)
  usePauseStudies(true)
  return (
    <ExportPanel
      pages={pages}
      paperLabel={paper}
      getSource={getSource}
      unavailableReason={unavailableReason}
    />
  )
}
