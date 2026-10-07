import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../shared/ui'
import { EmptyState } from './EmptyState'

export interface DesktopWorkspaceProps {
  readonly imageCount: number
  readonly images: ReactNode
  readonly emptyActions: ReactNode
  readonly preview: ReactNode
  readonly previewToolbar: ReactNode
  readonly settings: ReactNode
}

export function DesktopWorkspace(props: DesktopWorkspaceProps) {
  const { t } = useTranslation('app')
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[248px_1fr_320px] min-[1200px]:grid-cols-[288px_1fr_352px]">
      <aside
        aria-labelledby="images-title"
        className="border-line bg-surface flex min-h-0 flex-col overflow-y-auto border-r"
      >
        <h2 id="images-title" className="font-display flex items-center gap-2 p-4 text-lg">
          {t('panels.images')} <Badge>{props.imageCount}</Badge>
        </h2>
        {props.images}
      </aside>
      <main
        id="main"
        tabIndex={-1}
        aria-label={t('panels.preview')}
        className="flex min-h-0 flex-col overflow-y-auto"
      >
        <div className="text-ink-muted flex items-center gap-3 px-4 py-2 text-sm">
          {props.imageCount === 0 ? <span>{t('empty.noPages')}</span> : null}
          <span className="flex-1" />
          {props.previewToolbar}
        </div>
        {props.imageCount === 0 ? <EmptyState actions={props.emptyActions} /> : props.preview}
      </main>
      <aside
        aria-label={t('panels.settings')}
        className="border-line bg-surface min-h-0 overflow-y-auto border-l"
      >
        {props.settings}
      </aside>
    </div>
  )
}
