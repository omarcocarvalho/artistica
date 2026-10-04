import type { PageModel } from '../types'
import type { ExportErrorCode } from './errors'
import type { ExportProgress } from './run-export'

export type ExportState =
  | { readonly status: 'ready' }
  | { readonly status: 'running'; readonly progress: ExportProgress }
  | { readonly status: 'done'; readonly url: string }
  | { readonly status: 'error'; readonly code: ExportErrorCode }

export type ExportEvent =
  | { readonly type: 'start'; readonly pageCount: number }
  | { readonly type: 'progress'; readonly progress: ExportProgress }
  | { readonly type: 'done'; readonly url: string }
  | { readonly type: 'error'; readonly code: ExportErrorCode }
  | { readonly type: 'cancel' }
  | { readonly type: 'reset' }

export const INITIAL_EXPORT_STATE: ExportState = { status: 'ready' }

/** Pure state machine behind ExportDialog: ready → running → done | error; cancel/reset → ready. */
export function exportReducer(state: ExportState, event: ExportEvent): ExportState {
  switch (event.type) {
    case 'start':
      return {
        status: 'running',
        progress: { pageIndex: 0, pageCount: event.pageCount, fraction: 0 },
      }
    case 'progress':
      return state.status === 'running' ? { status: 'running', progress: event.progress } : state
    case 'done':
      return state.status === 'running' ? { status: 'done', url: event.url } : state
    case 'error':
      return state.status === 'running' ? { status: 'error', code: event.code } : state
    case 'cancel':
    case 'reset':
      return INITIAL_EXPORT_STATE
  }
}

export type PageStepState = 'todo' | 'active' | 'done'

/** States for the design's page checklist (export.html `.page-steps`). */
export function pageSteps(state: ExportState, pageCount: number): PageStepState[] {
  return Array.from({ length: pageCount }, (_, i) => {
    if (state.status === 'done') return 'done'
    if (state.status !== 'running') return 'todo'
    const { pageIndex } = state.progress
    return i < pageIndex ? 'done' : i === pageIndex ? 'active' : 'todo'
  })
}

export interface ExportSummary {
  readonly pageCount: number
  readonly paperLabel: string
  readonly orientation: 'portrait' | 'landscape'
  readonly tileCount: number
  readonly imageCount: number
  readonly cropMarks: boolean
  readonly bleedMm: number | null
}

/**
 * The "summary" block of the export dialog, derived from the pages themselves (what will be printed).
 * Crop marks: "on" when any page has a mark. Bleed: the tiles' bleed (0 → null = off).
 */
export function exportSummary(pages: readonly PageModel[], paperLabel: string): ExportSummary {
  const first = pages[0]
  const tiles = pages.flatMap((p) => p.tiles)
  return {
    pageCount: pages.length,
    paperLabel,
    orientation: first && first.size.w > first.size.h ? 'landscape' : 'portrait',
    tileCount: tiles.length,
    imageCount: new Set(tiles.map((t) => t.imageId)).size,
    cropMarks: pages.some((p) => p.cropMarks.length > 0),
    bleedMm: (tiles[0]?.bleedMm ?? 0) > 0 ? (tiles[0]?.bleedMm ?? null) : null,
  }
}
