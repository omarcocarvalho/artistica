import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GuidesLegend, GuidesToggle, PagePreview } from '../../features/render'
import { useImages } from '../../features/images'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'
import { Button, Callout, VisuallyHidden } from '../../shared/ui'
import { describePage, type TileDescription } from '../describe-page'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { usePages } from '../pages-store'
import { useAppUi } from '../state/useAppUi'
import { appStudyProvider, getPreviewSource } from '../study-provider'
import { useDelayedFlag } from '../use-delayed-flag'

export const UPDATING_ANNOUNCE_DELAY_MS = 500

const selectImage = (id: ImageId) => {
  useImages.getState().select(id)
}

export function PreviewSlot() {
  const { t, i18n } = useTranslation(['app', 'pageSetup', 'studies', 'lines'])
  const pages = usePages((s) => s.pages)
  const layout = usePages((s) => s.layout)
  const status = usePages((s) => s.status)
  const images = useImages((s) => s.images)
  const selectedId = useImages((s) => s.selectedId)
  const paper = useSettings((s) => s.pageSetup.paper)
  const showGuides = useAppUi((s) => s.showGuides)
  const isDesktop = useIsDesktop()
  const computing = status === 'computing'
  const slow = useDelayedFlag(computing, UPDATING_ANNOUNCE_DELAY_MS)
  const [wasComputing, setWasComputing] = useState(computing)
  const [announced, setAnnounced] = useState(false)
  if (computing !== wasComputing) {
    setWasComputing(computing)
    if (computing) setAnnounced(false)
  }
  if (slow && !announced) setAnnounced(true)
  const statusText = computing
    ? slow
      ? t('app:preview.updating')
      : null
    : announced && status === 'idle'
      ? t('app:preview.updated')
      : null
  const names = useMemo(() => new Map(images.map((i) => [i.id, i.name])), [images])
  const linesOf = useMemo(() => new Map(images.map((i) => [i.id, i.lines])), [images])
  const getName = (id: ImageId) => names.get(id) ?? t('app:preview.unnamedImage')
  const paperLabel = paper === 'Custom' ? t('app:preview.customPaper') : paper
  const orientation = layout ? t(`app:preview.orientation.${layout.orientation}`) : ''
  const listFormat = useMemo(() => new Intl.ListFormat(i18n.language), [i18n.language])
  const describeTile = (d: TileDescription) => {
    const item =
      d.version === 'original'
        ? t('app:preview.item', { name: d.name, w: d.widthMm, h: d.heightMm })
        : t('app:preview.itemVersion', {
            name: d.name,
            version: t(`studies:version.${d.version}`),
            w: d.widthMm,
            h: d.heightMm,
          })
    if (d.lines.length === 0) return item
    const list = listFormat.format(d.lines.map((type) => t(`lines:type.${type}`)))
    return t('app:preview.itemLines', { item, list })
  }
  const noRoom =
    layout !== null && images.length > 0 && layout.pages.length === 0 && status === 'idle'

  return (
    <div
      aria-busy={computing}
      className={
        isDesktop
          ? 'flex flex-col items-center gap-8 p-6'
          : 'flex snap-x snap-mandatory gap-4 overflow-x-auto p-4'
      }
    >
      <VisuallyHidden role="status">{statusText}</VisuallyHidden>
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
            getSource={getPreviewSource}
            studyTiles={appStudyProvider}
            scrollAxis={isDesktop ? 'y' : 'x'}
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
            {describePage(model, names, linesOf).map((d, k) => (
              <li key={`${d.imageId}-${String(k)}`}>{describeTile(d)}</li>
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
