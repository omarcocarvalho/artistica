export type { LayoutItemInput, LayoutResult, Placement, PlacementWarning, RectMm } from './types'
export { buildLayoutItems } from './build-items'
export { computeLayout } from './compute-layout'
// layoutAsync errors from inside the worker (e.g. RangeError) lose their class over Comlink: check err.name, not instanceof.
export { isAbortError, layoutAsync } from './layout-client'
