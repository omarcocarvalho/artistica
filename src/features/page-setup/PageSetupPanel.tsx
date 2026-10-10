import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { MIN_SAFE_AREA_MM, paperSizeMm } from '../../shared/model/page-setup'
import { CUSTOM_PAPER_LIMITS, PAPER_IDS, type PaperId } from '../../shared/model/paper'
import { formatLength, formatLengthNumber, unitLabel } from '../../shared/i18n/format'
import type { Unit } from '../../shared/model/units'
import { Callout, NumberField, SegmentedControl, Select, Switch } from '../../shared/ui'
import { useSettings, type PageSetupPatch } from '../settings'
import {
  BLEED_MAX_MM,
  BLEED_MIN_MM,
  GUTTER_MAX_MM,
  NOTE_KEYS,
  SAFE_AREA_MAX_MM,
  clampMm,
  normalizeCustomSize,
  stepMmFor,
} from './page-setup-logic'

export interface PageSetupPanelProps {
  /** Layout engine's "fits N per page" (independent of the images, CR-B6); null/undefined hides the suggestion. */
  readonly suggestedPerPage?: number | null
  /** Orientation the engine resolved for 'auto'; null/undefined hides the hint. */
  readonly resolvedOrientation?: 'portrait' | 'landscape' | null
}

export function PageSetupPanel({
  suggestedPerPage = null,
  resolvedOrientation = null,
}: PageSetupPanelProps): ReactElement {
  const { t } = useTranslation('pageSetup')
  const pageSetup = useSettings((s) => s.pageSetup)
  const unit = useSettings((s) => s.unit)
  const notes = useSettings((s) => s.pageSetupNotes)
  // The store declares its actions as methods; call them through getState() instead of selecting them (unbound-method).
  const setPageSetup = (patch: PageSetupPatch): void => {
    useSettings.getState().setPageSetup(patch)
  }
  const setUnit = (next: Unit): void => {
    useSettings.getState().setUnit(next)
  }

  const size = paperSizeMm(pageSetup)
  const dims = t('paper.dims', {
    w: formatLengthNumber(size.w, unit),
    h: formatLengthNumber(size.h, unit),
    unit: unitLabel(unit),
  })
  const paperLabel =
    pageSetup.paper === 'Custom' ? t('paper.custom').replace('…', '') : pageSetup.paper

  const paperOptions = PAPER_IDS.map((id) => ({
    value: id,
    label: id === 'Custom' ? t('paper.custom') : id,
  }))
  const lengthField = { unit, stepMm: stepMmFor(unit) } as const
  const customLimits = { minMm: CUSTOM_PAPER_LIMITS.minMm, maxMm: CUSTOM_PAPER_LIMITS.maxMm }

  return (
    <div className="flex flex-col">
      <section className="border-line flex flex-col gap-3 border-b py-4" aria-labelledby="ps-paper">
        <h3 id="ps-paper" className="font-display text-base">
          {t('paper.heading')}
        </h3>
        <Select
          label={t('paper.size')}
          value={pageSetup.paper}
          onValueChange={(value) => {
            setPageSetup({ paper: value as PaperId })
          }}
          options={paperOptions}
        />
        <p className="text-ink-muted text-sm tabular-nums">{dims}</p>
        {pageSetup.paper === 'Custom' && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <NumberField
              label={t('paper.width')}
              valueMm={pageSetup.customSize.w}
              onChangeMm={(mm) => {
                setPageSetup({
                  customSize: normalizeCustomSize({ w: mm, h: pageSetup.customSize.h }),
                })
              }}
              {...lengthField}
              {...customLimits}
            />
            <span aria-hidden="true" className="pb-2">
              {t('paper.times')}
            </span>
            <NumberField
              label={t('paper.height')}
              valueMm={pageSetup.customSize.h}
              onChangeMm={(mm) => {
                setPageSetup({
                  customSize: normalizeCustomSize({ w: pageSetup.customSize.w, h: mm }),
                })
              }}
              {...lengthField}
              {...customLimits}
            />
          </div>
        )}
        <SegmentedControl
          label={t('paper.units')}
          value={unit}
          onValueChange={(value) => {
            setUnit(value)
          }}
          options={[
            { value: 'mm', label: t('paper.unitMm') },
            { value: 'in', label: t('paper.unitIn') },
          ]}
        />
        <SegmentedControl
          label={t('orientation.label')}
          value={pageSetup.orientation}
          onValueChange={(value) => {
            setPageSetup({ orientation: value })
          }}
          options={[
            { value: 'auto', label: t('orientation.auto') },
            { value: 'portrait', label: t('orientation.portrait') },
            { value: 'landscape', label: t('orientation.landscape') },
          ]}
        />
        {pageSetup.orientation === 'auto' && resolvedOrientation && (
          <p className="text-ink-muted text-sm">
            {t('orientation.autoPicked', {
              orientation: t(`orientation.resolved.${resolvedOrientation}`),
            })}
          </p>
        )}
      </section>

      <section className="border-line flex flex-col gap-3 border-b py-4" aria-labelledby="ps-space">
        <h3 id="ps-space" className="font-display text-base">
          {t('spacing.heading')}
        </h3>
        <NumberField
          label={t('spacing.safeArea')}
          hint={t('spacing.safeAreaHint', { min: formatLength(MIN_SAFE_AREA_MM, unit) })}
          valueMm={pageSetup.safeAreaMm}
          onChangeMm={(mm) => {
            setPageSetup({ safeAreaMm: clampMm(mm, MIN_SAFE_AREA_MM, SAFE_AREA_MAX_MM) })
          }}
          {...lengthField}
          minMm={MIN_SAFE_AREA_MM}
          maxMm={SAFE_AREA_MAX_MM}
        />
        <Switch
          label={t('spacing.gutter')}
          checked={pageSetup.gutter.enabled}
          onCheckedChange={(enabled) => {
            setPageSetup({ gutter: { ...pageSetup.gutter, enabled } })
          }}
        />
        {pageSetup.gutter.enabled && (
          <NumberField
            label={t('spacing.gutterSize')}
            hint={t('spacing.gutterHint')}
            valueMm={pageSetup.gutter.mm}
            onChangeMm={(mm) => {
              setPageSetup({ gutter: { ...pageSetup.gutter, mm: clampMm(mm, 0, GUTTER_MAX_MM) } })
            }}
            {...lengthField}
            minMm={0}
            maxMm={GUTTER_MAX_MM}
          />
        )}
      </section>

      <section className="border-line flex flex-col gap-3 border-b py-4" aria-labelledby="ps-cut">
        <h3 id="ps-cut" className="font-display text-base">
          {t('cutting.heading')}
        </h3>
        <Switch
          label={t('cutting.cropMarks')}
          checked={pageSetup.cropMarks}
          onCheckedChange={(cropMarks) => {
            setPageSetup({ cropMarks })
          }}
        />
        <Switch
          label={t('cutting.bleed')}
          checked={pageSetup.bleed.enabled}
          onCheckedChange={(enabled) => {
            setPageSetup({ bleed: { ...pageSetup.bleed, enabled } })
          }}
        />
        {pageSetup.bleed.enabled && (
          <NumberField
            label={t('cutting.bleedAmount')}
            hint={t('cutting.bleedHint')}
            valueMm={pageSetup.bleed.mm}
            onChangeMm={(mm) => {
              setPageSetup({
                bleed: { ...pageSetup.bleed, mm: clampMm(mm, BLEED_MIN_MM, BLEED_MAX_MM) },
              })
            }}
            {...lengthField}
            minMm={BLEED_MIN_MM}
            maxMm={BLEED_MAX_MM}
          />
        )}
        {notes.map((note) => (
          <Callout key={note} tone="info" live>
            {t(NOTE_KEYS[note], {
              gutter: formatLength(pageSetup.gutter.mm, unit),
              min: formatLength(MIN_SAFE_AREA_MM, unit),
            })}
          </Callout>
        ))}
      </section>

      <section className="flex flex-col gap-2 py-4">
        {suggestedPerPage !== null && suggestedPerPage > 0 && (
          <p className="rounded-pill bg-surface flex items-center gap-2 self-start px-3 py-1 text-sm">
            <span aria-hidden="true" className="font-hand text-accent">
              {t('suggestion.tip')}
            </span>
            <span>{t('suggestion.text', { paper: paperLabel, count: suggestedPerPage })}</span>
          </p>
        )}
        <p className="text-ink-muted text-sm">{t('remembered')}</p>
      </section>
    </div>
  )
}
