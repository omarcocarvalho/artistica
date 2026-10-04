import type { CropRect, Rotation } from '../../shared/model/image'
import type { Handle } from './crop'
import { HANDLES } from './crop'
import type { Matrix } from './exif'

export interface ViewTransform {
  readonly rotation: Rotation
  readonly flipH: boolean
  readonly flipV: boolean
}
export interface Pt {
  readonly x: number
  readonly y: number
}

export const rotateBy = (r: Rotation, delta: 90 | -90): Rotation =>
  ((r + delta + 360) % 360) as Rotation

export function displaySize(W: number, H: number, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: H, h: W } : { w: W, h: H }
}

function rotatePoint(p: Pt, r: Rotation, W: number, H: number): Pt {
  switch (r) {
    case 0:
      return p
    case 90:
      return { x: H - p.y, y: p.x }
    case 180:
      return { x: W - p.x, y: H - p.y }
    case 270:
      return { x: p.y, y: W - p.x }
  }
}

/** Source-frame point (pixels of the W x H image) to the displayed frame (rotation, then flips). */
export function mapPointToDisplay(p: Pt, v: ViewTransform, W: number, H: number): Pt {
  const r = rotatePoint(p, v.rotation, W, H)
  const d = displaySize(W, H, v.rotation)
  return { x: v.flipH ? d.w - r.x : r.x, y: v.flipV ? d.h - r.y : r.y }
}

export function mapPointToSource(p: Pt, v: ViewTransform, W: number, H: number): Pt {
  const d = displaySize(W, H, v.rotation)
  const x = v.flipH ? d.w - p.x : p.x
  const y = v.flipV ? d.h - p.y : p.y
  switch (v.rotation) {
    case 0:
      return { x, y }
    case 90:
      return { x: y, y: H - x }
    case 180:
      return { x: W - x, y: H - y }
    case 270:
      return { x: W - y, y: x }
  }
}

function mapRect(r: CropRect, f: (p: Pt) => Pt): CropRect {
  const a = f({ x: r.x, y: r.y })
  const b = f({ x: r.x + r.w, y: r.y + r.h })
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}
export const mapRectToDisplay = (r: CropRect, v: ViewTransform, W: number, H: number): CropRect =>
  mapRect(r, (p) => mapPointToDisplay(p, v, W, H))
export const mapRectToSource = (r: CropRect, v: ViewTransform, W: number, H: number): CropRect =>
  mapRect(r, (p) => mapPointToSource(p, v, W, H))

/** A displacement in the displayed frame to the equivalent displacement in the source frame. */
export function mapDeltaToSource(d: Pt, v: ViewTransform): Pt {
  const x = v.flipH ? -d.x : d.x
  const y = v.flipV ? -d.y : d.y
  switch (v.rotation) {
    case 0:
      return { x, y }
    case 90:
      return { x: y, y: -x }
    case 180:
      return { x: -x, y: -y }
    case 270:
      return { x: -y, y: x }
  }
}

const VEC: Record<Handle, readonly [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
}

/** The source-frame handle that moves when the user drags `h` in the displayed frame. */
export function mapHandleToSource(h: Handle, v: ViewTransform): Handle {
  const m = mapDeltaToSource({ x: VEC[h][0], y: VEC[h][1] }, v)
  const sx = Math.sign(m.x)
  const sy = Math.sign(m.y)
  return HANDLES.find((c) => VEC[c][0] === sx && VEC[c][1] === sy) ?? h
}

/** Canvas `setTransform` matrix drawing a W x H source into the displayed frame. */
export function viewMatrix(v: ViewTransform, W: number, H: number): Matrix {
  const o = mapPointToDisplay({ x: 0, y: 0 }, v, W, H)
  const px = mapPointToDisplay({ x: 1, y: 0 }, v, W, H)
  const py = mapPointToDisplay({ x: 0, y: 1 }, v, W, H)
  return [px.x - o.x, px.y - o.y, py.x - o.x, py.y - o.y, o.x, o.y]
}
