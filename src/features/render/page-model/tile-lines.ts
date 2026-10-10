import type { ImageDescriptor } from '../../../shared/model/image'
import type { GuideLineType, LineType } from '../../../shared/model/lines'
import type { RectMm } from '../../layout/types'
import { compositionPaths } from '../../lines/composition'
import { centreDashMm, centreDashPhaseMm, centredDashPhaseMm } from '../../lines/geometry'
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
 * The centre lines' dashed stroke. On a tile whose short side is under 30 × the width, when phase 0
 * would leave either line without a whole gap off the crossing, each line is drawn as two arms out
 * from the crossing, with one phase that centres a dash on it, so the batch stays one stroke (M3-R7).
 */
function centreStroke(cmds: readonly PathCmd[], widthMm: number, trim: RectMm): LineStroke {
  const short = Math.min(trim.w, trim.h)
  const [dash, gap] = centreDashMm(widthMm, short)
  const dashMm = [dash, gap]
  const fits =
    short >= 30 * widthMm ||
    [trim.w, trim.h].every(
      (length) => centreDashPhaseMm(length, dash, gap, length / 2, widthMm) === 0,
    )
  if (fits) return { dashMm, cmds: [...cmds] }
  const arms: PathCmd[] = []
  for (let i = 0; i + 1 < cmds.length; i += 2) {
    const a = cmds[i]
    const b = cmds[i + 1]
    if (a?.op !== 'M' || b?.op !== 'L') continue
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    arms.push({ op: 'M', ...m }, { op: 'L', x: a.x, y: a.y })
    arms.push({ op: 'M', ...m }, { op: 'L', x: b.x, y: b.y })
  }
  return { dashMm, cmds: arms, dashPhaseMm: centredDashPhaseMm(dash, gap, 0) }
}

/** One tile's lines in page mm, clipped to its trim (M3-R4); null when nothing would be drawn. */
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
    centreStroke(place(true), widthMm, trim),
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
