import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/EmptyState'
import { EmptyActionsSlot } from '../slots/ImagesSlot'

export function MobileFlow() {
  const { t } = useTranslation('app')
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-label={t('panels.preview')}
      className="flex-1 overflow-y-auto"
    >
      <EmptyState actions={<EmptyActionsSlot />} />
    </main>
  )
}
