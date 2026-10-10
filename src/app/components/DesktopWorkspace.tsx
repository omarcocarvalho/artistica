import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
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

/** Focused photos scroll clear of the sticky toolbar (WCAG 2.4.11), however many rows it wraps to. */
function useHeightBelow(toolbar: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const bar = toolbar.current
    if (!bar) return
    const update = () => {
      setHeight(bar.offsetHeight + 8)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(bar)
    return () => {
      ro.disconnect()
    }
  }, [toolbar])
  return height
}

export function DesktopWorkspace(props: DesktopWorkspaceProps) {
  const { t } = useTranslation('app')
  const toolbarRef = useRef<HTMLDivElement>(null)
  const scrollPaddingTop = useHeightBelow(toolbarRef)
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
        style={{ scrollPaddingTop }}
        id="main"
        tabIndex={-1}
        aria-label={t('panels.preview')}
        className="flex min-h-0 flex-col overflow-y-auto"
      >
        <div
          ref={toolbarRef}
          className="text-ink-muted bg-surface border-line sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2 text-sm"
        >
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
