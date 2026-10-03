import { useTranslation } from 'react-i18next'
import { APP_NAME } from '../shared/app-info'

export function App() {
  const { t } = useTranslation('common')
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="font-display text-4xl font-bold">{APP_NAME}</h1>
      <p className="text-lg">{t('app.comingSoon')}</p>
    </main>
  )
}
