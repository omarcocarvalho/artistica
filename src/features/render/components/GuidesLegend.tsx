import { useTranslation } from 'react-i18next'

/** Legend for the screen-only guides (page-setup.html `.legend`). Colours are print-industry, not themed. */
export function GuidesLegend() {
  const { t } = useTranslation('preview')
  const swatch = 'inline-block h-0 w-[18px] border-t-2'
  return (
    <ul
      aria-label={t('guides.legend.label')}
      className="text-ink-muted m-0 flex list-none flex-wrap gap-3 p-0 text-xs"
    >
      <li className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className={`${swatch} border-guide-safe border-dashed`} />
        {t('guides.legend.safe')}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className={`${swatch} border-guide-bleed border-dashed`} />
        {t('guides.legend.bleed')}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className={`${swatch} border-ink-muted border-dotted`} />
        {t('guides.legend.cut')}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <i
          aria-hidden="true"
          className="border-ink inline-block h-0 w-2.5 border-t-2 border-solid"
        />
        {t('guides.legend.mark')}
      </li>
    </ul>
  )
}
