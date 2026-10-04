import { create } from 'zustand'
import type { ImageId } from '../../shared/model/image'

export type StepId = 'images' | 'page' | 'preview' | 'export'

export interface AppUiState {
  step: StepId
  editingId: ImageId | null
  exportOpen: boolean
  showGuides: boolean
  setStep(step: StepId): void
  openEdit(id: ImageId): void
  closeEdit(): void
  openExport(): void
  closeExport(): void
  setShowGuides(show: boolean): void
}

export const useAppUi = create<AppUiState>()((set) => ({
  step: 'images',
  editingId: null,
  exportOpen: false,
  showGuides: true,
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
}))
