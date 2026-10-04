import { MIN_COMFORT_SHORT_SIDE_MM } from '../../shared/model/page-setup'
import type { SizeMm } from '../../shared/model/paper'
import type { Mm } from '../../shared/model/units'
import { maxFitTileWidth } from './geometry'
import { EPS_MM, SUGGEST_REFERENCE_ASPECT } from './tolerances'

function gridCount(content: SizeMm, gutter: Mm, w: Mm, h: Mm): number {
  const across = Math.floor((content.w + gutter + EPS_MM) / (w + gutter))
  const down = Math.floor((content.h + gutter + EPS_MM) / (h + gutter))
  return Math.max(0, across) * Math.max(0, down)
}

/**
 * "This paper fits N references comfortably per page": how many 3:2 references at the comfort
 * size (short side MIN_COMFORT_SHORT_SIDE_MM, or smaller if the page is smaller) fit in a regular
 * grid on one content box, all landscape or all portrait, with the gutter between them.
 * Independent of the images, so it can be shown before any image is added. Symmetric in orientation.
 */
export function suggestedPerPage(content: SizeMm, gutter: Mm): number {
  const a = SUGGEST_REFERENCE_ASPECT
  const tileW = Math.min(MIN_COMFORT_SHORT_SIDE_MM * a, maxFitTileWidth(a, 1, gutter, content))
  if (!(tileW > EPS_MM)) return 0
  const tileH = tileW / a
  return Math.max(
    gridCount(content, gutter, tileW, tileH),
    gridCount(content, gutter, tileH, tileW),
  )
}
