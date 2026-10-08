export interface EdgeParams {
  readonly blurPasses: number
  readonly keepShare: number
  readonly minChainPx: number
}

const MIN_DETAIL = 1
const MAX_DETAIL = 100
const DEFAULT_DETAIL = 50

/**
 * M4-R16, with t = (d − 1) / 99: blurPasses = 3 − floor(3t), keepShare = round3(0.03 + 0.17t),
 * minChainPx = round(48 − 42t). Evaluated on integers so no step lands on a rounding tie.
 */
export function edgeParams(detailPct: number): EdgeParams {
  const d = Number.isNaN(detailPct)
    ? DEFAULT_DETAIL
    : Math.min(MAX_DETAIL, Math.max(MIN_DETAIL, Math.round(detailPct)))
  const n = d - 1
  return {
    blurPasses: 3 - Math.floor(n / 33),
    keepShare: Math.round(30 + (170 * n) / 99) / 1000,
    minChainPx: Math.round(48 - (14 * n) / 33),
  }
}
