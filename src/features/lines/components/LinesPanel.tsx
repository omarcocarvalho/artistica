import { useId, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useImages } from '../../images'
import type { ImageId } from '../../../shared/model/image'
import {
  LINE_WIDTH_STEP_MM,
  MAX_GRID,
  MAX_LINE_OPACITY_PCT,
  MAX_LINE_WIDTH_MM,
  MIN_GRID,
  MIN_LINE_OPACITY_PCT,
  MIN_LINE_WIDTH_MM,
  SPIRAL_CORNERS,
  type CompositionLineType,
  type LineSettings,
  type LinesPatch,
} from '../../../shared/model/lines'
import {
  Button,
  ColourField,
  CountField,
  SegmentedControl,
  Slider,
  Switch,
  useImportWait,
  VisuallyHidden,
} from '../../../shared/ui'
import './lines.css'

export interface LinesPanelProps {
  readonly imageId: ImageId | null
}

const SECTION = 'border-line flex flex-col gap-3 border-b py-4'
const HINT = 'text-ink-muted text-xs'
const PLAIN_TYPES = [
  'thirds',
  'armature',
  'golden',
] as const satisfies readonly CompositionLineType[]

const toStep = (mm: number) =>
  Math.round(Math.round(mm / LINE_WIDTH_STEP_MM) * LINE_WIDTH_STEP_MM * 100) / 100

/** The Lines controls for one image (design/lines.html). Content only: the shell adds chrome. */
export function LinesPanel({ imageId }: LinesPanelProps) {
  const { t } = useTranslation('lines')
  const image = useImages((s) => s.images.find((i) => i.id === imageId))
  const imageCount = useImages((s) => s.images.length)
  const { waiting, hintId, hintRef, panelRef } = useImportWait(useImages((s) => s.importing > 0))
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number } | null>(null)
  const [announcedFor, setAnnouncedFor] = useState(imageId)
  if (announcedFor !== imageId) {
    setAnnouncedFor(imageId)
    setAnnouncement(null)
  }
  const baseId = useId()
  const compositionId = `${baseId}-composition`
  const styleId = `${baseId}-style`
  const busy = waiting ? hintId : undefined

  let content
  if (!image) {
    content = <p className="text-ink-muted py-4 text-sm">{t('panel.noImage')}</p>
  } else {
    const { id } = image
    const lines: LineSettings = image.lines
    const patch = (p: LinesPatch) => {
      useImages.getState().updateLines(id, p)
    }
    const range = t('grid.range', { min: MIN_GRID, max: MAX_GRID })

    content = (
      <>
        <section className="border-line flex flex-col gap-1 border-b pb-4">
          <p className="text-ink-muted text-sm">
            <Trans
              t={t}
              i18nKey="panel.forImage"
              components={{ name: <strong className="text-ink">{image.name}</strong> }}
            />
          </p>
          <p className={HINT}>{t('panel.everyVersion')}</p>
        </section>

        <section className={SECTION} aria-labelledby={compositionId}>
          <h3 id={compositionId} className="font-display text-base">
            {t('panel.composition')}
          </h3>
          <Switch
            label={t('type.grid')}
            checked={lines.grid.on}
            disabled={waiting}
            describedBy={busy}
            onCheckedChange={(on) => {
              patch({ grid: { on } })
            }}
          />
          {lines.grid.on && (
            <div className="lines-pair">
              <CountField
                label={t('grid.columns')}
                value={lines.grid.cols}
                min={MIN_GRID}
                max={MAX_GRID}
                rangeHint={range}
                disabled={waiting}
                describedBy={busy}
                onValueChange={(cols) => {
                  patch({ grid: { cols } })
                }}
              />
              <span className="lines-pair__times" aria-hidden="true">
                {t('grid.times')}
              </span>
              <CountField
                label={t('grid.rows')}
                value={lines.grid.rows}
                min={MIN_GRID}
                max={MAX_GRID}
                rangeHint={range}
                disabled={waiting}
                describedBy={busy}
                onValueChange={(rows) => {
                  patch({ grid: { rows } })
                }}
              />
            </div>
          )}
          {PLAIN_TYPES.map((type) => (
            <Switch
              key={type}
              label={t(`type.${type}`)}
              checked={lines[type]}
              disabled={waiting}
              describedBy={busy}
              onCheckedChange={(on) => {
                patch({ [type]: on })
              }}
            />
          ))}
          <Switch
            label={t('type.spiral')}
            checked={lines.spiral.on}
            disabled={waiting}
            describedBy={busy}
            onCheckedChange={(on) => {
              patch({ spiral: { on } })
            }}
          />
          {lines.spiral.on && (
            <div className="ds-field">
              <span className="lines-field-label" aria-hidden="true">
                {t('spiral.startsAt')}
              </span>
              <SegmentedControl
                label={t('spiral.startsAt')}
                block
                value={lines.spiral.corner}
                disabled={waiting}
                describedBy={busy}
                onValueChange={(corner) => {
                  patch({ spiral: { corner } })
                }}
                options={SPIRAL_CORNERS.map((corner) => ({
                  value: corner,
                  label: (
                    <>
                      <span className="lines-corner__arrow" aria-hidden="true">
                        {t(`spiral.arrow.${corner}`)}
                      </span>
                      <VisuallyHidden>{t(`corner.${corner}`)}</VisuallyHidden>
                    </>
                  ),
                }))}
              />
            </div>
          )}
          <Switch
            label={t('type.centre')}
            checked={lines.centre}
            disabled={waiting}
            describedBy={busy}
            onCheckedChange={(on) => {
              patch({ centre: on })
            }}
          />
        </section>

        <section className={SECTION} aria-labelledby={styleId}>
          <h3 id={styleId} className="font-display text-base">
            {t('panel.style')}
          </h3>
          <ColourField
            label={t('colour.label')}
            value={lines.style.colour}
            disabled={waiting}
            describedBy={busy}
            onValueChange={(colour) => {
              patch({ style: { colour } })
            }}
          />
          <Slider
            label={t('thickness.label')}
            value={lines.style.widthMm}
            min={MIN_LINE_WIDTH_MM}
            max={MAX_LINE_WIDTH_MM}
            step={LINE_WIDTH_STEP_MM}
            disabled={waiting}
            describedBy={busy}
            onValueChange={(mm) => {
              if (mm < MIN_LINE_WIDTH_MM || mm > MAX_LINE_WIDTH_MM) return
              patch({ style: { widthMm: toStep(mm) } })
            }}
            formatValue={(mm) => t('thickness.value', { mm })}
            minLabel={t('thickness.value', { mm: MIN_LINE_WIDTH_MM })}
            maxLabel={t('thickness.value', { mm: MAX_LINE_WIDTH_MM })}
          />
          <Slider
            label={t('opacity.label')}
            value={lines.style.opacityPct}
            min={MIN_LINE_OPACITY_PCT}
            max={MAX_LINE_OPACITY_PCT}
            disabled={waiting}
            describedBy={busy}
            onValueChange={(pct) => {
              if (pct < MIN_LINE_OPACITY_PCT || pct > MAX_LINE_OPACITY_PCT) return
              patch({ style: { opacityPct: Math.round(pct) } })
            }}
            formatValue={(pct) => t('opacity.value', { pct })}
            minLabel={t('opacity.value', { pct: MIN_LINE_OPACITY_PCT })}
            maxLabel={t('opacity.value', { pct: MAX_LINE_OPACITY_PCT })}
          />
        </section>

        <section className="flex flex-col gap-2 py-4">
          <Button
            block
            icon="copy"
            disabled={imageCount < 2 || waiting}
            aria-describedby={busy}
            onClick={() => {
              const n = useImages.getState().applyLinesToAll(id)
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
    <div ref={panelRef} className="lines-panel flex flex-col">
      <p
        ref={hintRef}
        id={hintId}
        tabIndex={-1}
        aria-live="polite"
        className={waiting ? `${HINT} pb-3` : HINT}
      >
        {waiting ? t('panel.waiting') : null}
      </p>
      {content}
      <VisuallyHidden role="status" aria-live="polite">
        {announcement !== null ? <span key={announcement.seq}>{announcement.text}</span> : null}
      </VisuallyHidden>
    </div>
  )
}
