import type { ImageDescriptor } from '../../../shared/model/image'
import type { GuideLineType, LineType } from '../../../shared/model/lines'
import type { RectMm } from '../../layout/types'
import { compositionPaths } from '../../lines/composition'
import { centreDashMm } from '../../lines/geometry'
import { circlePath } from '../../lines/guides/curves'
import { edgePaths } from '../../lines/guides/edge-paths'
import { facePaths } from '../../lines/guides/face'
import { applyAffine, sourceToFrame } from '../../lines/guides/map'
import { poseFigure } from '../../lines/guides/pose'
import type { ImageGuides } from '../../lines/guides/types'
import { frameOf, frameToPage } from '../../lines/place'
import type { PathCmd } from '../../lines/types'
import type { LineStroke, TileLines } from '../types'

/** Upper bound on path commands per tile (memory budget): a 20 × 20 grid plus every other type stays under it. */
export const MAX_LINE_CMDS_PER_TILE = 200

/** M4-R17: edges 4000 + four faces × 160 + four poses × 160, composition lines included. */
export const MAX_GUIDE_CMDS_PER_TILE = 6000

type TileImage = Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits' | 'lines'>

/** Edges, face and pose paths in page mm (M4-R10, R12), each type left out when it drew nothing. */
function guidePaths(
  img: TileImage,
  guides: ImageGuides,
  trim: RectMm,
  turned: boolean,
): { type: GuideLineType; cmds: PathCmd[] }[] {
  const { lines } = img
  const m = sourceToFrame(img, frameOf(trim, turned))
  const place = (c: PathCmd): PathCmd => frameToPage(applyAffine(m, c), trim, turned)
  const out: { type: GuideLineType; cmds: PathCmd[] }[] = []
  if (lines.edges.on && guides.edges)
    out.push({ type: 'edges', cmds: edgePaths(guides.edges, img).map(place) })
  if (lines.face && guides.faces)
    out.push({ type: 'face', cmds: guides.faces.flatMap((f) => facePaths(f, img).map(place)) })
  if (lines.pose && guides.poses) {
    const r = lines.style.widthMm / 2
    const cmds = guides.poses.flatMap((pose) => {
      const fig = poseFigure(pose, img)
      const dots = fig.joints.flatMap((j) => {
        const c = place({ op: 'M', x: j.x, y: j.y })
        return circlePath(c.x, c.y, r)
      })
      return [...fig.cmds.map(place), ...dots]
    })
    out.push({ type: 'pose', cmds })
  }
  return out.filter((g) => g.cmds.length > 0)
}

/**
 * One tile's lines in page mm, clipped to its trim (M3-R4); null when nothing would be drawn.
 * Guides follow the composition paths in the solid batch (M4-R11).
 */
export function tileLinesFor(
  img: TileImage,
  guides: ImageGuides,
  trim: RectMm,
  turned: boolean,
  tileIndex: number,
): TileLines | null {
  const { lines } = img
  const paths = compositionPaths(lines, frameOf(trim, turned))
  const found = guidePaths(img, guides, trim, turned)
  if (paths.length === 0 && found.length === 0) return null
  const place = (dashed: boolean) =>
    paths
      .filter((p) => p.dashed === dashed)
      .flatMap((p) => p.cmds.map((c) => frameToPage(c, trim, turned)))
  const solid = place(false)
  for (const g of found) for (const c of g.cmds) solid.push(c)
  const { colour, widthMm, opacityPct } = lines.style
  const strokes: LineStroke[] = [
    { dashMm: [], cmds: solid },
    { dashMm: [...centreDashMm(widthMm)], cmds: place(true) },
  ].filter((s) => s.cmds.length > 0)
  const types: LineType[] = [...paths.map((p) => p.type), ...found.map((g) => g.type)]
  return {
    tileIndex,
    clip: trim,
    colour,
    opacity: opacityPct / 100,
    widthMm,
    types,
    strokes,
  }
}
