import { create } from 'zustand'
import type { LayoutResult } from '../features/layout'
import type { PageModel } from '../features/render'
import type { PipelineSink } from './pipeline'

export interface PagesState {
  layout: LayoutResult | null
  /** The layout was computed for zero images (so it says nothing about room for the next ones). */
  empty: boolean
  pages: PageModel[]
  status: 'idle' | 'computing' | 'error'
  sink: PipelineSink
}

export const usePages = create<PagesState>()((set) => ({
  layout: null,
  empty: false,
  pages: [],
  status: 'idle',
  sink: {
    computing: () => {
      set({ status: 'computing' })
    },
    cleared: (layout) => {
      set({ layout, empty: true, pages: [], status: 'idle' })
    },
    done: (layout, pages) => {
      set({ layout, empty: false, pages, status: 'idle' })
    },
    failed: (error) => {
      console.error('layout failed', error)
      // Never keep a stale preview that Export could use.
      set({ layout: null, empty: false, pages: [], status: 'error' })
    },
  },
}))
