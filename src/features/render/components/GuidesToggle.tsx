import { useTranslation } from 'react-i18next'
import { Switch } from '../../../shared/ui'

export interface GuidesToggleProps {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
}

/** The desk toolbar's "Guides" switch (workspace.html): shows/hides safe area, trim and bleed guides. */
export function GuidesToggle({ checked, onCheckedChange }: GuidesToggleProps) {
  const { t } = useTranslation('preview')
  return <Switch label={t('guides.label')} checked={checked} onCheckedChange={onCheckedChange} />
}
