import type { LineSettings } from '../../../shared/model/lines'
import type { RectMm } from '../../layout/types'
import { compositionPaths } from '../../lines/composition'
import { centreDashMm } from '../../lines/geometry'
import { frameOf, frameToPage } from '../../lines/place'
import type { LineStroke, TileLines } from '../types'

/** Upper bound on path commands per tile (memory budget): a 20 × 20 grid plus every other type stays under it. */
export const MAX_LINE_CMDS_PER_TILE = 200

/** One tile's lines in page mm, clipped to its trim (M3-R4); null when nothing would be drawn. */
export function tileLinesFor(
  lines: LineSettings,
  trim: RectMm,
  turned: boolean,
  tileIndex: number,
): TileLines | null {
  const paths = compositionPaths(lines, frameOf(trim, turned))
  if (paths.length === 0) return null
  const place = (dashed: boolean) =>
    paths
      .filter((p) => p.dashed === dashed)
      .flatMap((p) => p.cmds.map((c) => frameToPage(c, trim, turned)))
  const { colour, widthMm, opacityPct } = lines.style
  const strokes: LineStroke[] = [
    { dashMm: [], cmds: place(false) },
    { dashMm: [...centreDashMm(widthMm)], cmds: place(true) },
  ].filter((s) => s.cmds.length > 0)
  return {
    tileIndex,
    clip: trim,
    colour,
    opacity: opacityPct / 100,
    widthMm,
    types: paths.map((p) => p.type),
    strokes,
  }
}
