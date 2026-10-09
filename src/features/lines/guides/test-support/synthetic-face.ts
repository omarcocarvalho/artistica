import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FaceLandmarks, SourcePoint } from '../types'

export const SYNTH_W = 600
export const SYNTH_H = 800

const MODEL = join(
  import.meta.dirname,
  '../../../../../public/models/face_landmarker-float16-1.task',
)
const GEOMETRY = 'geometry_pipeline_metadata_landmarks.binarypb'
const MESH_VERTICES = 468
const FLOATS_PER_VERTEX = 5

const RIGHT_EYE_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const LEFT_EYE_RING = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
]

/** A stored (uncompressed) entry of the .task zip. */
function zipEntry(zip: Uint8Array, name: string): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const want = new TextEncoder().encode(name)
  for (let at = 0; at + 30 <= zip.length; at++) {
    if (view.getUint32(at, true) !== 0x04034b50) continue
    const method = view.getUint16(at + 8, true)
    const size = view.getUint32(at + 18, true)
    const nameLen = view.getUint16(at + 26, true)
    const extraLen = view.getUint16(at + 28, true)
    const got = zip.subarray(at + 30, at + 30 + nameLen)
    if (got.length === want.length && got.every((b, i) => b === want[i])) {
      if (method !== 0) throw new Error(`${name} is compressed`)
      const start = at + 30 + nameLen + extraLen
      return zip.subarray(start, start + size)
    }
  }
  throw new Error(`${name} not found`)
}

function varint(buf: Uint8Array, at: number): [number, number] {
  let value = 0
  let shift = 1
  let i = at
  for (;;) {
    const byte = buf[i++] ?? 0
    value += (byte & 0x7f) * shift
    shift *= 128
    if ((byte & 0x80) === 0) return [value, i]
  }
}

/** Fields of one protobuf message: length-delimited bytes and fixed32 floats by field number. */
function fields(buf: Uint8Array): {
  bytes: Map<number, Uint8Array>
  floats: Map<number, number[]>
} {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const bytes = new Map<number, Uint8Array>()
  const floats = new Map<number, number[]>()
  let at = 0
  while (at < buf.length) {
    const [key, next] = varint(buf, at)
    at = next
    const field = Math.floor(key / 8)
    const wire = key % 8
    if (wire === 0) at = varint(buf, at)[1]
    else if (wire === 1) at += 8
    else if (wire === 5) {
      floats.set(field, [...(floats.get(field) ?? []), view.getFloat32(at, true)])
      at += 4
    } else if (wire === 2) {
      const [len, start] = varint(buf, at)
      if (!bytes.has(field)) bytes.set(field, buf.subarray(start, start + len))
      at = start + len
    } else throw new Error(`wire type ${String(wire)}`)
  }
  return { bytes, floats }
}

/**
 * The canonical face mesh of MediaPipe's face landmarker (468 vertices, centimetres, y up),
 * read from the `canonical_mesh` (field 1, `vertex_buffer` field 3, x y z u v per vertex) of
 * the geometry metadata inside the self-hosted model.
 */
function canonicalMesh(): { x: number; y: number; z: number }[] {
  const meta = zipEntry(new Uint8Array(readFileSync(MODEL)), GEOMETRY)
  const mesh = fields(meta).bytes.get(1)
  if (mesh === undefined) throw new Error('no canonical mesh')
  const buffer = fields(mesh).floats.get(3) ?? []
  if (buffer.length !== MESH_VERTICES * FLOATS_PER_VERTEX) throw new Error('bad vertex buffer')
  return Array.from({ length: MESH_VERTICES }, (_, i) => ({
    x: buffer[i * FLOATS_PER_VERTEX] ?? NaN,
    y: buffer[i * FLOATS_PER_VERTEX + 1] ?? NaN,
    z: buffer[i * FLOATS_PER_VERTEX + 2] ?? NaN,
  }))
}

const CANONICAL = canonicalMesh()

/** Each mesh index's mirror image across the face's midline (the nearest mirrored vertex); irises swap whole. */
export const MIRROR: readonly number[] = [
  ...CANONICAL.map((p) => {
    let best = -1
    let bestD = Infinity
    CANONICAL.forEach((q, j) => {
      const d = (p.x + q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2
      if (d < bestD) {
        bestD = d
        best = j
      }
    })
    return best
  }),
  473,
  476,
  475,
  474,
  477,
  468,
  471,
  470,
  469,
  472,
]

function centroid(ring: readonly number[]): { x: number; y: number } {
  const pts = ring.map((i) => CANONICAL[i] ?? { x: NaN, y: NaN })
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
}

/** 468 mesh points, then each iris as its centre (468, 473) and four points around it. */
function withIrises(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [...CANONICAL]
  for (const ring of [RIGHT_EYE_RING, LEFT_EYE_RING]) {
    const c = centroid(ring)
    const r = 0.5
    out.push(
      c,
      { x: c.x + r, y: c.y },
      { x: c.x, y: c.y + r },
      { x: c.x - r, y: c.y },
      {
        x: c.x,
        y: c.y - r,
      },
    )
  }
  return out
}

const FRONTAL = withIrises()

/**
 * A frontal face (MediaPipe's canonical mesh, irises added at the eye rings' centres) in a
 * SYNTH_W × SYNTH_H image: `scale` px per mesh centimetre, the nose bridge (168) at `center`,
 * turned clockwise on screen by `rollDeg`.
 */
export function syntheticFace(
  center: { x: number; y: number },
  scale: number,
  rollDeg: number,
): FaceLandmarks {
  const a = (rollDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const bridge = FRONTAL[168] ?? { x: 0, y: 0 }
  const points: SourcePoint[] = FRONTAL.map((p) => {
    const x = (p.x - bridge.x) * scale
    const y = -(p.y - bridge.y) * scale
    return {
      x: (center.x + x * cos - y * sin) / SYNTH_W,
      y: (center.y + x * sin + y * cos) / SYNTH_H,
    }
  })
  return { points }
}
