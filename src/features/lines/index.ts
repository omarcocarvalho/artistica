// --- types (A1) ---
export type { FramePath, FrameSize, PathCmd } from './types'
// --- geometry (A2) ---
export {
  armaturePaths,
  centreDashMm,
  centrePaths,
  GOLDEN_FRACTIONS,
  goldenPaths,
  gridPaths,
  PHI,
  thirdsPaths,
} from './geometry'
export { frameOf, frameToPage } from './place'
// --- spiral (A3) ---
export { goldenSpiral, KAPPA, SPIRAL_ARCS } from './spiral'
// --- composition (C1) ---
// --- components (D1) ---
export { LinesPanel } from './components/LinesPanel'
export type { LinesPanelProps } from './components/LinesPanel'
