import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useImages } from '../../features/images'
import { StudiesPanel } from '../../features/studies'
import './studies-slot.css'

export function StudiesSlot({ variant }: { readonly variant: 'desktop' | 'phone' }) {
  const { t } = useTranslation('app')
  const images = useImages((s) => s.images)
  const selectedId = useImages((s) => s.selectedId)
  const name = useId()
  const labelId = `${name}-label`
  return (
    <div className="flex flex-col gap-4">
      {variant === 'phone' && (
        <div className="flex flex-col gap-1">
          <span id={labelId} className="text-sm font-semibold">
            {t('mobile.studies.picker')}
          </span>
          <div role="radiogroup" aria-labelledby={labelId} className="app-thumb-radio">
            {images.map((img) => (
              <label key={img.id} className="app-thumb-radio__item">
                <input
                  type="radio"
                  name={name}
                  className="sr-only"
                  aria-label={img.name}
                  checked={img.id === selectedId}
                  onChange={() => {
                    useImages.getState().select(img.id)
                  }}
                />
                <img src={img.thumbUrl} alt="" />
              </label>
            ))}
          </div>
        </div>
      )}
      <StudiesPanel imageId={selectedId} />
    </div>
  )
}
