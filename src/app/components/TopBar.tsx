import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Icon, VisuallyHidden } from '../../shared/ui'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export interface TopBarProps {
  readonly onExport: () => void
  /** Non-null disables Export and is announced as its description. */
  readonly exportDisabledReason: string | null
}

export function TopBar({ onExport, exportDisabledReason }: TopBarProps) {
  const { t } = useTranslation('app')
  const reasonId = useId()
  const disabled = exportDisabledReason !== null
  return (
    <header className="border-line bg-surface flex min-w-0 items-center gap-2 border-b px-4 py-2">
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        {t('skipToPreview')}
      </a>
      <a href="../" aria-label={t('topBar.home')} className="shrink-0">
        <Logo />
      </a>
      <h1 className="font-display min-w-0 truncate text-lg">{t('title')}</h1>
      <span className="bg-canvas text-ink-muted hidden items-center gap-1 rounded-full px-3 py-1 text-sm sm:inline-flex">
        <Icon name="lock" />
        {t('topBar.privacy')}
      </span>
      <span className="min-w-0 flex-1" />
      <ThemeToggle />
      <Button
        variant="primary"
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        icon="download"
        onClick={disabled ? undefined : onExport}
      >
        {t('topBar.export')}
      </Button>
      {disabled && <VisuallyHidden id={reasonId}>{exportDisabledReason}</VisuallyHidden>}
    </header>
  )
}
