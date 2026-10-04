import type { PageSetup } from '../../shared/model/page-setup'
import type { LayoutItemInput, LayoutResult } from './types'

/** What layout.worker.ts exposes over Comlink. Kept outside the worker file so it is testable in node. */
export interface LayoutWorkerApi {
  computeLayout(setup: PageSetup, items: readonly LayoutItemInput[]): LayoutResult
}
