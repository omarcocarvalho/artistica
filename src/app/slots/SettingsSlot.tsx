import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSetupPanel } from '../../features/page-setup'
import { Tabs } from '../../shared/ui'
import { usePages } from '../pages-store'
import { useImageCount } from '../state/hasImages'
import { useAppUi, type SettingsTab } from '../state/useAppUi'
import { StudiesSlot } from './StudiesSlot'

function PageSetupSlot() {
  const layout = usePages((s) => s.layout)
  const imageCount = useImageCount()
  return (
    <PageSetupPanel
      suggestedPerPage={layout?.suggestedPerPage ?? null}
      resolvedOrientation={imageCount > 0 ? (layout?.orientation ?? null) : null}
    />
  )
}

const SETTINGS_TABS: readonly SettingsTab[] = ['page', 'studies']
const isSettingsTab = (id: string): id is SettingsTab => SETTINGS_TABS.some((tab) => tab === id)

export function SettingsSlot({ variant }: { readonly variant: 'desktop' | 'phone' }) {
  const { t } = useTranslation('app')
  const tab = useAppUi((s) => s.settingsTab)
  if (variant === 'phone') return <PageSetupSlot />
  const panels: Record<SettingsTab, ReactNode> = {
    page: <PageSetupSlot />,
    studies: <StudiesSlot variant="desktop" />,
  }
  return (
    <Tabs
      label={t('settingsTabs.label')}
      value={tab}
      onValueChange={(id) => {
        if (isSettingsTab(id)) useAppUi.getState().setSettingsTab(id)
      }}
      items={SETTINGS_TABS.map((id) => ({
        id,
        label: t(`settingsTabs.${id}`),
        content: (
          <>
            <h2 className="sr-only">{t(`settingsTabs.${id}`)}</h2>
            {panels[id]}
          </>
        ),
      }))}
    />
  )
}
