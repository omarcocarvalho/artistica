export type {
  LayoutItemInput,
  LayoutResult,
  ManualOutcome,
  Placement,
  PlacementWarning,
  RectMm,
} from './types'
export type { BlockId, ManualBlock, ManualLayout } from './manual'
export type { Corner, OpRefusal, OpResult } from './manual-ops'
export { blockIdOf, blockRect, isFixedSize, manualFromLayout } from './manual'
export { moveBlock, moveToPage, nudge, resizeBlock, swapBlocks } from './manual-ops'
export { buildLayoutItems } from './build-items'
export { computeLayout } from './compute-layout'
// layoutAsync errors from inside the worker (e.g. RangeError) lose their class over Comlink: check err.name, not instanceof.
export { isAbortError, layoutAsync } from './layout-client'
