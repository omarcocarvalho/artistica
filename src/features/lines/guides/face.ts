import type { ImageDescriptor } from '../../../shared/model/image'
import type { PathCmd } from '../types'
import { circlePath } from './curves'
import { meetsCrop } from './map'
import type { FaceLandmarks } from './types'

export { MAX_FACES } from './limits'

export const MAX_CMDS_PER_FACE = 160

const FACE_POINTS = 478

export const MIDLINE = [
  10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200,
  199, 175, 152,
] as const

export const NOSE_BASE = 2

export const JAW = [
  234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323,
  454,
] as const

const OVERHANG = 0.1

interface V {
  readonly x: number
  readonly y: number
}

const add = (a: V, b: V, k = 1): V => ({ x: a.x + k * b.x, y: a.y + k * b.y })
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y
const mid = (a: V, b: V): V => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Where the line through `m` along u (level `m·n`) crosses the polyline, else level with its nearest vertex. */
function across(m: V, n: V, line: readonly V[]): V {
  const t = dot(m, n)
  let nearest: V | undefined
  for (let i = 0; i < line.length; i++) {
    const a = line[i]
    if (a === undefined) continue
    const da = dot(a, n) - t
    const b = line[i + 1]
    if (b !== undefined) {
      const db = dot(b, n) - t
      if (da * db < 0) return add(a, sub(b, a), da / (da - db))
    }
    if (nearest === undefined || Math.abs(da) < Math.abs(dot(nearest, n) - t)) nearest = a
  }
  return nearest === undefined ? m : add(nearest, n, t - dot(nearest, n))
}

/** Source px; [] when the landmarks' box misses the crop. */
export function facePaths(
  face: FaceLandmarks,
  img: Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>,
): PathCmd[] {
  if (face.points.length < FACE_POINTS) return []
  const pts = face.points.map((p) => ({ x: p.x * img.pxW, y: p.y * img.pxH }))
  const at = (i: number): V => pts[i] ?? { x: NaN, y: NaN }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const w = maxX - minX
  const h = maxY - minY
  if (!Number.isFinite(w + h) || !meetsCrop({ x: minX, y: minY, w, h }, img)) return []

  const eyes = sub(at(263), at(33))
  const eyeDist = Math.hypot(eyes.x, eyes.y)
  const u = { x: eyes.x / eyeDist, y: eyes.y / eyeDist }
  const turned = { x: -u.y, y: u.x }
  const n = dot(sub(at(152), at(10)), turned) > 0 ? turned : { x: u.y, y: -u.x }

  const midline = MIDLINE.map(at)
  const browMid = mid(at(105), at(334))
  const brow = across(browMid, n, midline)
  const r = dot(sub(at(NOSE_BASE), brow), n)
  if (!(r > 0)) return []
  let lo = Infinity
  let hi = -Infinity
  for (const p of pts) {
    lo = Math.min(lo, dot(p, u))
    hi = Math.max(hi, dot(p, u))
  }
  const pad = OVERHANG * (hi - lo)
  const straight = (c: V): PathCmd[] => {
    const a = add(c, u, lo - pad - dot(c, u))
    const b = add(c, u, hi + pad - dot(c, u))
    return [
      { op: 'M', x: a.x, y: a.y },
      { op: 'L', x: b.x, y: b.y },
    ]
  }
  const polyline = (line: readonly V[]): PathCmd[] =>
    line.map((p, i) => ({ op: i === 0 ? 'M' : 'L', x: p.x, y: p.y }))

  return [
    ...circlePath(brow.x, brow.y, r),
    ...polyline([add(brow, n, -r), ...midline]),
    ...straight(browMid),
    ...straight(mid(at(468), at(473))),
    ...straight(at(NOSE_BASE)),
    ...straight(at(152)),
    ...polyline(JAW.map(at)),
  ]
}
