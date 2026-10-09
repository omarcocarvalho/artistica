import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITS, type CropRect } from '../../../shared/model/image'
import type { PathCmd } from '../types'
import { points } from '../test-support/paths'
import { circlePath } from './curves'
import { MAX_POSES as LIMITS_MAX_POSES } from './limits'
import { MAX_CMDS_PER_POSE, MAX_POSES, MIN_POSE_VISIBILITY, poseFigure } from './pose'
import { SYNTHETIC_H, SYNTHETIC_W, tPose, walkingPose } from './test-support/synthetic-pose'
import type { PoseLandmarks, SourcePoint } from './types'

interface Pt {
  readonly x: number
  readonly y: number
}
type Img = Parameters<typeof poseFigure>[1]

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, '__fixtures__', 'pose-landmarks.json'), 'utf8'),
) as { pxW: number; pxH: number; points: [number, number][]; visibility: number[] }

const FIXTURE: PoseLandmarks = {
  points: fixture.points.map(([x, y]) => ({ x, y })),
  visibility: fixture.visibility,
}

const imgOf = (pxW: number, pxH: number, crop: CropRect | null = null): Img => ({
  pxW,
  pxH,
  edits: { ...DEFAULT_EDITS, crop },
})
const SYNTH_IMG = imgOf(SYNTHETIC_W, SYNTHETIC_H)
const FIXTURE_IMG = imgOf(fixture.pxW, fixture.pxH)

const CASES: readonly (readonly [string, PoseLandmarks, Img])[] = [
  ['T-pose', tPose(), SYNTH_IMG],
  ['walking pose', walkingPose(), SYNTH_IMG],
  ['figure.jpg', FIXTURE, FIXTURE_IMG],
]

type End = number | 'ms' | 'mh'
const BODY_SEGMENTS: readonly (readonly [End, End])[] = [
  ['ms', 'mh'],
  [11, 12],
  [23, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
]
const JOINT_ORDER: readonly End[] = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 'ms', 'mh']
const BODY_LANDMARKS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
const MIRROR = [
  0, 4, 5, 6, 1, 2, 3, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22, 21, 24, 23, 26, 25,
  28, 27, 30, 29, 32, 31,
]

function px(pose: PoseLandmarks, img: Img, i: number): Pt {
  const p = pose.points[i]
  if (p === undefined) throw new Error(`no landmark ${String(i)}`)
  return { x: p.x * img.pxW, y: p.y * img.pxH }
}
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

function endPx(pose: PoseLandmarks, img: Img, e: End): Pt {
  if (e === 'ms') return mid(px(pose, img, 11), px(pose, img, 12))
  if (e === 'mh') return mid(px(pose, img, 23), px(pose, img, 24))
  return px(pose, img, e)
}
const dependsOn = (e: End, i: number): boolean =>
  e === 'ms' ? i === 11 || i === 12 : e === 'mh' ? i === 23 || i === 24 : e === i

function hide(pose: PoseLandmarks, i: number, visibility = 0): PoseLandmarks {
  return {
    points: pose.points,
    visibility: pose.visibility.map((v, k) => (k === i ? visibility : v)),
  }
}
function move(pose: PoseLandmarks, i: number, p: SourcePoint): PoseLandmarks {
  return { points: pose.points.map((q, k) => (k === i ? p : q)), visibility: pose.visibility }
}

function expectNear(actual: readonly PathCmd[], expected: readonly PathCmd[], digits = 9): void {
  expect(actual.map((c) => c.op)).toEqual(expected.map((c) => c.op))
  expectPtsNear(points(actual), points(expected), digits)
}
function expectPtsNear(actual: readonly Pt[], expected: readonly Pt[], digits = 9): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((p, k) => {
    expect(p.x, `point ${String(k)}.x`).toBeCloseTo(expected[k]?.x ?? NaN, digits)
    expect(p.y, `point ${String(k)}.y`).toBeCloseTo(expected[k]?.y ?? NaN, digits)
  })
}

/** Head circle: centre and radius from its 'M' (top) and first arc's end (right). */
function headOf(cmds: readonly PathCmd[]): { c: Pt; r: number } {
  const top = cmds[0]
  const right = cmds[1]
  if (top?.op !== 'M' || right?.op !== 'C') throw new Error('no head circle')
  return { c: { x: top.x, y: right.y }, r: right.y - top.y }
}

function segmentKeys(cmds: readonly PathCmd[], round = 6): string[] {
  const out: string[] = []
  const f = (v: number) => v.toFixed(round)
  for (let k = 5; k < cmds.length; k += 2) {
    const a = cmds[k]
    const b = cmds[k + 1]
    if (a?.op !== 'M' || b?.op !== 'L') throw new Error(`cmd ${String(k)} is not a segment`)
    const ends = [`${f(a.x)},${f(a.y)}`, `${f(b.x)},${f(b.y)}`].sort()
    out.push(ends.join(' '))
  }
  return out.sort()
}
const pointKeys = (pts: readonly Pt[], round = 6): string[] =>
  pts.map((p) => `${p.x.toFixed(round)},${p.y.toFixed(round)}`).sort()

describe('poseFigure', () => {
  it('re-exports MAX_POSES from limits.ts; the per-pose bounds are as contracted', () => {
    expect(MAX_POSES).toBe(LIMITS_MAX_POSES)
    expect(MAX_POSES).toBe(4)
    expect(MAX_CMDS_PER_POSE).toBe(160)
    expect(MIN_POSE_VISIBILITY).toBe(0.5)
  })

  it('draws the mocked figure for a fully visible pose (T-pose, by hand)', () => {
    const fig = poseFigure(tPose(), SYNTH_IMG)
    const seg = (x1: number, y1: number, x2: number, y2: number): PathCmd[] => [
      { op: 'M', x: x1, y: y1 },
      { op: 'L', x: x2, y: y2 },
    ]
    expectNear(fig.cmds, [
      ...circlePath(300, 118, 45),
      ...seg(300, 163, 300, 220),
      ...seg(300, 220, 300, 460),
      ...seg(360, 220, 240, 220),
      ...seg(340, 460, 260, 460),
      ...seg(360, 220, 440, 220),
      ...seg(440, 220, 520, 220),
      ...seg(240, 220, 160, 220),
      ...seg(160, 220, 80, 220),
      ...seg(340, 460, 345, 620),
      ...seg(345, 620, 350, 780),
      ...seg(260, 460, 255, 620),
      ...seg(255, 620, 250, 780),
    ])
    expectPtsNear(fig.joints, [
      { x: 360, y: 220 },
      { x: 240, y: 220 },
      { x: 440, y: 220 },
      { x: 160, y: 220 },
      { x: 520, y: 220 },
      { x: 80, y: 220 },
      { x: 340, y: 460 },
      { x: 260, y: 460 },
      { x: 345, y: 620 },
      { x: 255, y: 620 },
      { x: 350, y: 780 },
      { x: 250, y: 780 },
      { x: 300, y: 220 },
      { x: 300, y: 460 },
    ])
  })

  it.each(CASES)(
    '%s: segments join the BlazePose landmarks in the fixed order, 14 joint dots',
    (_, pose, img) => {
      const fig = poseFigure(pose, img)
      expect(fig.cmds.map((c) => c.op).join('')).toBe('MCCCC' + 'ML'.repeat(12))
      const body = fig.cmds.slice(7)
      BODY_SEGMENTS.forEach(([a, b], k) => {
        expectNear(body.slice(2 * k, 2 * k + 2), [
          { op: 'M', ...endPx(pose, img, a) },
          { op: 'L', ...endPx(pose, img, b) },
        ])
      })
      expectPtsNear(
        fig.joints,
        JOINT_ORDER.map((e) => endPx(pose, img, e)),
      )
    },
  )

  it('joints are bare centres: the dot radius is applied with the line style', () => {
    for (const j of poseFigure(tPose(), SYNTH_IMG).joints)
      expect(Object.keys(j).sort()).toEqual(['x', 'y'])
  })

  it('a hidden wrist drops the forearm and the wrist dot only', () => {
    const full = poseFigure(tPose(), SYNTH_IMG)
    const fig = poseFigure(hide(tPose(), 15), SYNTH_IMG)
    const forearm = 7 + 2 * 4
    expect(fig.cmds).toEqual([...full.cmds.slice(0, forearm), ...full.cmds.slice(forearm + 2)])
    expect(fig.joints).toEqual(full.joints.filter((_, k) => k !== 4))
  })

  it('a hidden shoulder drops the neck, spine, shoulder line, upper arm and their dots', () => {
    const full = poseFigure(tPose(), SYNTH_IMG)
    const fig = poseFigure(hide(tPose(), 11), SYNTH_IMG)
    expect(fig.cmds).toEqual([
      ...full.cmds.slice(0, 5),
      ...full.cmds.slice(11, 13),
      ...full.cmds.slice(15),
    ])
    expect(fig.joints).toEqual(full.joints.filter((_, k) => k !== 0 && k !== 12 && k !== 13))
  })

  it('a landmark below MIN_POSE_VISIBILITY drops exactly its segments and its dot (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CASES),
        fc.constantFrom(...BODY_LANDMARKS),
        fc.double({ min: 0, max: MIN_POSE_VISIBILITY, maxExcluded: true, noNaN: true }),
        ([, pose, img], hidden, vis) => {
          const full = poseFigure(pose, img)
          const fig = poseFigure(hide(pose, hidden, vis), img)
          const neckKept = !dependsOn('ms', hidden)
          const kept = BODY_SEGMENTS.map(([a, b]) => !dependsOn(a, hidden) && !dependsOn(b, hidden))
          const expectedCmds = [
            ...full.cmds.slice(0, 5),
            ...(neckKept ? full.cmds.slice(5, 7) : []),
            ...BODY_SEGMENTS.flatMap((_, k) =>
              kept[k] === true ? full.cmds.slice(7 + 2 * k, 9 + 2 * k) : [],
            ),
          ]
          expect(fig.cmds).toEqual(expectedCmds)
          const ends = new Set<End>(BODY_SEGMENTS.flatMap((s, k) => (kept[k] === true ? s : [])))
          if (neckKept) ends.add('ms')
          expect(fig.joints).toEqual(full.joints.filter((_, k) => ends.has(JOINT_ORDER[k] ?? -1)))
        },
      ),
    )
  })

  it('visibility exactly MIN_POSE_VISIBILITY is drawn', () => {
    const full = poseFigure(tPose(), SYNTH_IMG)
    expect(poseFigure(hide(tPose(), 15, MIN_POSE_VISIBILITY), SYNTH_IMG)).toEqual(full)
    expect(poseFigure(hide(tPose(), 7, MIN_POSE_VISIBILITY), SYNTH_IMG)).toEqual(full)
  })

  it('a missing visibility counts as hidden', () => {
    const pose = tPose()
    const short: PoseLandmarks = { points: pose.points, visibility: pose.visibility.slice(0, 15) }
    const hidden = Array.from({ length: 18 }, (_, k) => 15 + k).reduce((p, i) => hide(p, i), pose)
    expect(poseFigure(short, SYNTH_IMG)).toEqual(poseFigure(hidden, SYNTH_IMG))
    expect(poseFigure(short, SYNTH_IMG).joints).toHaveLength(5)
  })

  it.each([
    ['right of', { x: 1.02, y: 220 / 900 }],
    ['left of', { x: -0.001, y: 220 / 900 }],
    ['above', { x: 520 / 600, y: -0.01 }],
    ['below', { x: 520 / 600, y: 1.5 }],
    ['NaN in', { x: Number.NaN, y: 0.2 }],
  ])('a landmark %s the image drops its segments and its dot', (_, p) => {
    expect(poseFigure(move(tPose(), 15, p), SYNTH_IMG)).toEqual(
      poseFigure(hide(tPose(), 15), SYNTH_IMG),
    )
  })

  it('a landmark on the image edge is inside', () => {
    const fig = poseFigure(move(tPose(), 15, { x: 1, y: 0 }), SYNTH_IMG)
    expect(fig.joints).toHaveLength(14)
    expect(fig.cmds[16]).toEqual({ op: 'L', x: 600, y: 0 })
  })

  it.each(CASES)(
    '%s: the head circle sits between the ears with radius 0.75 × their distance',
    (_, pose, img) => {
      const ears = [px(pose, img, 7), px(pose, img, 8)] as const
      const c = mid(...ears)
      expectNear(poseFigure(pose, img).cmds.slice(0, 5), circlePath(c.x, c.y, 0.75 * dist(...ears)))
    },
  )

  it.each([7, 8])(
    'with ear %i hidden the head is centred on the nose, radius a quarter of the shoulder width',
    (ear) => {
      for (const [, pose, img] of CASES) {
        const nose = px(pose, img, 0)
        const r = 0.25 * dist(px(pose, img, 11), px(pose, img, 12))
        const fig = poseFigure(hide(pose, ear), img)
        expectNear(fig.cmds.slice(0, 5), circlePath(nose.x, nose.y, r))
        expect(fig.joints).toEqual(poseFigure(pose, img).joints)
      }
    },
  )

  it('an ear outside the image also falls back to the nose', () => {
    const fig = poseFigure(move(tPose(), 8, { x: -0.1, y: 0.1 }), SYNTH_IMG)
    expectNear(fig.cmds.slice(0, 5), circlePath(300, 120, 30))
  })

  it.each([
    ['the nose and an ear', [0, 7]],
    ['an ear and a shoulder', [8, 12]],
  ])('with %s hidden there is no head and no neck', (_, hidden) => {
    const full = poseFigure(tPose(), SYNTH_IMG)
    const pose = hidden.reduce((p, i) => hide(p, i), tPose())
    const fig = poseFigure(pose, SYNTH_IMG)
    expect(fig.cmds.slice(0, 5).map((c) => c.op)).not.toEqual(['M', 'C', 'C', 'C', 'C'])
    if (hidden.includes(0)) {
      expect(fig.cmds).toEqual(full.cmds.slice(7))
      expect(fig.joints).toEqual(full.joints)
    } else {
      expect(fig.cmds.some((c) => c.op === 'C')).toBe(false)
    }
  })

  it('the neck runs from the head circle towards mid-shoulders, ending at mid-shoulders', () => {
    for (const [, pose, img] of CASES) {
      const fig = poseFigure(pose, img)
      const { c, r } = headOf(fig.cmds)
      const ms = mid(px(pose, img, 11), px(pose, img, 12))
      const [from, to] = [fig.cmds[5], fig.cmds[6]]
      if (from?.op !== 'M' || to?.op !== 'L') throw new Error('no neck')
      expect(dist(from, c)).toBeCloseTo(r, 9)
      expect(dist(from, ms) + r).toBeCloseTo(dist(c, ms), 9)
      expectPtsNear([to], [ms])
    }
  })

  it("for an upright figure the neck starts at the head circle's lowest point", () => {
    const fig = poseFigure(tPose(), SYNTH_IMG)
    expectNear(fig.cmds.slice(5, 6), [{ op: 'M', x: 300, y: 118 + 45 }])
  })

  it('a head centred on mid-shoulders hangs its neck from its lowest point', () => {
    const pose = move(move(tPose(), 7, { x: 330 / 600, y: 220 / 900 }), 8, {
      x: 270 / 600,
      y: 220 / 900,
    })
    const fig = poseFigure(pose, SYNTH_IMG)
    expectNear(fig.cmds.slice(5, 7), [
      { op: 'M', x: 300, y: 220 + 45 },
      { op: 'L', x: 300, y: 220 },
    ])
  })

  it('a pose outside the crop draws nothing', () => {
    const img = imgOf(SYNTHETIC_W, SYNTHETIC_H, { x: 0, y: 0, w: 60, h: 60 })
    expect(poseFigure(tPose(), img)).toEqual({ cmds: [], joints: [] })
  })

  it('a pose that only touches the crop with its head circle is drawn whole', () => {
    const full = poseFigure(tPose(), SYNTH_IMG)
    const touching = imgOf(SYNTHETIC_W, SYNTHETIC_H, { x: 0, y: 0, w: 600, h: 73.01 })
    expect(poseFigure(tPose(), touching)).toEqual(full)
    const missing = imgOf(SYNTHETIC_W, SYNTHETIC_H, { x: 0, y: 0, w: 600, h: 72.99 })
    expect(poseFigure(tPose(), missing)).toEqual({ cmds: [], joints: [] })
  })

  it('a pose with every landmark hidden draws nothing', () => {
    const pose = tPose()
    expect(
      poseFigure({ points: pose.points, visibility: pose.visibility.map(() => 0) }, SYNTH_IMG),
    ).toEqual({
      cmds: [],
      joints: [],
    })
  })

  it('never more than MAX_CMDS_PER_POSE commands, joints counted as 5 each (property)', () => {
    const unit = fc.double({ min: -0.2, max: 1.2, noNaN: true })
    fc.assert(
      fc.property(
        fc.array(fc.record({ x: unit, y: unit }), { minLength: 33, maxLength: 33 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 33, maxLength: 33 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (points, visibility, w, h) => {
          const fig = poseFigure({ points, visibility }, imgOf(w, h))
          expect(fig.cmds.length + 5 * fig.joints.length).toBeLessThanOrEqual(MAX_CMDS_PER_POSE)
          if (fig.cmds.length > 0) expect(fig.cmds[0]?.op).toBe('M')
        },
      ),
    )
    const full = poseFigure(tPose(), SYNTH_IMG)
    expect(full.cmds.length + 5 * full.joints.length).toBe(99)
  })

  it.each(CASES)('%s: a mirrored pose gives the mirrored figure', (_, pose, img) => {
    const mirrored: PoseLandmarks = {
      points: MIRROR.map((k) => {
        const p = pose.points[k]
        if (p === undefined) throw new Error('33 points')
        return { x: 1 - p.x, y: p.y }
      }),
      visibility: MIRROR.map((k) => pose.visibility[k] ?? 0),
    }
    const a = poseFigure(pose, img)
    const b = poseFigure(mirrored, img)
    const flip = (p: Pt): Pt => ({ x: img.pxW - p.x, y: p.y })
    const ha = headOf(a.cmds)
    const hb = headOf(b.cmds)
    expectPtsNear([hb.c], [flip(ha.c)])
    expect(hb.r).toBeCloseTo(ha.r, 9)
    const flipped = a.cmds.map((c) => (c.op === 'C' ? c : { ...c, ...flip(c) }))
    expect(segmentKeys(b.cmds)).toEqual(segmentKeys(flipped))
    expect(pointKeys(b.joints)).toEqual(pointKeys(a.joints.map(flip)))
  })

  it('a pose rotated in a square image gives the figure rotated likewise (property)', () => {
    const base = tPose()
    const img = imgOf(1000, 1000)
    fc.assert(
      fc.property(fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), (t) => {
        const [cos, sin] = [Math.cos(t), Math.sin(t)]
        const rot = (p: Pt, o: number): Pt => ({
          x: cos * (p.x - o) - sin * (p.y - o) + o,
          y: sin * (p.x - o) + cos * (p.y - o) + o,
        })
        const shrink = (p: Pt): Pt => ({ x: 0.5 + 0.8 * (p.x - 0.5), y: 0.5 + 0.8 * (p.y - 0.5) })
        const upright: PoseLandmarks = {
          points: base.points.map(shrink),
          visibility: base.visibility,
        }
        const turned: PoseLandmarks = {
          points: upright.points.map((p) => rot(p, 0.5)),
          visibility: base.visibility,
        }
        const a = poseFigure(upright, img)
        const b = poseFigure(turned, img)
        const rotPx = (p: Pt): Pt => rot(p, 500)
        const ha = headOf(a.cmds)
        const hb = headOf(b.cmds)
        expectPtsNear([hb.c], [rotPx(ha.c)], 6)
        expect(hb.r).toBeCloseTo(ha.r, 6)
        expectNear(
          b.cmds.slice(5),
          a.cmds.slice(5).map((c) => (c.op === 'C' ? c : { ...c, ...rotPx(c) })),
          6,
        )
        expectPtsNear(b.joints, a.joints.map(rotPx), 6)
      }),
    )
  })

  it('is deterministic and does not modify its input', () => {
    const pose = walkingPose()
    const copy = structuredClone(pose)
    const a = poseFigure(pose, SYNTH_IMG)
    const b = poseFigure(pose, SYNTH_IMG)
    expect(b).toEqual(a)
    expect(pose).toEqual(copy)
  })

  it('pose.ts is plain TS: no DOM, clock or randomness', () => {
    const src = readFileSync(join(import.meta.dirname, 'pose.ts'), 'utf8')
    expect(src).not.toMatch(
      /\b(window|document|self|globalThis|navigator|performance|Date)\b|Math\.random/,
    )
  })
})
