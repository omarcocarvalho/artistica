import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GuidesLegend, GuidesToggle, PagePreview, type PreviewSource } from '../../features/render'
import { useImages } from '../../features/images'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'
import { Button, Callout, VisuallyHidden } from '../../shared/ui'
import { describePage } from '../describe-page'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { usePages } from '../pages-store'
import { useAppUi } from '../state/useAppUi'

const selectImage = (id: ImageId) => {
  useImages.getState().select(id)
}
const getSource = (id: ImageId): PreviewSource | undefined => {
  const image = useImages.getState().images.find((i) => i.id === id)
  return image && { bitmap: image.preview, pxW: image.pxW, pxH: image.pxH }
}

export function PreviewSlot() {
  const { t } = useTranslation(['app', 'pageSetup'])
  const pages = usePages((s) => s.pages)
  const layout = usePages((s) => s.layout)
  const status = usePages((s) => s.status)
  const images = useImages((s) => s.images)
  const selectedId = useImages((s) => s.selectedId)
  const paper = useSettings((s) => s.pageSetup.paper)
  const showGuides = useAppUi((s) => s.showGuides)
  const isDesktop = useIsDesktop()
  const names = useMemo(() => new Map(images.map((i) => [i.id, i.name])), [images])
  const getName = (id: ImageId) => names.get(id) ?? t('app:preview.unnamedImage')
  const paperLabel = paper === 'Custom' ? t('app:preview.customPaper') : paper
  const orientation = layout ? t(`app:preview.orientation.${layout.orientation}`) : ''
  const noRoom =
    layout !== null && images.length > 0 && layout.pages.length === 0 && status === 'idle'

  return (
    <div
      aria-busy={status === 'computing'}
      className={
        isDesktop
          ? 'flex flex-col items-center gap-8 p-6'
          : 'flex snap-x snap-mandatory gap-4 overflow-x-auto p-4'
      }
    >
      <VisuallyHidden role="status">
        {status === 'computing' ? t('app:preview.updating') : null}
      </VisuallyHidden>
      {status === 'error' && (
        <Callout tone="danger" live>
          {t('app:topBar.exportError')}
        </Callout>
      )}
      {noRoom && (
        <Callout tone="warning" live>
          {t('pageSetup:noRoom')}
        </Callout>
      )}
      {showGuides && pages.length > 0 && <GuidesLegend />}
      {pages.map((model, i) => (
        <div key={model.index} className="w-full max-w-3xl shrink-0 snap-center">
          <PagePreview
            model={model}
            getSource={getSource}
            getName={getName}
            selectedId={selectedId}
            onSelect={selectImage}
            guides={showGuides}
            label={t('app:preview.pageCaption', {
              current: i + 1,
              total: pages.length,
              paper: paperLabel,
              orientation,
            })}
          />
          <ul aria-label={t('app:preview.pageItems', { current: i + 1 })} className="sr-only">
            {describePage(model, names).map((d, k) => (
              <li key={`${d.imageId}-${String(k)}`}>
                {t('app:preview.item', { name: d.name, w: d.widthMm, h: d.heightMm })}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function PreviewToolbar() {
  const { t } = useTranslation('app')
  const showGuides = useAppUi((s) => s.showGuides)
  const selectedId = useImages((s) => s.selectedId)
  return (
    <div className="flex items-center gap-3">
      <GuidesToggle
        checked={showGuides}
        onCheckedChange={(v) => {
          useAppUi.getState().setShowGuides(v)
        }}
      />
      <Button
        disabled={selectedId === null}
        onClick={() => {
          if (selectedId) {
            selectImage(selectedId)
            useAppUi.getState().openEdit(selectedId)
          }
        }}
      >
        {t('preview.editSelected')}
      </Button>
    </div>
  )
}
