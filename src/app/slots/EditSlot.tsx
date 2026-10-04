import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageEditSheet, useImages } from '../../features/images'
import { ResponsiveSheet } from '../mobile/ResponsiveSheet'
import { useAppUi } from '../state/useAppUi'

export function EditSlot() {
  const { t } = useTranslation('images')
  const editingId = useAppUi((s) => s.editingId)
  const closeEdit = useCallback(() => {
    useAppUi.getState().closeEdit()
  }, [])
  const image = useImages((s) => s.images.find((i) => i.id === editingId))

  // The image can disappear while its sheet is open (Remove all, or removal from the sheet).
  useEffect(() => {
    if (editingId !== null && !image) {
      closeEdit()
      // The element that opened the sheet is gone; hand focus to the images panel instead of <body>.
      setTimeout(() => {
        document.querySelector<HTMLElement>('[data-images-panel]')?.focus()
      }, 0)
    }
  }, [editingId, image, closeEdit])

  if (editingId === null || !image) return null
  return (
    <ResponsiveSheet
      open
      title={image.name}
      closeLabel={t('editSheet.actions.close')}
      onOpenChange={(open) => {
        if (!open) closeEdit()
      }}
    >
      <ImageEditSheet imageId={editingId} />
    </ResponsiveSheet>
  )
}
