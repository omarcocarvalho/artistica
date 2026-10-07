import { useId, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useImages } from '../../images'
import type { ImageId } from '../../../shared/model/image'
import {
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
  STUDY_VERSIONS,
  withVersion,
  type StudyPatch,
} from '../../../shared/model/study'
import { Button, Chip, Slider, VisuallyHidden } from '../../../shared/ui'
import { HueSwatches } from './HueSwatches'
import { RampStrip } from './RampStrip'
import './studies.css'

export interface StudiesPanelProps {
  readonly imageId: ImageId | null
}

const SECTION = 'border-line flex flex-col gap-3 border-b py-4'
const HINT = 'text-ink-muted text-xs'
const MAX_HUE = 359

/** The Studies controls for one image (design/studies.html). Content only: the shell adds chrome. */
export function StudiesPanel({ imageId }: StudiesPanelProps) {
  const { t } = useTranslation('studies')
  const image = useImages((s) => s.images.find((i) => i.id === imageId))
  const imageCount = useImages((s) => s.images.length)
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number } | null>(null)
  const [announcedFor, setAnnouncedFor] = useState(imageId)
  if (announcedFor !== imageId) {
    setAnnouncedFor(imageId)
    setAnnouncement(null)
  }
  const baseId = useId()
  const lastOneId = `${baseId}-last`
  const blurHeadingId = `${baseId}-blur`
  const valuesHeadingId = `${baseId}-values`

  let content
  if (!image) {
    content = <p className="text-ink-muted py-4 text-sm">{t('panel.noImage')}</p>
  } else {
    const { study, id } = image
    const patch = (p: StudyPatch) => {
      useImages.getState().updateStudy(id, p)
    }
    // Ignores out-of-range input: the store would clamp it, and reset NaN to the global default.
    const within = (min: number, max: number, apply: (n: number) => void) => (n: number) => {
      if (Number.isFinite(n) && n >= min && n <= max) apply(n)
    }
    const only = study.versions.length === 1

    content = (
      <>
        <section className="border-line flex flex-col gap-3 border-b pb-4">
          <p className="text-ink-muted text-sm">
            <Trans
              t={t}
              i18nKey="panel.forImage"
              components={{ name: <strong className="text-ink">{image.name}</strong> }}
            />
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">{t('versions.legend')}</legend>
            <div className="flex flex-wrap gap-2">
              {STUDY_VERSIONS.map((v) => {
                const on = study.versions.includes(v)
                const locked = on && only
                return (
                  <Chip
                    key={v}
                    checked={on}
                    aria-disabled={locked || undefined}
                    aria-describedby={locked ? lastOneId : undefined}
                    onCheckedChange={(next) => {
                      patch({ versions: withVersion(study, v, next).versions })
                    }}
                  >
                    {t(`version.${v}`)}
                  </Chip>
                )
              })}
            </div>
            <span className={HINT}>{t('versions.hint')}</span>
            {only && (
              <span id={lastOneId} className={HINT}>
                {t('versions.lastOne')}
              </span>
            )}
          </fieldset>
        </section>

        <section className={SECTION} aria-labelledby={blurHeadingId}>
          <h3 id={blurHeadingId} className="font-display text-base">
            {t('blur.heading')}{' '}
            <span className="font-hand text-accent studies-accent" aria-hidden="true">
              {t('blur.accent')}
            </span>
          </h3>
          <Slider
            label={t('blur.amount')}
            value={study.blurPct}
            min={MIN_BLUR_PCT}
            max={MAX_BLUR_PCT}
            onValueChange={within(MIN_BLUR_PCT, MAX_BLUR_PCT, (blurPct) => {
              patch({ blurPct })
            })}
            formatValue={(pct) => t('blur.valueText', { pct })}
            minLabel={t('blur.min')}
            maxLabel={t('blur.max')}
          />
          <span className={HINT}>{t('blur.hint', { pct: study.blurPct })}</span>
          <span className={HINT}>{t('blur.usedBy')}</span>
        </section>

        <section className={SECTION} aria-labelledby={valuesHeadingId}>
          <h3 id={valuesHeadingId} className="font-display text-base">
            {t('values.heading')}
          </h3>
          <Slider
            label={t('values.count')}
            value={study.values.count}
            min={MIN_VALUES}
            max={MAX_VALUES}
            onValueChange={within(MIN_VALUES, MAX_VALUES, (count) => {
              patch({ values: { count } })
            })}
            formatValue={(count) => t('values.countText', { count })}
            minLabel={t('values.min')}
            maxLabel={t('values.max')}
          />
          <HueSwatches
            legend={t('values.hue')}
            values={study.values}
            onChange={(values) => {
              patch({ values })
            }}
          />
          <Slider
            label={t('values.customHue')}
            value={study.values.hue}
            min={0}
            max={MAX_HUE}
            onValueChange={within(0, MAX_HUE, (hue) => {
              patch({ values: { hue, neutral: false } })
            })}
            formatValue={(deg) => t('values.hueText', { deg })}
          />
          <RampStrip values={study.values} />
          <span className={HINT}>{t('values.hint')}</span>
          <span className={HINT}>{t('values.usedBy')}</span>
        </section>

        <section className="flex flex-col gap-2 py-4">
          <Button
            block
            icon="copy"
            disabled={imageCount < 2}
            onClick={() => {
              const n = useImages.getState().applyStudyToAll(id)
              setAnnouncement((prev) => ({
                text: n === 0 ? t('applyAll.nothingChanged') : t('applyAll.done', { count: n }),
                seq: (prev?.seq ?? 0) + 1,
              }))
            }}
          >
            {t('applyAll.button')}
          </Button>
          <span className={HINT}>{t('applyAll.hint', { count: imageCount })}</span>
        </section>
      </>
    )
  }

  return (
    <div className="studies-panel flex flex-col">
      {content}
      <VisuallyHidden role="status" aria-live="polite">
        {announcement !== null ? <span key={announcement.seq}>{announcement.text}</span> : null}
      </VisuallyHidden>
    </div>
  )
}
