import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useImages } from '../../features/images'
import { LinesPanel } from '../../features/lines'
import { activeLineTypes } from '../../shared/model/lines'
import { Badge } from '../../shared/ui'

/** The phone Studies step's Lines card: always open, named by its h3; the panel's headings are h4. */
export function LinesSection() {
  const { t } = useTranslation('app')
  const headingId = useId()
  const selectedId = useImages((s) => s.selectedId)
  const count = useImages((s) => {
    const img = s.images.find((i) => i.id === s.selectedId)
    return img ? activeLineTypes(img.lines).length : 0
  })
  return (
    <section className="ds-card app-lines-section" aria-labelledby={headingId}>
      <div className="app-lines-section__head">
        <h3 id={headingId} className="font-display text-lg">
          {t('mobile.lines.title')}
        </h3>
        {count > 0 && <Badge>{t('mobile.lines.on', { count })}</Badge>}
      </div>
      <LinesPanel imageId={selectedId} announceWait={false} headingLevel={4} />
    </section>
  )
}
