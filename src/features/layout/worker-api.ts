import type { PageSetup } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import type { LayoutItemInput, LayoutResult } from './types'

/** What layout.worker.ts exposes over Comlink. Kept outside the worker file so it is testable in node. */
export interface LayoutWorkerApi {
  computeLayout(setup: PageSetup, items: readonly LayoutItemInput[]): LayoutResult
}

export const layoutWorkerApi: LayoutWorkerApi = { computeLayout }
