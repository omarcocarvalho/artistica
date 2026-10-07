import { useTranslation } from 'react-i18next'
import type { StudyValues } from '../../../shared/model/study'
import { valueRamp } from '../ramp'

export function RampStrip({ values }: { readonly values: StudyValues }) {
  const { t } = useTranslation('studies')
  const ramp = valueRamp(values)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{t('values.ramp')}</span>
      <div
        className="studies-ramp"
        role="img"
        aria-label={t('values.rampLabel', { count: ramp.length })}
      >
        {ramp.map((c, i) => (
          <span
            key={i}
            style={{ backgroundColor: `rgb(${String(c.r)}, ${String(c.g)}, ${String(c.b)})` }}
          />
        ))}
      </div>
      <div className="text-ink-muted flex justify-between text-xs" aria-hidden="true">
        <span>{t('values.darkest')}</span>
        <span>{t('values.lightest')}</span>
      </div>
    </div>
  )
}
