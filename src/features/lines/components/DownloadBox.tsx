import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ProgressBar } from '../../../shared/ui'
import type { AiModel } from '../detect/store'
import { formatMegabytes, formatMegabytesNumber } from '../../../shared/i18n/format'
import type { GuideView } from './use-guide-status'

export interface DownloadBoxProps {
  readonly model: AiModel
  readonly state: Extract<GuideView, { view: 'box' | 'downloading' }>
  readonly onDownload: () => void
  readonly disabled: boolean
  readonly describedBy: string | undefined
}

/** The one-time model download (M4-R19): nothing is fetched until the button is pressed. */
export function DownloadBox({ model, state, onDownload, disabled, describedBy }: DownloadBoxProps) {
  const { t } = useTranslation('lines')
  const sizeId = useId()

  if (state.view === 'downloading') {
    const { loaded, total } = state
    const done = Math.min(loaded, total)
    const shown =
      total > 0 ? { loaded: formatMegabytesNumber(done), total: formatMegabytes(total) } : undefined
    const spoken =
      total > 0
        ? { loaded: formatMegabytesNumber(done), total: formatMegabytesNumber(total) }
        : undefined
    // The bar speaks the amount in words; the visible "MB" line repeats it, so it is hidden from
    // screen readers. Neither is a live region: no continuous announcement (owner Q18, default).
    return (
      <div className="lines-ai-box">
        <p className="text-sm">{t(`guides.${model}.downloading`)}</p>
        <ProgressBar
          value={total > 0 ? loaded / total : null}
          label={t(`guides.${model}.progressLabel`)}
          valueText={spoken && t('guides.progressSpoken', spoken)}
        />
        {shown && (
          <p className="ds-field-hint tabular-nums" aria-hidden="true">
            {t('guides.progress', shown)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="lines-ai-box">
      <p id={sizeId} className="text-sm">
        <strong>{t('guides.size', { size: formatMegabytes(state.bytes) })}</strong>
      </p>
      <p className="ds-field-hint">{t(`guides.${model}.why`)}</p>
      <div>
        <Button
          variant="secondary"
          icon="download"
          disabled={disabled}
          aria-describedby={[sizeId, describedBy].filter(Boolean).join(' ')}
          onClick={onDownload}
        >
          {t('guides.download')}
        </Button>
      </div>
    </div>
  )
}
