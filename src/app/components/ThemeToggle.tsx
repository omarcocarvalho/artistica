import { useTranslation } from 'react-i18next'
import { useSettings } from '../../features/settings'
import { nextTheme } from '../../shared/theme'
import { Button } from '../../shared/ui'

const ICON = { auto: 'auto', light: 'sun', dark: 'moon' } as const

export function ThemeToggle() {
  const { t } = useTranslation('app')
  const theme = useSettings((s) => s.theme)
  const current = t(`theme.${theme}`)
  // WCAG 2.5.3 label in name: the accessible name contains the visible text.
  const label = `${t('theme.change')}: ${current}`
  return (
    <Button
      variant="ghost"
      icon={ICON[theme]}
      aria-label={label}
      onClick={() => {
        useSettings.getState().setTheme(nextTheme(theme))
      }}
    >
      <span className="hidden sm:inline">{current}</span>
    </Button>
  )
}
