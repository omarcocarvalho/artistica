import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { printedPixelSize, type ImageId } from '../../../shared/model/image'
import { mmToUnit, roundForUnit, type Unit } from '../../../shared/model/units'
import { Badge, Button, Dialog, IconButton } from '../../../shared/ui'
import { useSettings } from '../../settings'
import { dpiInfo } from '../dpi'
import { useImages } from '../store'
import type { LoadedImage } from '../types'

export interface ImageListProps {
  onEdit: (id: ImageId) => void
}

function Row({
  image,
  selected,
  unit,
  onEdit,
}: {
  image: LoadedImage
  selected: boolean
  unit: Unit
  onEdit: (id: ImageId) => void
}) {
  const { t } = useTranslation('images')
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const info = dpiInfo(printedPixelSize(image), image.edits.size)
  const size = image.edits.size
  const sizeLabel =
    size.kind === 'auto'
      ? t('list.sizeAuto')
      : t('list.sizeFixed', { value: roundForUnit(mmToUnit(size.mm, unit), unit), unit })

  return (
    <li
      ref={ref}
      aria-current={selected ? 'true' : undefined}
      className="border-line aria-[current=true]:border-accent aria-[current=true]:bg-accent-soft grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-2"
    >
      <img
        src={image.thumbUrl}
        alt=""
        className="size-12 rounded-sm object-cover"
        draggable={false}
      />
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => {
            useImages.getState().select(image.id)
          }}
          aria-label={t('list.select', { name: image.name })}
          className="text-ink block max-w-full truncate text-left font-medium"
        >
          {image.name}
        </button>
        <div className="text-ink-muted flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <span
            className="font-mono tabular-nums"
            aria-label={t('list.pixelsLabel', { w: image.originalPxW, h: image.originalPxH })}
          >
            {t('list.pixels', { w: image.originalPxW, h: image.originalPxH })}
          </span>
          <span aria-hidden="true">{t('list.separator')}</span>
          <span>{sizeLabel}</span>
          {image.edits.copies > 1 && (
            <Badge tone="accent">
              <span aria-label={t('list.copiesLabel', { count: image.edits.copies })}>
                {t('list.copies', { count: image.edits.copies })}
              </span>
            </Badge>
          )}
          {info.low && (
            <Badge tone="warning">
              <span aria-label={t('list.lowDpiLabel', { dpi: Math.round(info.dpi) })}>
                {t('list.dpi', { dpi: Math.round(info.dpi) })}
              </span>
            </Badge>
          )}
        </div>
      </div>
      <div className="flex">
        <IconButton
          label={t('list.edit', { name: image.name })}
          icon="edit"
          onClick={() => {
            onEdit(image.id)
          }}
        />
        <IconButton
          label={t('list.remove', { name: image.name })}
          icon="trash"
          variant="danger"
          onClick={() => {
            useImages.getState().remove(image.id)
          }}
        />
      </div>
    </li>
  )
}

export function ImageList({ onEdit }: ImageListProps) {
  const { t } = useTranslation('images')
  const images = useImages((s) => s.images)
  const selectedId = useImages((s) => s.selectedId)
  const unit = useSettings((s) => s.unit)
  const [confirming, setConfirming] = useState(false)

  const removeAll = (): void => {
    // Owner Q4, default: ask only when 2 or more images would go.
    if (images.length >= 2) setConfirming(true)
    else useImages.getState().clear()
  }

  if (images.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-ink-muted text-sm">{t('list.empty.title')}</p>
        <p className="text-ink-subtle mt-1 text-xs">{t('list.empty.formats')}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-muted text-sm">{t('list.count', { count: images.length })}</span>
        <Button variant="ghost" icon="trash" onClick={removeAll}>
          {t('list.removeAll.button')}
        </Button>
      </div>
      <ul aria-label={t('list.ariaLabel')} className="flex flex-col gap-2 p-0">
        {images.map((image) => (
          <Row
            key={image.id}
            image={image}
            selected={image.id === selectedId}
            unit={unit}
            onEdit={onEdit}
          />
        ))}
      </ul>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        size="sm"
        title={t('list.removeAll.confirmTitle')}
        closeLabel={t('list.removeAll.close')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false)
              }}
            >
              {t('list.removeAll.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false)
                useImages.getState().clear()
              }}
            >
              {t('list.removeAll.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('list.removeAll.confirmBody', { count: images.length })}</p>
      </Dialog>
    </div>
  )
}
