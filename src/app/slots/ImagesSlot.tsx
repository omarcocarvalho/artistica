import { ImageList, ImportDropzone, useImages } from '../../features/images'
import type { ImageId } from '../../shared/model/image'
import { useAppUi } from '../state/useAppUi'

export function ImagesSlot() {
  // The dropzone shows its own inline errors (CR-X2), so no onOutcomes handler here.
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <ImportDropzone variant="compact" />
      <ImageList
        onEdit={(id: ImageId) => {
          useImages.getState().select(id)
          useAppUi.getState().openEdit(id)
        }}
      />
    </div>
  )
}

export function EmptyActionsSlot() {
  // EmptyState already shows the headline, hint, formats and privacy lines; the card variant would repeat them.
  return <ImportDropzone variant="compact" />
}
