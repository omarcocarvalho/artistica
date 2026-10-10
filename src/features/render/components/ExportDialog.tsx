import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../../shared/ui'
import { ExportPanel, type ExportPanelHandle, type ExportPanelProps } from './ExportPanel'

export interface ExportDialogProps extends Omit<ExportPanelProps, 'ref' | 'unavailableReason'> {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

/** The desktop export: `ExportPanel` in a dialog, which unmounts the panel when it closes. */
export function ExportDialog({ open, onOpenChange, ...panel }: ExportDialogProps) {
  const { t } = useTranslation('export')
  const panelRef = useRef<ExportPanelHandle>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) panelRef.current?.cancel()
        onOpenChange(next)
      }}
      title={t('title')}
      closeLabel={t('close')}
      size="sm"
    >
      <ExportPanel ref={panelRef} {...panel} />
    </Dialog>
  )
}
