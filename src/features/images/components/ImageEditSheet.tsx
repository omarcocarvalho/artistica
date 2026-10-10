import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MAX_COPIES,
  printedPixelSize,
  type CropAspect,
  type ImageId,
} from '../../../shared/model/image'
import { MIN_COMFORT_SHORT_SIDE_MM } from '../../../shared/model/page-setup'
import { formatLength, formatLengthNumber, unitLabel } from '../../../shared/i18n/format'
import { Button, Callout, IconButton, NumberField, SegmentedControl } from '../../../shared/ui'
import { useSettings } from '../../settings'
import { fullCrop } from '../crop'
import { displaySize } from '../view'
import { dpiInfo, fixedSizeMm } from '../dpi'
import {
  resetCrop,
  rotate,
  setAspect,
  setCopies,
  setCrop,
  setFixedAxis,
  setFixedMm,
  setSizeKind,
  toggleFlip,
} from '../edit-actions'
import { MAX_FIXED_MM, MIN_FIXED_MM, cropAspectRatio } from '../edits'
import { useImages } from '../store'
import { CropEditor } from './CropEditor'

export interface ImageEditSheetProps {
  imageId: ImageId
}

/** `portraitKey` is the label used when the displayed picture is portrait (owner Q3, default: 4:3, 3:2 and 16:9 flip to 3:4, 2:3 and 9:16). The stored `CropAspect` value does not change; `cropAspectRatio` flips the ratio itself. */
const ASPECTS: readonly { value: CropAspect; key: string; portraitKey?: string }[] = [
  { value: 'free', key: 'free' },
  { value: 'original', key: 'original' },
  { value: '1:1', key: 'ratio11' },
  { value: '4:3', key: 'ratio43', portraitKey: 'ratio34' },
  { value: '3:2', key: 'ratio32', portraitKey: 'ratio23' },
  { value: '16:9', key: 'ratio169', portraitKey: 'ratio916' },
]

export function ImageEditSheet({ imageId }: ImageEditSheetProps) {
  const { t } = useTranslation('images')
  const image = useImages((s) => s.images.find((i) => i.id === imageId))
  const unit = useSettings((s) => s.unit)
  const copiesId = useId()
  const warnId = useId()
  const aspectName = useId()

  if (!image) return null

  const d = { pxW: image.pxW, pxH: image.pxH }
  const e = image.edits
  const commit = (next: typeof e): void => {
    useImages.getState().updateEdits(image.id, next)
  }
  const printed = printedPixelSize(image)
  const info = dpiInfo(printed, e.size)
  const ratio = cropAspectRatio(e.cropAspect, d.pxW, d.pxH, e.rotation)
  const shown = displaySize(d.pxW, d.pxH, e.rotation)
  const portrait = shown.h > shown.w // the chips follow the displayed orientation (owner Q3, default)
  const view = { rotation: e.rotation, flipH: e.flipH, flipV: e.flipV }
  const dpi = Math.round(info.dpi)
  const fixed = e.size.kind === 'fixed' ? e.size : null
  const dims = fixed ? fixedSizeMm(printed, fixed) : null
  const sharp = info.sharpUpToMm

  return (
    <div className="@container flex flex-col gap-6">
      <div className="grid gap-6 @xl:grid-cols-[minmax(0,1.25fr)_minmax(16rem,1fr)]">
        <div className="flex flex-col gap-4">
          <CropEditor
            bitmap={image.preview}
            pxW={d.pxW}
            pxH={d.pxH}
            crop={e.crop ?? fullCrop(d.pxW, d.pxH)}
            ratio={ratio}
            view={view}
            onChange={(crop) => {
              commit(setCrop(e, d, crop))
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label={t('editSheet.transform.group')} className="flex gap-2">
              <IconButton
                label={t('editSheet.transform.rotateLeft')}
                icon="rotateLeft"
                variant="secondary"
                onClick={() => {
                  commit(rotate(e, d, 'ccw'))
                }}
              />
              <IconButton
                label={t('editSheet.transform.rotateRight')}
                icon="rotateRight"
                variant="secondary"
                onClick={() => {
                  commit(rotate(e, d, 'cw'))
                }}
              />
              <IconButton
                label={t('editSheet.transform.flipH')}
                icon="flipH"
                variant="secondary"
                aria-pressed={e.flipH}
                onClick={() => {
                  commit(toggleFlip(e, d, 'h'))
                }}
              />
              <IconButton
                label={t('editSheet.transform.flipV')}
                icon="flipV"
                variant="secondary"
                aria-pressed={e.flipV}
                onClick={() => {
                  commit(toggleFlip(e, d, 'v'))
                }}
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                commit(resetCrop(e, d))
              }}
            >
              {t('editSheet.crop.reset')}
            </Button>
          </div>
          <fieldset className="m-0 border-0 p-0">
            <legend className="text-ink mb-2 text-sm font-medium">
              {t('editSheet.crop.shape')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {ASPECTS.map(({ value, key, portraitKey }) => {
                const id = `${aspectName}-${key}`
                return (
                  <span key={value} className="relative">
                    <input
                      id={id}
                      type="radio"
                      name={aspectName}
                      checked={e.cropAspect === value}
                      onChange={() => {
                        commit(setAspect(e, d, value))
                      }}
                      className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                    <label
                      htmlFor={id}
                      className="border-line-strong bg-surface text-ink peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-on-accent-soft peer-focus-visible:outline-secondary touch:min-h-(--size-target) touch:min-w-(--size-target) inline-flex min-h-9 items-center justify-center rounded-full border px-3 text-sm peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2"
                    >
                      {t(`editSheet.aspect.${portrait && portraitKey ? portraitKey : key}`)}
                    </label>
                  </span>
                )
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label htmlFor={copiesId} className="text-ink text-sm font-medium">
              {t('editSheet.copies.label')}
            </label>
            <div className="border-line-strong inline-flex w-fit items-center overflow-hidden rounded-md border">
              <button
                type="button"
                aria-label={t('editSheet.copies.less')}
                disabled={e.copies <= 1}
                onClick={() => {
                  commit(setCopies(e, d, e.copies - 1))
                }}
                className="touch:size-(--size-target) size-10 text-lg disabled:opacity-40"
              >
                {t('editSheet.copies.lessGlyph')}
              </button>
              <input
                id={copiesId}
                type="number"
                min={1}
                max={MAX_COPIES}
                value={e.copies}
                onChange={(ev) => {
                  const n = ev.target.valueAsNumber
                  if (Number.isFinite(n)) commit(setCopies(e, d, n))
                }}
                className="border-line-strong bg-surface text-ink touch:h-(--size-target) h-10 w-14 border-x text-center text-base"
              />
              <button
                type="button"
                aria-label={t('editSheet.copies.more')}
                disabled={e.copies >= MAX_COPIES}
                onClick={() => {
                  commit(setCopies(e, d, e.copies + 1))
                }}
                className="touch:size-(--size-target) size-10 text-lg disabled:opacity-40"
              >
                {t('editSheet.copies.moreGlyph')}
              </button>
            </div>
            <span className="text-ink-muted text-sm">{t('editSheet.copies.hint')}</span>
          </div>

          <div className="flex flex-col gap-2">
            <SegmentedControl
              label={t('editSheet.size.label')}
              value={e.size.kind}
              onValueChange={(kind: 'auto' | 'fixed') => {
                commit(setSizeKind(e, d, kind))
              }}
              options={[
                { value: 'auto', label: t('editSheet.size.auto') },
                { value: 'fixed', label: t('editSheet.size.fixed') },
              ]}
            />
            {!fixed && (
              <span className="text-ink-muted text-sm">
                {t('editSheet.size.autoHint', {
                  size: formatLength(MIN_COMFORT_SHORT_SIDE_MM, 'mm'),
                })}
              </span>
            )}
          </div>

          {fixed && dims && (
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-3">
                <SegmentedControl
                  label={t('editSheet.size.axisLabel')}
                  value={fixed.axis}
                  onValueChange={(axis: 'width' | 'height') => {
                    commit(setFixedAxis(e, d, axis))
                  }}
                  options={[
                    { value: 'width', label: t('editSheet.size.width') },
                    { value: 'height', label: t('editSheet.size.height') },
                  ]}
                />
                <div className="grow">
                  <NumberField
                    label={t(
                      fixed.axis === 'width' ? 'editSheet.size.width' : 'editSheet.size.height',
                    )}
                    valueMm={fixed.mm}
                    onChangeMm={(mm) => {
                      commit(setFixedMm(e, d, mm))
                    }}
                    unit={unit}
                    minMm={MIN_FIXED_MM}
                    maxMm={MAX_FIXED_MM}
                    stepMm={1}
                  />
                </div>
              </div>
              <p className="text-ink-muted text-sm">
                {fixed.axis === 'width'
                  ? t('editSheet.size.followsHeight', { value: formatLength(dims.h, unit) })
                  : t('editSheet.size.followsWidth', { value: formatLength(dims.w, unit) })}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink font-medium">{t('editSheet.dpi.label')}</span>
              <strong
                className={`font-mono tabular-nums ${info.low ? 'text-warning' : 'text-ink'}`}
              >
                {t('editSheet.dpi.value', { dpi })}
              </strong>
            </div>
            <div
              role="meter"
              aria-label={t('editSheet.dpi.label')}
              aria-valuemin={0}
              aria-valuemax={400}
              aria-valuenow={Math.min(400, dpi)}
              aria-valuetext={t('editSheet.dpi.value', { dpi })}
              aria-describedby={info.low ? warnId : undefined}
              className="border-line-strong bg-surface-sunken relative h-2 overflow-hidden rounded-full border"
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${info.low ? 'bg-warning' : 'bg-success'}`}
                style={{ width: `${String(Math.min(100, (dpi / 400) * 100))}%` }}
              />
              <span className="bg-ink absolute -inset-y-0.5 left-3/4 w-0.5" />
            </div>
            <div className="text-ink-subtle flex text-xs" aria-hidden="true">
              <span>{t('editSheet.dpi.scale0')}</span>
              <span className="mr-[20%] ml-auto">{t('editSheet.dpi.scale300')}</span>
              <span>{t('editSheet.dpi.scale400')}</span>
            </div>
            {!info.low && !fixed && (
              <p className="text-ink-muted text-sm">{t('editSheet.dpi.autoOk')}</p>
            )}
          </div>

          {info.low && (
            <div id={warnId}>
              <Callout tone="warning" title={t('editSheet.dpi.lowTitle')}>
                {fixed
                  ? t('editSheet.dpi.lowFixed', {
                      w: formatLengthNumber(sharp.w, unit),
                      h: formatLengthNumber(sharp.h, unit),
                      unit: unitLabel(unit),
                    })
                  : t('editSheet.dpi.lowAuto', {
                      size: formatLength(MIN_COMFORT_SHORT_SIDE_MM, 'mm'),
                      dpi,
                    })}
              </Callout>
            </div>
          )}
        </div>
      </div>

      <div>
        <Button
          variant="danger"
          onClick={() => {
            useImages.getState().remove(image.id)
          }}
        >
          {t('editSheet.actions.remove')}
        </Button>
      </div>
    </div>
  )
}
