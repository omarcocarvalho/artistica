import type { ImageDescriptor } from '../../../shared/model/image'
import type { PathCmd } from '../types'
import { circlePath } from './curves'
import { MAX_POSES } from './limits'
import { meetsCrop } from './map'
import type { PoseLandmarks } from './types'

export { MAX_POSES }
export const MAX_CMDS_PER_POSE = 160
export const MIN_POSE_VISIBILITY = 0.5
export const TURNED_HEAD_RADIUS = 0.85
export const EAR_HALF_PER_EYE_SPREAD = 7.25 / 6.3

interface Pt {
  readonly x: number
  readonly y: number
}

export interface PoseFigure {
  readonly cmds: readonly PathCmd[]
  readonly joints: readonly Pt[]
}

const NOSE = 0
const LEFT_EYE = 2
const RIGHT_EYE = 5
const LEFT_EAR = 7
const RIGHT_EAR = 8
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12
const LEFT_HIP = 23
const RIGHT_HIP = 24

type End = number | 'midShoulders' | 'midHips'

const BODY: readonly (readonly [End, End])[] = [
  ['midShoulders', 'midHips'],
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_HIP, RIGHT_HIP],
  [LEFT_SHOULDER, 13],
  [13, 15],
  [RIGHT_SHOULDER, 14],
  [14, 16],
  [LEFT_HIP, 25],
  [25, 27],
  [RIGHT_HIP, 26],
  [26, 28],
]

const JOINTS: readonly End[] = [
  11,
  12,
  13,
  14,
  15,
  16,
  23,
  24,
  25,
  26,
  27,
  28,
  'midShoulders',
  'midHips',
]

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

/** M4-R14, source px; joints are returned apart because their radius depends on the style (M4-R12). */
export function poseFigure(
  pose: PoseLandmarks,
  img: Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>,
): PoseFigure {
  const landmark = (i: number): Pt | null => {
    const p = pose.points[i]
    const v = pose.visibility[i]
    if (p === undefined || v === undefined || !(v >= MIN_POSE_VISIBILITY)) return null
    if (!(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return null
    return { x: p.x * img.pxW, y: p.y * img.pxH }
  }
  const pair = (a: number, b: number): Pt | null => {
    const p = landmark(a)
    const q = landmark(b)
    return p && q && mid(p, q)
  }
  const midShoulders = pair(LEFT_SHOULDER, RIGHT_SHOULDER)
  const end = (e: End): Pt | null =>
    e === 'midShoulders' ? midShoulders : e === 'midHips' ? pair(LEFT_HIP, RIGHT_HIP) : landmark(e)

  const cmds: PathCmd[] = []
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const extend = (p: Pt, r = 0) => {
    box.minX = Math.min(box.minX, p.x - r)
    box.minY = Math.min(box.minY, p.y - r)
    box.maxX = Math.max(box.maxX, p.x + r)
    box.maxY = Math.max(box.maxY, p.y + r)
  }
  const segment = (a: Pt, b: Pt) => {
    cmds.push({ op: 'M', x: a.x, y: a.y }, { op: 'L', x: b.x, y: b.y })
    extend(a)
    extend(b)
  }
  const drawn = new Set<End>()

  const head = headCircle(landmark)
  if (head) {
    cmds.push(...circlePath(head.c.x, head.c.y, head.r))
    extend(head.c, head.r)
    if (midShoulders) {
      const d = dist(head.c, midShoulders)
      const [ux, uy] =
        d > 0 ? [(midShoulders.x - head.c.x) / d, (midShoulders.y - head.c.y) / d] : [0, 1]
      segment({ x: head.c.x + head.r * ux, y: head.c.y + head.r * uy }, midShoulders)
      drawn.add('midShoulders')
    }
  }
  for (const [a, b] of BODY) {
    const p = end(a)
    const q = end(b)
    if (!p || !q) continue
    segment(p, q)
    drawn.add(a).add(b)
  }

  if (cmds.length === 0) return { cmds: [], joints: [] }
  const bounds = { x: box.minX, y: box.minY, w: box.maxX - box.minX, h: box.maxY - box.minY }
  if (!meetsCrop(bounds, img)) return { cmds: [], joints: [] }
  const joints = JOINTS.flatMap((e) => {
    const p = drawn.has(e) ? end(e) : null
    return p ? [p] : []
  })
  return { cmds, joints }
}

function headCircle(landmark: (i: number) => Pt | null): { c: Pt; r: number } | null {
  const nose = landmark(NOSE)
  const left = landmark(LEFT_EAR)
  const right = landmark(RIGHT_EAR)
  const ears = [left, right].filter((e): e is Pt => e !== null)
  const turned = nose ? Math.max(0, ...ears.map((e) => TURNED_HEAD_RADIUS * dist(nose, e))) : 0
  if (left && right) return { c: mid(left, right), r: Math.max(0.75 * dist(left, right), turned) }
  if (!nose) return null
  const ls = landmark(LEFT_SHOULDER)
  const rs = landmark(RIGHT_SHOULDER)
  const ear = ears[0]
  const r = ls && rs ? Math.max(0.25 * dist(ls, rs), turned) : turned
  if (!r) return null
  const d = ear ? dist(nose, ear) : 0
  if (!ear || d === 0) return { c: nose, r }
  const le = landmark(LEFT_EYE)
  const re = landmark(RIGHT_EYE)
  const frontal = le && re ? (EAR_HALF_PER_EYE_SPREAD * dist(le, re)) / d : 0
  const w = Math.min(Math.max(frontal, 1 - r / d), 1)
  return {
    c: { x: ear.x + w * (nose.x - ear.x), y: ear.y + w * (nose.y - ear.y) },
    r: Math.max(r, w * d),
  }
}
