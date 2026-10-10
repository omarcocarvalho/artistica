import { create } from 'zustand'
import { selectImageDescriptors, useImages } from '../features/images'
import {
  blockIdOf,
  buildLayoutItems,
  manualFromLayout,
  type BlockId,
  type ManualLayout,
  type ManualOutcome,
  type OpRefusal,
  type OpResult,
} from '../features/layout'
import { useSettings } from '../features/settings'
import { usePages } from './pages-store'

export const MAX_UNDO = 50

/**
 * Session state only (M5-R7): it holds image ids, so it is never persisted. An undo step of `null`
 * is the automatic layout, so undoing the first edit ends the arrangement.
 */
export interface ArrangeState {
  readonly mode: boolean
  readonly manual: ManualLayout | null
  readonly undo: readonly (ManualLayout | null)[]
  readonly selected: BlockId | null
  setMode(on: boolean): void
  select(id: BlockId | null): void
  apply(op: (m: ManualLayout) => OpResult): OpRefusal | null
  undoLast(): void
  rerunAuto(): void
  adopt(outcome: ManualOutcome): void
}

const currentItems = () => buildLayoutItems(selectImageDescriptors(useImages.getState()))

function shownAsManual(): ManualLayout | null {
  const { layout, empty } = usePages.getState()
  if (layout === null || empty) return null
  return manualFromLayout(layout, currentItems(), useSettings.getState().pageSetup)
}

/**
 * B1 ruling: an operation on a block id that is not in the manual layout throws, so stale ids go.
 * With the automatic layout, a selection is kept while its photo copy is loaded.
 */
function keptSelection(selected: BlockId | null, manual: ManualLayout | null): BlockId | null {
  if (selected === null) return null
  const ids = manual === null ? currentItems().map(blockIdOf) : manual.blocks.map((b) => b.blockId)
  return ids.includes(selected) ? selected : null
}

const sameLayout = (a: ManualLayout, b: ManualLayout): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

const AUTO = { manual: null, undo: [], selected: null } as const

export const useArrange = create<ArrangeState>()((set, get) => ({
  mode: false,
  manual: null,
  undo: [],
  selected: null,
  setMode: (on) => {
    set({ mode: on })
  },
  select: (id) => {
    set({ selected: id })
  },
  apply: (op) => {
    const stored = get().manual
    const current = stored ?? shownAsManual()
    if (current === null) return null
    const result = op(current)
    if (!result.ok) return result.reason
    set((s) => ({ manual: result.manual, undo: [...s.undo, stored].slice(-MAX_UNDO) }))
    return null
  },
  undoLast: () => {
    const { undo, selected } = get()
    if (undo.length === 0) return
    const previous = undo.at(-1) ?? null
    set({ manual: previous, undo: undo.slice(0, -1), selected: keptSelection(selected, previous) })
  },
  rerunAuto: () => {
    set(AUTO)
  },
  adopt: (outcome) => {
    const { manual, selected } = get()
    if (outcome.kind === 'dropped') {
      if (manual !== null) set(AUTO)
      return
    }
    if (manual !== null && sameLayout(manual, outcome.manual)) return
    set({ manual: outcome.manual, selected: keptSelection(selected, outcome.manual) })
  },
}))

useImages.subscribe((s, previous) => {
  if (s.images.length === 0 && previous.images.length > 0) useArrange.getState().rerunAuto()
})
