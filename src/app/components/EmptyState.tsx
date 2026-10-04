import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../shared/ui'

export interface EmptyStateProps {
  /** Where the import actions mount (C's ImportDropzone in part 2). */
  readonly actions: ReactNode
}

export function EmptyState({ actions }: EmptyStateProps) {
  const { t } = useTranslation('app')
  return (
    <div className="grid flex-1 place-items-center px-6 py-12">
      <div className="border-line bg-surface rounded-sketch relative w-full max-w-lg border-2 border-dashed p-8 text-center">
        <h2 className="font-display text-xl">
          {t('empty.titleBefore')}
          <span className="decoration-accent underline decoration-wavy underline-offset-4">
            {t('empty.titleHighlight')}
          </span>
        </h2>
        <p className="text-ink-muted mt-2 mb-6">{t('empty.body')}</p>
        {actions}
        <p className="text-ink-subtle mt-5 text-sm">{t('empty.formats')}</p>
        <p className="text-success mt-2 flex items-center justify-center gap-1 text-sm">
          <Icon name="lock" />
          {t('empty.privacy')}
        </p>
      </div>
    </div>
  )
}
