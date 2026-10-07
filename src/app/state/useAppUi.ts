import { create } from 'zustand'
import type { ImageId } from '../../shared/model/image'

export type StepId = 'images' | 'page' | 'studies' | 'preview' | 'export'
export type SettingsTab = 'page' | 'studies'

export interface AppUiState {
  step: StepId
  editingId: ImageId | null
  exportOpen: boolean
  showGuides: boolean
  settingsTab: SettingsTab
  setStep(step: StepId): void
  openEdit(id: ImageId): void
  closeEdit(): void
  openExport(): void
  closeExport(): void
  setShowGuides(show: boolean): void
  setSettingsTab(tab: SettingsTab): void
}

export const useAppUi = create<AppUiState>()((set) => ({
  step: 'images',
  editingId: null,
  exportOpen: false,
  showGuides: true,
  settingsTab: 'page',
  setStep: (step) => {
    set({ step })
  },
  openEdit: (id) => {
    set({ editingId: id })
  },
  closeEdit: () => {
    set({ editingId: null })
  },
  openExport: () => {
    set({ exportOpen: true })
  },
  closeExport: () => {
    set({ exportOpen: false })
  },
  setShowGuides: (showGuides) => {
    set({ showGuides })
  },
  setSettingsTab: (settingsTab) => {
    set({ settingsTab })
  },
}))
