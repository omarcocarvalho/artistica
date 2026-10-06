import { useTranslation } from 'react-i18next'
import { IconButton } from '../../shared/ui'
import { useNotices, type Notice } from '../state/useNotices'

function Toast({ notice, role }: { notice: Notice; role?: 'alert' }) {
  const { t } = useTranslation('app')
  return (
    <div
      role={role}
      className="border-line bg-surface pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border p-3 shadow-lg"
    >
      <p className="flex-1 text-sm">{notice.message}</p>
      <IconButton
        icon="close"
        label={t('notices.dismiss')}
        onClick={() => {
          useNotices.getState().dismiss(notice.id)
        }}
      />
    </div>
  )
}

export function NoticeRegion() {
  const { t } = useTranslation('app')
  const notices = useNotices((s) => s.notices)
  return (
    <section
      aria-label={t('notices.region')}
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4 min-[960px]:bottom-4"
    >
      {notices
        .filter((n) => n.kind === 'error')
        .map((n) => (
          <Toast key={n.id} notice={n} role="alert" />
        ))}
      <div role="status" className="flex w-full flex-col items-center gap-2">
        {notices
          .filter((n) => n.kind === 'info')
          .map((n) => (
            <Toast key={n.id} notice={n} />
          ))}
      </div>
    </section>
  )
}
