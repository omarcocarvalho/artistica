import { create } from 'zustand'
import type { BlockId } from '../features/layout'

/** Arrange-mode UI state that is not an arrangement: never persisted, never sent. */
export interface ArrangeUiState {
  readonly pickedUp: BlockId | null
  readonly focusId: BlockId | null
  readonly announcement: { readonly text: string; readonly n: number }
  pickUp(id: BlockId | null): void
  requestFocus(id: BlockId | null): void
  focused(id: BlockId): void
  announce(text: string): void
}

export const useArrangeUi = create<ArrangeUiState>()((set, get) => ({
  pickedUp: null,
  focusId: null,
  announcement: { text: '', n: 0 },
  pickUp: (id) => {
    set({ pickedUp: id })
  },
  requestFocus: (id) => {
    set({ focusId: id })
  },
  focused: (id) => {
    if (get().focusId === id) set({ focusId: null })
  },
  announce: (text) => {
    set((s) => ({ announcement: { text, n: s.announcement.n + 1 } }))
  },
}))
