import type { PageSetup } from '../../shared/model/page-setup'
import { autoLayout, validateItems } from './auto-layout'
import { layoutFromManual, manualFromLayout, type ManualLayout } from './manual'
import { reconcileManual } from './manual-reconcile'
import type { LayoutItemInput, LayoutResult } from './types'

export {
  compareCandidates,
  evaluateTarget,
  searchOrientation,
  type Candidate,
  type Prepared,
} from './auto-layout'

/**
 * Pure, deterministic: the same input gives a deep-equal output. No DOM, no randomness, no Date.
 * Without a manual layout this is the automatic layout (M5-R8); with one, the reconciled
 * arrangement and its outcome (M5-R14).
 */
export function computeLayout(
  setup: PageSetup,
  items: readonly LayoutItemInput[],
  manual?: ManualLayout | null,
): LayoutResult {
  if (manual == null) return autoLayout(setup, items)
  validateItems(items)
  const outcome = reconcileManual(setup, items, manual)
  if (outcome.kind === 'dropped') return { ...autoLayout(setup, items), manual: outcome }
  const result = layoutFromManual(outcome.manual, items, setup)
  return {
    ...result,
    manual: { kind: outcome.kind, manual: manualFromLayout(result, items, setup) },
  }
}
