import { create } from 'zustand'
import type { LayoutResult } from '../features/layout'
import type { PageModel } from '../features/render'
import type { PipelineSink } from './pipeline'

export interface PagesState {
  layout: LayoutResult | null
  pages: PageModel[]
  status: 'idle' | 'computing' | 'error'
  sink: PipelineSink
}

export const usePages = create<PagesState>()((set) => ({
  layout: null,
  pages: [],
  status: 'idle',
  sink: {
    computing: () => {
      set({ status: 'computing' })
    },
    cleared: (layout) => {
      set({ layout, pages: [], status: 'idle' })
    },
    done: (layout, pages) => {
      set({ layout, pages, status: 'idle' })
    },
    failed: (error) => {
      console.error('layout failed', error)
      // Never keep a stale preview that Export could use.
      set({ layout: null, pages: [], status: 'error' })
    },
  },
}))
