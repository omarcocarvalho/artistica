import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { readJpegInfo } from '../../images/exif'

// Recorded detector output on the photo fixtures (credits in images/__fixtures__/README.md).
// Coordinates are normalised to the photo (0..1, y down), as the landmark engine returns them,
// and kept at full precision: detections are bit-identical run to run on one engine (C1-R1).

const FACE_POINTS = 478
const POSE_POINTS = 33
/** Shoulders, elbows, wrists, hips, knees and ankles in MediaPipe pose order. */
const LIMB_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

const unit = z.number().min(0).max(1)
const point = z.tuple([unit, unit])
const base = {
  source: z.string(),
  pxW: z.number().int().positive(),
  pxH: z.number().int().positive(),
}
const faceSchema = z.strictObject({ ...base, points: z.array(point).length(FACE_POINTS) })
const poseSchema = z.strictObject({
  ...base,
  points: z.array(point).length(POSE_POINTS),
  visibility: z.array(unit).length(POSE_POINTS),
})

const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8'))
const readPhoto = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '../../images/__fixtures__', name)))

const face = faceSchema.parse(readJson('face-landmarks.json'))
const pose = poseSchema.parse(readJson('pose-landmarks.json'))

/** Marker bytes of every segment before the scan data. */
function jpegSegments(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const markers: number[] = []
  let at = 2
  while (at + 4 <= view.byteLength && view.getUint8(at) === 0xff) {
    const marker = view.getUint8(at + 1)
    markers.push(marker)
    if (marker === 0xda) break
    at += 2 + view.getUint16(at + 2)
  }
  return markers
}

describe('recorded landmark fixtures', () => {
  it('face: one face of 478 points from portrait.jpg', () => {
    expect(face.source).toBe('portrait.jpg')
    expect(face.points).toHaveLength(FACE_POINTS)
  })

  it('pose: one pose of 33 points with 33 visibilities from figure.jpg', () => {
    expect(pose.source).toBe('figure.jpg')
    expect(pose.points).toHaveLength(POSE_POINTS)
    expect(pose.visibility).toHaveLength(POSE_POINTS)
  })

  it('every limb joint of the pose is more than 50% visible', () => {
    for (const i of LIMB_JOINTS)
      expect(pose.visibility[i], `joint ${String(i)}`).toBeGreaterThan(0.5)
  })

  it('pxW and pxH are the size of the source photo', () => {
    for (const f of [face, pose]) {
      const info = readJpegInfo(readPhoto(f.source))
      expect(info, f.source).toEqual({ orientation: 1, width: f.pxW, height: f.pxH })
    }
  })

  it('keeps full precision (not rounded to 6 decimals)', () => {
    const values = [...face.points.flat(), ...pose.points.flat(), ...pose.visibility]
    const unrounded = values.filter((v) => Number(v.toFixed(6)) !== v)
    expect(unrounded.length).toBeGreaterThan(values.length / 2)
  })
})

describe('photo fixtures', () => {
  it.each(['portrait.jpg', 'figure.jpg'])(
    '%s is under 1 MB, long side 2048 px, with no metadata segment',
    (name) => {
      const bytes = readPhoto(name)
      expect(bytes.length).toBeLessThan(1_000_000)
      const info = readJpegInfo(bytes)
      expect(Math.max(info?.width ?? 0, info?.height ?? 0)).toBe(2048)
      // APP0 (JFIF) only: no APP1 (EXIF, XMP), APP2 (ICC), APP13 (IPTC) or COM segment.
      const extra = jpegSegments(bytes).filter((m) => m === 0xfe || (m >= 0xe1 && m <= 0xef))
      expect(extra).toEqual([])
    },
  )
})
