import { useTranslation } from 'react-i18next'
import { HUE_PRESETS, type StudyValues } from '../../../shared/model/study'

export interface HueSwatchesProps {
  readonly legend: string
  readonly values: StudyValues
  readonly onChange: (patch: Partial<StudyValues>) => void
  readonly disabled?: boolean
  readonly describedBy?: string
}

export function HueSwatches({ legend, values, onChange, disabled, describedBy }: HueSwatchesProps) {
  const { t } = useTranslation('studies')
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="studies-swatches">
        {HUE_PRESETS.map((p) => {
          const pressed = p.hue === null ? values.neutral : !values.neutral && values.hue === p.hue
          const name = t(`swatch.${p.id}`)
          return (
            <button
              key={p.id}
              type="button"
              className={
                p.hue === null ? 'studies-swatch studies-swatch--neutral' : 'studies-swatch'
              }
              style={p.hue === null ? undefined : { ['--h' as string]: String(p.hue) }}
              aria-pressed={pressed}
              disabled={disabled}
              aria-describedby={describedBy}
              aria-label={name}
              title={name}
              onClick={() => {
                onChange(p.hue === null ? { neutral: true } : { hue: p.hue, neutral: false })
              }}
            />
          )
        })}
      </div>
    </fieldset>
  )
}
