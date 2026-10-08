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
export { compositionPaths } from './composition'
// --- components (D1) ---
export { LinesPanel } from './components/LinesPanel'
export type { LinesPanelProps } from './components/LinesPanel'
// --- guides (A1–A4) ---
export { circlePath } from './guides/curves'
export { NO_GUIDES } from './guides/types'
export type {
  EdgeOutline,
  FaceLandmarks,
  ImageGuides,
  PoseLandmarks,
  SourcePath,
  SourcePoint,
} from './guides/types'
export { applyAffine, cropKey, fromCrop, fromRotated, meetsCrop, sourceToFrame } from './guides/map'
export type { Affine } from './guides/map'
export { edgePaths } from './guides/edge-paths'
// --- edges (B) ---
// --- detect (C, D2) ---
export {
  detectionKey,
  guidesFor,
  guidesPending,
  INITIAL_DETECTIONS,
  useDetections,
} from './detect/store'
export type {
  AiModel,
  DetectionResult,
  DetectionsState,
  DetectionStatus,
  GuideKind,
  ModelState,
} from './detect/store'
export { createDetectionScheduler, MAX_EDGE_ENTRIES_PER_HASH } from './detect/schedule'
export type {
  AiAsset,
  AiAssets,
  AiLoader,
  DetectionPorts,
  DetectionScheduler,
  EdgeEngine,
  LandmarkEngine,
  Progress,
} from './detect/schedule'
// --- guides UI (E1) ---
