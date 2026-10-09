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
export { useDetailDraft } from './components/detail-draft'
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
export { facePaths, MAX_CMDS_PER_FACE, MAX_FACES } from './guides/face'
export { MAX_CMDS_PER_POSE, MAX_POSES, MIN_POSE_VISIBILITY, poseFigure } from './guides/pose'
export type { PoseFigure } from './guides/pose'
// --- edges (B) ---
export { createEdgeEngine } from './edges/edge-client'
export { EDGE_ANALYSIS_LONG_SIDE } from './edges/limits'
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
export { createLandmarkEngine } from './detect/landmark-engine'
export { AI_LOADER } from './detect/loader'
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
export { GuidesSection } from './components/GuidesSection'
export type { GuidesSectionProps } from './components/GuidesSection'
export { DetectionsProvider } from './components/detections-context'
export { pageHasWebGL } from './components/detection-actions'
export type { DetectionActions } from './components/detection-actions'
