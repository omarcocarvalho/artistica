import { cannyEdges, toGrey } from './canny'
import { edgeParams } from './detail'
import { rdp } from './simplify'
import { traceChains } from './trace'

export const MAX_EDGE_VERTICES = 4000
export { EDGE_ANALYSIS_LONG_SIDE } from './limits'

const RDP_EPSILON_PX = 1

export interface OutlinePoint {
  readonly x: number
  readonly y: number
}

/**
 * Chains of at least `minChainPx` pixels, simplified, kept longest first (in pixels; ties by the
 * first point's scan index) when they fit in `maxVertices`. A chain that does not fit is skipped
 * and shorter ones are still tried. Points are pixel centres normalised to the image.
 */
export function outlineOfEdges(
  edges: Uint8Array,
  w: number,
  h: number,
  minChainPx: number,
  maxVertices: number = MAX_EDGE_VERTICES,
): OutlinePoint[][] {
  const candidates = traceChains(edges, w, h)
    .map((chain) => {
      const closed = chain.length > 1 && chain[0] === chain[chain.length - 1]
      return { chain, px: closed ? chain.length - 1 : chain.length, first: chain[0] ?? 0 }
    })
    .filter((c) => c.px >= minChainPx)
    .sort((a, b) => b.px - a.px || a.first - b.first)

  const out: OutlinePoint[][] = []
  let used = 0
  for (const { chain } of candidates) {
    const flat: number[] = []
    for (const i of chain) {
      const x = i % w
      flat.push(x, (i - x) / w)
    }
    const kept = rdp(flat, RDP_EPSILON_PX)
    const n = kept.length >> 1
    if (used + n > maxVertices) continue
    used += n
    const line: OutlinePoint[] = []
    for (let k = 0; k < kept.length; k += 2) {
      line.push({ x: ((kept[k] ?? 0) + 0.5) / w, y: ((kept[k + 1] ?? 0) + 0.5) / h })
    }
    out.push(line)
  }
  return out
}

/** Whole pipeline on one RGBA image: polylines normalised to that image (0..1). */
export function edgeOutline(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  detailPct: number,
): OutlinePoint[][] {
  const params = edgeParams(detailPct)
  return outlineOfEdges(cannyEdges(toGrey(rgba, w, h), params), w, h, params.minChainPx)
}
