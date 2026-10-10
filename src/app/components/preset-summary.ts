import {
  COMPOSITION_LINE_TYPES,
  type CompositionLineType,
  type LineSettings,
} from '../../shared/model/lines'
import type { Preset } from '../../shared/model/preset'
import type { StudyVersion } from '../../shared/model/study'
import { mmToUnit, roundForUnit, type Mm, type Unit } from '../../shared/model/units'

export type I18nT = (key: string, options?: Record<string, unknown>) => string

const lineOn: Record<CompositionLineType, (l: LineSettings) => boolean> = {
  grid: (l) => l.grid.on,
  thirds: (l) => l.thirds,
  armature: (l) => l.armature,
  golden: (l) => l.golden,
  spiral: (l) => l.spiral.on,
  centre: (l) => l.centre,
}

/** "A4 · Auto · values 5 · thirds": paper, orientation, bleed when on, versions, composition lines. `t` is bound to `presets`. */
export function presetSummary(preset: Preset, unit: Unit, t: I18nT): string {
  const { pageSetup, study, lines } = preset
  const num = (mm: Mm): string => String(roundForUnit(mmToUnit(mm, unit), unit))
  const paper =
    pageSetup.paper === 'Custom'
      ? t('summary.custom', {
          w: num(pageSetup.customSize.w),
          h: num(pageSetup.customSize.h),
          unit,
        })
      : pageSetup.paper
  const versionText: Record<StudyVersion, string> = {
    original: t('summary.version.original'),
    blurred: t('summary.version.blurred', { pct: study.blurPct }),
    values: t('summary.version.values', { count: study.values.count }),
    blurValues: t('summary.version.blurValues', { count: study.values.count }),
  }
  const plus = t('summary.plus')
  const activeLines = COMPOSITION_LINE_TYPES.filter((type) => lineOn[type](lines))
  const parts = [
    paper,
    t(`summary.orientation.${pageSetup.orientation}`),
    ...(pageSetup.bleed.enabled
      ? [t('summary.bleed', { size: `${num(pageSetup.bleed.mm)} ${unit}` })]
      : []),
    study.versions.map((v) => versionText[v]).join(plus),
    ...(activeLines.length > 0
      ? [activeLines.map((type) => t(`summary.line.${type}`)).join(plus)]
      : []),
  ]
  return parts.join(t('summary.separator'))
}
