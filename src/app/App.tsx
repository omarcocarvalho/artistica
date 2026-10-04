import { useTranslation } from 'react-i18next'
import { useApplyTheme } from '../shared/theme'
import { DesktopWorkspace } from './components/DesktopWorkspace'
import { NoticeRegion } from './components/NoticeRegion'
import { TopBar } from './components/TopBar'
import { AppEffects } from './effects/AppEffects'
import { useIsDesktop } from './hooks/useIsDesktop'
import { MobileFlow } from './mobile/MobileFlow'
import { EditSlot } from './slots/EditSlot'
import { ExportSlot } from './slots/ExportSlot'
import { EmptyActionsSlot, ImagesSlot } from './slots/ImagesSlot'
import { PreviewSlot } from './slots/PreviewSlot'
import { SettingsSlot } from './slots/SettingsSlot'
import { useImageCount } from './state/hasImages'
import { useAppUi } from './state/useAppUi'

export function App() {
  const { t } = useTranslation('app')
  useApplyTheme()
  const isDesktop = useIsDesktop()
  const imageCount = useImageCount()
  const exportDisabledReason = imageCount === 0 ? t('topBar.exportNoImages') : null
  return (
    <div className="bg-canvas text-ink flex h-dvh flex-col">
      <AppEffects />
      <TopBar
        onExport={() => {
          useAppUi.getState().openExport()
        }}
        exportDisabledReason={exportDisabledReason}
      />
      {isDesktop ? (
        <DesktopWorkspace
          imageCount={imageCount}
          images={<ImagesSlot />}
          emptyActions={<EmptyActionsSlot />}
          preview={<PreviewSlot />}
          previewToolbar={null}
          settings={<SettingsSlot />}
        />
      ) : (
        <MobileFlow />
      )}
      <EditSlot />
      <ExportSlot />
      <NoticeRegion />
    </div>
  )
}
