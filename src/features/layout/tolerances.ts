import type { Mm } from '../../shared/model/units'

/** Slack allowed in every "fits inside" test. Far below print precision, far above float error (~1e-12 mm). */
export const EPS_MM: Mm = 1e-9
/** The auto search stops once the bracket on the target short side is narrower than this. */
export const SEARCH_TOLERANCE_MM: Mm = 0.05
/** The auto search first scans this many evenly spaced target sizes (rungs) from the top down. */
export const LADDER_STEPS = 16
/** Hard cap on bisection steps (log2(1200 / 0.05) ≈ 15, so this is never the binding limit). */
export const MAX_SEARCH_STEPS = 40
/** Two candidates whose smallest short sides differ by less than this are tied on that criterion. */
export const SCORE_SHORT_SIDE_EPS_MM: Mm = 1e-6
/** Two candidates whose fill ratios differ by less than this are tied on that criterion. */
export const SCORE_FILL_EPS = 1e-9
/** A content box narrower than this on either side cannot hold anything. */
export const MIN_CONTENT_SIDE_MM: Mm = 1
/** The reference shape used by suggestedPerPage: a 3:2 photo. */
export const SUGGEST_REFERENCE_ASPECT = 1.5
