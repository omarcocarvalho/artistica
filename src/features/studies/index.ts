// --- model re-exports (A1) ---
export {
  BLUR_SIGMA_AT_MAX,
  DEFAULT_STUDY,
  HUE_PRESETS,
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
  STUDY_VERSIONS,
  patchStudy,
  sanitizeStudy,
  studyEqual,
  studyKey,
  tileFormat,
  tileStudyFor,
  withVersion,
} from '../../shared/model/study'
export type {
  HuePresetId,
  StudyPatch,
  StudySettings,
  StudyValues,
  StudyVersion,
  TileStudy,
} from '../../shared/model/study'
// --- maths (A3–A5) ---
export { blurSigmaPx, boxRadiiForGauss, gaussianBlurRGBA } from './blur'
// --- preview (C1, C2) ---
// --- components (D1) ---
