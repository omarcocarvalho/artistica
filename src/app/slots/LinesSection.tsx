import { useTranslation } from 'react-i18next'
import { useImages } from '../../features/images'
import { LinesPanel } from '../../features/lines'
import { activeLineTypes } from '../../shared/model/lines'
import { Badge, VisuallyHidden } from '../../shared/ui'

/** The phone Studies step's collapsible Lines card (design/mobile-flow.html, design answer D1). */
export function LinesSection() {
  const { t } = useTranslation('app')
  const selectedId = useImages((s) => s.selectedId)
  const count = useImages((s) => {
    const img = s.images.find((i) => i.id === s.selectedId)
    return img ? activeLineTypes(img.lines).length : 0
  })
  return (
    <details className="ds-card app-lines-section">
      <summary className="app-lines-section__summary">
        {t('mobile.lines.title')}
        {count > 0 && (
          <>
            <VisuallyHidden>{t('mobile.lines.separator')}</VisuallyHidden>
            <Badge className="app-lines-section__badge">{t('mobile.lines.on', { count })}</Badge>
          </>
        )}
      </summary>
      <LinesPanel imageId={selectedId} />
    </details>
  )
}
