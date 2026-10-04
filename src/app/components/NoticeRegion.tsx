import { useTranslation } from 'react-i18next'
import { IconButton } from '../../shared/ui'
import { useNotices } from '../state/useNotices'

export function NoticeRegion() {
  const { t } = useTranslation('app')
  const notices = useNotices((s) => s.notices)
  return (
    <section
      aria-label={t('notices.region')}
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4 min-[960px]:bottom-4"
    >
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className="border-line bg-surface pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border p-3 shadow-lg"
        >
          <p className="flex-1 text-sm">{n.message}</p>
          <IconButton
            icon="close"
            label={t('notices.dismiss')}
            onClick={() => {
              useNotices.getState().dismiss(n.id)
            }}
          />
        </div>
      ))}
    </section>
  )
}
