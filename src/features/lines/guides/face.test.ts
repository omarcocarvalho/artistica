import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CropRect, ImageDescriptor } from '../../../shared/model/image'
import { descriptor } from '../../render/test-support/fixtures'
import { subpaths } from '../test-support/paths'
import type { PathCmd } from '../types'
import { facePaths, JAW, MAX_CMDS_PER_FACE, MAX_FACES, MIDLINE, NOSE_BASE } from './face'
import { MAX_FACES as LIMIT_FACES } from './limits'
import { MIRROR, SYNTH_H, SYNTH_W, syntheticFace } from './test-support/synthetic-face'
import type { FaceLandmarks } from './types'

interface Pt {
  readonly x: number
  readonly y: number
}
type Img = Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>
interface Case {
  readonly face: FaceLandmarks
  readonly img: Img
}

const recorded = JSON.parse(
  readFileSync(join(import.meta.dirname, '__fixtures__', 'face-landmarks.json'), 'utf8'),
) as { pxW: number; pxH: number; points: [number, number][] }

const FIXTURE: Case = {
  face: { points: recorded.points.map(([x, y]) => ({ x, y })) },
  img: descriptor('portrait', recorded.pxW, recorded.pxH),
}
const SYNTH: Case = {
  face: syntheticFace({ x: 300, y: 380 }, 20, 0),
  img: descriptor('synthetic', SYNTH_W, SYNTH_H),
}
const CASES: [string, Case][] = [
  ['synthetic face', SYNTH],
  ['recorded fixture', FIXTURE],
]

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x
const len = (a: Pt) => Math.hypot(a.x, a.y)
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const unit = (a: Pt): Pt => ({ x: a.x / len(a), y: a.y / len(a) })

function px({ face, img }: Case, i: number): Pt {
  const p = face.points[i]
  if (p === undefined) throw new Error(`no landmark ${String(i)}`)
  return { x: p.x * img.pxW, y: p.y * img.pxH }
}

function axes(c: Case): { u: Pt; n: Pt; width: number } {
  const u = unit(sub(px(c, 263), px(c, 33)))
  const turned = { x: -u.y, y: u.x }
  const n = dot(sub(px(c, 152), px(c, 10)), turned) > 0 ? turned : { x: u.y, y: -u.x }
  return { u, n, width: Math.abs(dot(sub(px(c, 454), px(c, 234)), u)) }
}

const level = (c: Case, p: Pt) => dot(sub(p, px(c, 10)), axes(c).n)

interface Construction {
  readonly circle: { readonly c: Pt; readonly r: number }
  readonly centre: readonly Pt[]
  readonly brow: readonly [Pt, Pt]
  readonly eye: readonly [Pt, Pt]
  readonly nose: readonly [Pt, Pt]
  readonly chin: readonly [Pt, Pt]
  readonly jaw: readonly Pt[]
}

const ends = (cmds: readonly PathCmd[]): Pt[] => cmds.map((c) => ({ x: c.x, y: c.y }))

function segment(cmds: readonly PathCmd[] | undefined): [Pt, Pt] {
  const [a, b] = ends(cmds ?? [])
  if (cmds?.length !== 2 || a === undefined || b === undefined) throw new Error('not a segment')
  return [a, b]
}

function parse(cmds: readonly PathCmd[]): Construction {
  const [circle, centre, brow, eye, nose, chin, jaw, ...rest] = subpaths(cmds)
  if (circle === undefined || centre === undefined || jaw === undefined || rest.length > 0)
    throw new Error(`expected 7 subpaths, got ${String(subpaths(cmds).length)}`)
  const [top, , bottom] = ends(circle)
  if (top === undefined || bottom === undefined) throw new Error('not a circle')
  return {
    circle: { c: mid(top, bottom), r: len(sub(bottom, top)) / 2 },
    centre: ends(centre),
    brow: segment(brow),
    eye: segment(eye),
    nose: segment(nose),
    chin: segment(chin),
    jaw: ends(jaw),
  }
}

const build = (c: Case) => parse(facePaths(c.face, c.img))

/** Distance from p to the infinite line through a segment. */
const offLine = (p: Pt, [a, b]: readonly [Pt, Pt]) => Math.abs(cross(sub(p, a), unit(sub(b, a))))

function offPolyline(p: Pt, pts: readonly Pt[]): number {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a === undefined || b === undefined) continue
    const d = sub(b, a)
    const t = Math.min(1, Math.max(0, dot(sub(p, a), d) / dot(d, d)))
    best = Math.min(best, len(sub(p, { x: a.x + t * d.x, y: a.y + t * d.y })))
  }
  return best
}

/** The ring of a closed MediaPipe connection list, from `from` towards `via`, ending at `to`. */
function ringPath(connections: { start: number; end: number }[], from: number, to: number) {
  const next = new Map<number, number[]>()
  for (const { start, end } of connections) {
    next.set(start, [...(next.get(start) ?? []), end])
    next.set(end, [...(next.get(end) ?? []), start])
  }
  const walk = (first: number): number[] => {
    const path = [from, first]
    while (path.at(-1) !== to) {
      const at = path.at(-1) ?? -1
      const prev = path.at(-2) ?? -1
      const step = (next.get(at) ?? []).find((j) => j !== prev)
      if (step === undefined || path.length > connections.length) return []
      path.push(step)
    }
    return path
  }
  return (next.get(from) ?? []).map(walk)
}

function ring(connections: { start: number; end: number }[]): number[] {
  const first = connections[0]?.start ?? -1
  return ringPath(connections, first, first)[0]?.slice(0, -1) ?? []
}

function inside(p: Pt, poly: readonly Pt[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a === undefined || b === undefined) continue
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/** Moves every landmark by `f` (in source px), keeping the image size. */
function mapFace(c: Case, f: (p: Pt) => Pt, order: (i: number) => number = (i) => i): Case {
  const points = c.face.points.map((_, i) => {
    const q = f(px(c, order(i)))
    return { x: q.x / c.img.pxW, y: q.y / c.img.pxH }
  })
  return { face: { points }, img: c.img }
}

function rotation(c: Case, deg: number): (p: Pt) => Pt {
  const o = px(c, 168)
  const a = (deg * Math.PI) / 180
  return (p) => ({
    x: o.x + (p.x - o.x) * Math.cos(a) - (p.y - o.y) * Math.sin(a),
    y: o.y + (p.x - o.x) * Math.sin(a) + (p.y - o.y) * Math.cos(a),
  })
}

function mapConstruction(k: Construction, f: (p: Pt) => Pt, flip: boolean): Construction {
  const seg = ([a, b]: readonly [Pt, Pt]): [Pt, Pt] => (flip ? [f(b), f(a)] : [f(a), f(b)])
  const jaw = k.jaw.map(f)
  return {
    circle: { c: f(k.circle.c), r: k.circle.r },
    centre: k.centre.map(f),
    brow: seg(k.brow),
    eye: seg(k.eye),
    nose: seg(k.nose),
    chin: seg(k.chin),
    jaw: flip ? jaw.reverse() : jaw,
  }
}

function expectClose(got: Construction, want: Construction, tol: number) {
  const pts = (k: Construction) => [
    k.circle.c,
    { x: k.circle.r, y: 0 },
    ...k.centre,
    ...k.brow,
    ...k.eye,
    ...k.nose,
    ...k.chin,
    ...k.jaw,
  ]
  const a = pts(got)
  const b = pts(want)
  expect(a).toHaveLength(b.length)
  a.forEach((p, i) => {
    const q = b[i] ?? { x: NaN, y: NaN }
    expect(len(sub(p, q)), `point ${String(i)}`).toBeLessThan(tol)
  })
}

const STRAIGHT = ['brow', 'eye', 'nose', 'chin'] as const

describe('face-mesh indices (verified against the recorded fixture and the canonical mesh)', () => {
  it('MIDLINE is every point on the canonical mesh midline, forehead to chin', () => {
    const c = SYNTH
    const onMid = c.face.points
      .slice(0, 468)
      .map((_, i) => i)
      .filter((i) => Math.abs(dot(sub(px(c, i), px(c, 10)), axes(c).u)) < 1e-9)
      .sort((i, j) => level(c, px(c, i)) - level(c, px(c, j)))
    expect(onMid).toEqual([...MIDLINE])
  })

  it('on the fixture, MIDLINE runs down the middle of the face, in order', () => {
    const c = FIXTURE
    const { u, width } = axes(c)
    const levels = MIDLINE.map((i) => level(c, px(c, i)))
    for (const i of MIDLINE)
      expect(Math.abs(dot(sub(px(c, i), px(c, 10)), u)) / width, `index ${String(i)}`).toBeLessThan(
        0.02,
      )
    levels.slice(1).forEach((l, k) => {
      expect(l).toBeGreaterThan(levels[k] ?? Infinity)
    })
  })

  it.each(CASES)(
    '%s: index 2 lies between the nose tip and the upper lip along the centre line',
    (_, c) => {
      const base = level(c, px(c, NOSE_BASE))
      for (const i of [4, 1, 19, 94]) expect(base).toBeGreaterThanOrEqual(level(c, px(c, i)))
      expect(base).toBeLessThan(level(c, px(c, 164)))
      expect(base).toBeLessThan(level(c, px(c, 0)))
    },
  )

  it('468 lies inside the right eye ring 33…133, 473 inside the left eye ring 263…362', () => {
    const c = FIXTURE
    const right = ring(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE)
    const left = ring(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE)
    expect(right).toEqual(expect.arrayContaining([33, 133]))
    expect(left).toEqual(expect.arrayContaining([263, 362]))
    expect(
      inside(
        px(c, 468),
        right.map((i) => px(c, i)),
      ),
    ).toBe(true)
    expect(
      inside(
        px(c, 473),
        left.map((i) => px(c, i)),
      ),
    ).toBe(true)
    expect(
      inside(
        px(c, 468),
        left.map((i) => px(c, i)),
      ),
    ).toBe(false)
  })

  it.each(CASES)('%s: 105 and 334 are the high points of the brows', (_, c) => {
    const brows = [
      [105, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW],
      [334, FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW],
    ] as const
    for (const [top, conns] of brows) {
      const idx = [...new Set(conns.flatMap((k) => [k.start, k.end]))]
      const highest = Math.min(...idx.map((i) => level(c, px(c, i))))
      expect(level(c, px(c, top))).toBe(highest)
    }
  })

  it.each(CASES)(
    '%s: 234 and 454 are within 2% of the face width of the oval’s widest points',
    (_, c) => {
      const { u, width } = axes(c)
      const oval = ring(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL)
      const across = oval.map((i) => dot(sub(px(c, i), px(c, 10)), u))
      expect(Math.min(...across) - dot(sub(px(c, 234), px(c, 10)), u)).toBeGreaterThan(
        -0.02 * width,
      )
      expect(Math.max(...across) - dot(sub(px(c, 454), px(c, 10)), u)).toBeLessThan(0.02 * width)
    },
  )

  it('JAW is the face oval from 234 through 152 to 454', () => {
    const paths = ringPath(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, 234, 454)
    expect(paths.find((p) => p.includes(152))).toEqual([...JAW])
  })
})

describe('facePaths', () => {
  it('re-exports MAX_FACES from guides/limits.ts', () => {
    expect(MAX_FACES).toBe(LIMIT_FACES)
  })

  it.each(CASES)('%s: the eye, brow, nose and chin lines are parallel to the eye axis', (_, c) => {
    const k = build(c)
    const { u } = axes(c)
    for (const name of STRAIGHT) {
      const [a, b] = k[name]
      expect(Math.abs(Math.asin(cross(unit(sub(b, a)), u))), name).toBeLessThan(1e-9)
    }
  })

  it.each(CASES)(
    '%s: they are ordered down the face: brow above eye above nose above chin',
    (_, c) => {
      const k = build(c)
      const levels = STRAIGHT.map((name) => level(c, mid(...k[name])))
      expect(levels).toEqual([...levels].sort((a, b) => a - b))
      expect(new Set(levels).size).toBe(4)
    },
  )

  it.each(CASES)('%s: each line passes through its landmarks', (_, c) => {
    const k = build(c)
    const w = axes(c).width
    expect(offLine(mid(px(c, 468), px(c, 473)), k.eye)).toBeLessThan(1e-9 * w)
    expect(offLine(mid(px(c, 105), px(c, 334)), k.brow)).toBeLessThan(1e-9 * w)
    expect(offLine(px(c, NOSE_BASE), k.nose)).toBeLessThan(1e-9 * w)
    expect(offLine(px(c, 152), k.chin)).toBeLessThan(1e-9 * w)
  })

  it.each(CASES)(
    '%s: each line is centred on the centre line, half-length 0.6 × the face width',
    (_, c) => {
      const k = build(c)
      const w = axes(c).width
      for (const name of STRAIGHT) {
        const [a, b] = k[name]
        expect(len(sub(b, a)) / 2, name).toBeCloseTo(0.6 * w, 9)
        expect(offPolyline(mid(a, b), k.centre), name).toBeLessThan(1e-9 * w)
      }
    },
  )

  it.each(CASES)(
    '%s: the circle’s centre lies on the brow line and the centre line; its radius is the brow-to-nose distance',
    (_, c) => {
      const k = build(c)
      const { n, width } = axes(c)
      expect(offLine(k.circle.c, k.brow)).toBeLessThan(1e-9 * width)
      expect(offPolyline(k.circle.c, k.centre)).toBeLessThan(1e-9 * width)
      const browToNose = dot(sub(px(c, NOSE_BASE), mid(px(c, 105), px(c, 334))), n)
      expect(k.circle.r).toBeCloseTo(browToNose, 9)
      expect(offLine(k.circle.c, k.nose)).toBeCloseTo(k.circle.r, 9)
    },
  )

  it.each(CASES)(
    '%s: the centre line runs from the top of the circle through the midline, 10 to 152',
    (_, c) => {
      const k = build(c)
      const { n } = axes(c)
      const [top, ...rest] = k.centre
      expect(rest).toEqual(MIDLINE.map((i) => px(c, i)))
      const want = { x: k.circle.c.x - k.circle.r * n.x, y: k.circle.c.y - k.circle.r * n.y }
      expect(len(sub(top ?? want, want))).toBeLessThan(1e-9 * k.circle.r)
      expect(top).toBeDefined()
    },
  )

  it.each(CASES)('%s: the jaw runs from 234 through 152 to 454 along the face oval', (_, c) => {
    expect(build(c).jaw).toEqual(JAW.map((i) => px(c, i)))
  })

  it.each(CASES)(
    '%s: a face rotated by 20°, 90° and 180° gives the same construction rotated likewise',
    (_, c) => {
      for (const deg of [20, 90, 180]) {
        const turn = rotation(c, deg)
        expectClose(build(mapFace(c, turn)), mapConstruction(build(c), turn, false), 1e-5)
      }
    },
  )

  it.each(CASES)('%s: any roll gives the construction rolled likewise', (_, c) => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true, maxExcluded: true }), (deg) => {
        const turn = rotation(c, deg)
        expectClose(build(mapFace(c, turn)), mapConstruction(build(c), turn, false), 1e-5)
      }),
    )
  })

  it.each(CASES)('%s: a mirrored face gives the mirrored construction', (_, c) => {
    const flip = (p: Pt): Pt => ({ x: c.img.pxW - p.x, y: p.y })
    const mirrored = mapFace(c, flip, (i) => MIRROR[i] ?? -1)
    expectClose(build(mirrored), mapConstruction(build(c), flip, true), 1e-5)
  })

  it.each(CASES)(
    '%s: a mirrored face with its labels kept still builds down towards the chin',
    (_, c) => {
      const flip = (p: Pt): Pt => ({ x: c.img.pxW - p.x, y: p.y })
      expectClose(build(mapFace(c, flip)), mapConstruction(build(c), flip, false), 1e-5)
    },
  )

  it('the synthetic face is its own mirror image', () => {
    const flip = (p: Pt): Pt => ({ x: 2 * px(SYNTH, 168).x - p.x, y: p.y })
    const self = mapFace(SYNTH, flip, (i) => MIRROR[i] ?? -1)
    self.face.points.forEach((p, i) => {
      const q = SYNTH.face.points[i] ?? { x: NaN, y: NaN }
      expect(Math.hypot(p.x - q.x, p.y - q.y), `point ${String(i)}`).toBeLessThan(1e-9)
    })
  })

  const box = (c: Case) => {
    const xs = c.face.points.map((p) => p.x * c.img.pxW)
    const ys = c.face.points.map((p) => p.y * c.img.pxH)
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  }
  const cropped = (c: Case, crop: CropRect): Case => ({
    face: c.face,
    img: { ...c.img, edits: { ...c.img.edits, crop } },
  })

  it.each(CASES)('%s: a face outside the crop draws nothing', (_, c) => {
    const b = box(c)
    const crops: CropRect[] = [
      { x: 0, y: 0, w: b.x0 - 1, h: c.img.pxH },
      { x: b.x1 + 1, y: 0, w: c.img.pxW - b.x1 - 1, h: c.img.pxH },
      { x: 0, y: 0, w: c.img.pxW, h: b.y0 - 1 },
      { x: 0, y: b.y1 + 1, w: c.img.pxW, h: c.img.pxH - b.y1 - 1 },
    ]
    for (const crop of crops) expect(facePaths(c.face, cropped(c, crop).img)).toEqual([])
  })

  it.each(CASES)('%s: a face half inside the crop is drawn whole', (_, c) => {
    const b = box(c)
    const half = Math.round((b.x0 + b.x1) / 2)
    const whole = facePaths(c.face, c.img)
    expect(whole.length).toBeGreaterThan(0)
    expect(facePaths(c.face, cropped(c, { x: 0, y: 0, w: half, h: c.img.pxH }).img)).toEqual(whole)
    expect(
      facePaths(c.face, cropped(c, { x: Math.floor(b.x1) - 1, y: 0, w: 5, h: c.img.pxH }).img),
    ).toEqual(whole)
  })

  it.each(CASES)('%s: command order is circle, centre, brow, eye, nose, chin, jaw', (_, c) => {
    const ops = facePaths(c.face, c.img)
      .map((cmd) => cmd.op)
      .join('')
    const line = (points: number) => `M${'L'.repeat(points - 1)}`
    expect(ops).toBe(
      [
        'MCCCC',
        line(MIDLINE.length + 1),
        line(2),
        line(2),
        line(2),
        line(2),
        line(JAW.length),
      ].join(''),
    )
  })

  it('never more than MAX_CMDS_PER_FACE commands', () => {
    expect(MAX_CMDS_PER_FACE).toBe(160)
    fc.assert(
      fc.property(
        fc.double({ min: 150, max: 450, noNaN: true }),
        fc.double({ min: 150, max: 650, noNaN: true }),
        fc.double({ min: 2, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 360, noNaN: true }),
        (x, y, scale, roll) => {
          const face = syntheticFace({ x, y }, scale, roll)
          expect(facePaths(face, SYNTH.img).length).toBeLessThanOrEqual(MAX_CMDS_PER_FACE)
        },
      ),
    )
    expect(facePaths(FIXTURE.face, FIXTURE.img).length).toBeLessThanOrEqual(MAX_CMDS_PER_FACE)
  })

  it('is deterministic and leaves its input alone', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), (roll) => {
        const face = syntheticFace({ x: 300, y: 400 }, 20, roll)
        const before = structuredClone(face)
        const first = facePaths(face, SYNTH.img)
        expect(facePaths(face, SYNTH.img)).toEqual(first)
        expect(face).toEqual(before)
      }),
    )
  })

  it('centres a line beyond the midline’s ends level with its nearest end', () => {
    const { n, width } = axes(SYNTH)
    const lift = level(SYNTH, mid(px(SYNTH, 105), px(SYNTH, 334))) + 0.1 * width
    const points = SYNTH.face.points.map((p, i) =>
      i === 105 || i === 334
        ? { x: p.x - (lift * n.x) / SYNTH_W, y: p.y - (lift * n.y) / SYNTH_H }
        : p,
    )
    const c: Case = { face: { points }, img: SYNTH.img }
    const k = build(c)
    const centre = mid(...k.brow)
    expect(level(c, centre)).toBeCloseTo(-0.1 * width, 9)
    expect(Math.abs(cross(sub(centre, px(c, 10)), n))).toBeLessThan(1e-9 * width)
    expect(offLine(mid(px(c, 105), px(c, 334)), k.brow)).toBeLessThan(1e-9 * width)
  })

  it('draws nothing when the nose base is not below the brows', () => {
    const { n } = axes(SYNTH)
    const browToNose = dot(sub(px(SYNTH, NOSE_BASE), mid(px(SYNTH, 105), px(SYNTH, 334))), n)
    const points = SYNTH.face.points.map((p, i) =>
      i === NOSE_BASE
        ? { x: p.x - (browToNose * n.x) / SYNTH_W, y: p.y - (browToNose * n.y) / SYNTH_H }
        : p,
    )
    expect(facePaths({ points }, SYNTH.img)).toEqual([])
  })

  it('draws nothing when the outer eye corners coincide', () => {
    const corner = SYNTH.face.points[33] ?? { x: 0, y: 0 }
    const points = SYNTH.face.points.map((p, i) => (i === 263 ? corner : p))
    expect(facePaths({ points }, SYNTH.img)).toEqual([])
  })

  it('draws nothing for a face with fewer than 478 points', () => {
    expect(facePaths({ points: SYNTH.face.points.slice(0, 468) }, SYNTH.img)).toEqual([])
  })
})
