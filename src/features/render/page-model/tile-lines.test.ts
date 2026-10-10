import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ImageEdits, Rotation } from '../../../shared/model/image'
import {
  DEFAULT_LINES,
  type LineSettings,
  MAX_GRID,
  MAX_LINE_WIDTH_MM,
  MIN_LINE_WIDTH_MM,
  patchLines,
  sanitizeLines,
} from '../../../shared/model/lines'
import { compositionPaths } from '../../lines/composition'
import { MAX_EDGE_VERTICES } from '../../lines/edges/outline'
import { centreDashMm, centreDashPhaseMm } from '../../lines/geometry'
import { circlePath } from '../../lines/guides/curves'
import { edgePaths } from '../../lines/guides/edge-paths'
import { facePaths, MAX_CMDS_PER_FACE, MAX_FACES } from '../../lines/guides/face'
import { applyAffine, sourceToFrame } from '../../lines/guides/map'
import { MAX_CMDS_PER_POSE, MAX_POSES, poseFigure } from '../../lines/guides/pose'
import { NO_GUIDES, type ImageGuides, type PoseLandmarks } from '../../lines/guides/types'
import { frameOf, frameToPage } from '../../lines/place'
import { clearGaps } from '../../lines/test-support/dash'
import type { PathCmd } from '../../lines/types'
import type { RectMm } from '../../layout/types'
import {
  arbLineSettings,
  descriptor,
  EVERY_GUIDE,
  FIXTURE_FACE,
  FIXTURE_POSE,
  guidesFixture,
  PORTRAIT_PX,
  syntheticOutline,
  worstCaseGuides,
} from '../test-support/fixtures'
import type { LineStroke, TileLines } from '../types'
import { MAX_GUIDE_CMDS_PER_TILE, MAX_LINE_CMDS_PER_TILE, tileLinesFor } from './tile-lines'

/** An image of the portrait fixture's size printing `lines`. */
const on = (lines: LineSettings, edits: Partial<ImageEdits> = {}) => ({
  ...descriptor('a', PORTRAIT_PX.w, PORTRAIT_PX.h, edits),
  lines,
})

const compo = (lines: LineSettings, t: RectMm, turned: boolean, tileIndex: number) =>
  tileLinesFor(on(lines), NO_GUIDES, t, turned, tileIndex)

const trim = { x: 10, y: 20, w: 40, h: 30 }
const thirds = patchLines(DEFAULT_LINES, { thirds: true })
const everyType = patchLines(DEFAULT_LINES, {
  grid: { on: true, cols: MAX_GRID, rows: MAX_GRID },
  thirds: true,
  armature: true,
  golden: true,
  spiral: { on: true },
  centre: true,
})

const anyTrim = fc.record({
  x: fc.double({ min: -500, max: 500, noNaN: true }),
  y: fc.double({ min: -500, max: 500, noNaN: true }),
  w: fc.double({ min: 1, max: 1000, noNaN: true }),
  h: fc.double({ min: 1, max: 1000, noNaN: true }),
})

const pointsOf = (cmds: readonly PathCmd[]): [number, number][] =>
  cmds.flatMap((c): [number, number][] =>
    c.op === 'C'
      ? [
          [c.x1, c.y1],
          [c.x2, c.y2],
          [c.x, c.y],
        ]
      : [[c.x, c.y]],
  )

function inside(r: RectMm, [x, y]: [number, number]): boolean {
  const eps = 1e-9 * (1 + Math.abs(r.x) + Math.abs(r.y) + r.w + r.h)
  return x >= r.x - eps && x <= r.x + r.w + eps && y >= r.y - eps && y <= r.y + r.h + eps
}

const cmdCount = (lines: typeof DEFAULT_LINES, turned = false): number =>
  compo(lines, trim, turned, 0)?.strokes.reduce((k, s) => k + s.cmds.length, 0) ?? 0

/** On a tile under 30 × the width, whether phase 0 leaves a centre line without a whole gap off the crossing (on each side whose half holds a period). */
function needsCentring(t: RectMm, widthMm: number): boolean {
  if (Math.min(t.w, t.h) >= 30 * widthMm) return false
  const [dash, gap] = centreDashMm(widthMm, Math.min(t.w, t.h))
  return [t.w, t.h].some((length) => {
    const half = length / 2
    const { before, after } = clearGaps(length, dash, gap, 0, half, widthMm)
    const period = dash + gap
    return !(before + after > 0 && (half < period || before > 0) && (half < period || after > 0))
  })
}

/** Each segment M a L b split at its midpoint m into the arms M m L a and M m L b. */
function armsOf(cmds: readonly PathCmd[]): PathCmd[] {
  const out: PathCmd[] = []
  for (let i = 0; i + 1 < cmds.length; i += 2) {
    const a = cmds[i]
    const b = cmds[i + 1]
    if (a?.op !== 'M' || b?.op !== 'L') throw new Error('not a segment')
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    out.push(
      { op: 'M', ...m },
      { op: 'L', x: a.x, y: a.y },
      { op: 'M', ...m },
      { op: 'L', x: b.x, y: b.y },
    )
  }
  return out
}

/** The tile's dashed batch as the page model must hold it: M3's centre lines, or their arms with the centred phase. */
function expectedDashed(lines: LineSettings, t: RectMm, turned: boolean): LineStroke | null {
  const cmds = compositionPaths(lines, frameOf(t, turned))
    .filter((p) => p.dashed)
    .flatMap((p) => p.cmds.map((c) => frameToPage(c, t, turned)))
  if (cmds.length === 0) return null
  const dashMm = [...centreDashMm(lines.style.widthMm, Math.min(t.w, t.h))]
  if (!needsCentring(t, lines.style.widthMm)) return { dashMm, cmds }
  return { dashMm, cmds: armsOf(cmds), dashPhaseMm: (dashMm[0] ?? 0) / 2 }
}

const armLength = (arm: readonly PathCmd[]): number => {
  const [a, b] = arm
  return a && b && a.op !== 'C' && b.op !== 'C' ? Math.hypot(b.x - a.x, b.y - a.y) : NaN
}

describe('tileLinesFor', () => {
  it('null when nothing is on', () => {
    expect(compo(DEFAULT_LINES, trim, false, 0)).toBeNull()
  })

  it('null when the only type on draws nothing (a 1 × 1 grid)', () => {
    const oneByOne = patchLines(DEFAULT_LINES, { grid: { on: true, cols: 1, rows: 1 } })
    expect(compo(oneByOne, trim, false, 0)).toBeNull()
  })

  it('clips to the trim and carries the style', () => {
    const styled = patchLines(thirds, {
      style: { colour: '#102030', widthMm: 0.5, opacityPct: 60 },
    })
    expect(compo(styled, trim, false, 3)).toMatchObject({
      tileIndex: 3,
      clip: trim,
      colour: '#102030',
      widthMm: 0.5,
      opacity: 0.6,
      types: ['thirds'],
    })
  })

  it('carries the colour, width and opacity of any settings (property)', () => {
    fc.assert(
      fc.property(arbLineSettings, fc.nat({ max: 50 }), (lines, tileIndex) => {
        const tl = compo(patchLines(lines, { thirds: true }), trim, false, tileIndex)
        const { colour, widthMm, opacityPct } = lines.style
        expect(tl && [tl.tileIndex, tl.colour, tl.widthMm, tl.opacity]).toEqual([
          tileIndex,
          colour,
          widthMm,
          opacityPct / 100,
        ])
      }),
    )
  })

  it('lists only the types that drew something, in canonical order', () => {
    const lines = patchLines(DEFAULT_LINES, {
      centre: true,
      grid: { on: true, cols: 1, rows: 1 },
      spiral: { on: true },
      thirds: true,
    })
    expect(compo(lines, trim, false, 0)?.types).toEqual(['thirds', 'spiral', 'centre'])
  })

  it('places the thirds in page mm', () => {
    const tl = compo(thirds, trim, false, 0)
    expect(tl?.strokes).toHaveLength(1)
    expect(tl?.strokes[0]?.cmds.slice(0, 2)).toEqual([
      { op: 'M', x: 10 + 40 / 3, y: 20 },
      { op: 'L', x: 10 + 40 / 3, y: 50 },
    ])
  })

  it('one solid batch then one dashed batch (M3-R7)', () => {
    const tl = compo(patchLines(thirds, { centre: true, golden: true }), trim, false, 0)
    expect(tl?.strokes.map((s) => s.dashMm)).toEqual([
      [],
      [...centreDashMm(DEFAULT_LINES.style.widthMm, 30)],
    ])
    expect(tl?.strokes[0]?.cmds).toHaveLength(16)
    expect(tl?.strokes[0]?.cmds.slice(0, 8)).toEqual(
      compo(thirds, trim, false, 0)?.strokes[0]?.cmds,
    )
    expect(tl?.strokes[1]?.cmds).toHaveLength(4)
  })

  it('omits the solid batch when only centre lines are on', () => {
    const tl = compo(patchLines(DEFAULT_LINES, { centre: true }), trim, false, 0)
    expect(tl?.strokes).toHaveLength(1)
    expect(tl?.strokes[0]?.dashMm).toEqual([...centreDashMm(DEFAULT_LINES.style.widthMm, 30)])
  })

  it('dashes scale with the width', () => {
    const tl = compo(
      patchLines(DEFAULT_LINES, { centre: true, style: { widthMm: 1.5 } }),
      { x: 10, y: 20, w: 80, h: 60 },
      false,
      0,
    )
    expect(tl?.strokes[0]?.dashMm).toEqual([9, 6])
  })

  it('tileLinesFor passes the tile’s short side, whichever side it is and either turn (M5-R20)', () => {
    const centre = patchLines(DEFAULT_LINES, { centre: true, style: { widthMm: 1 } })
    for (const t of [
      { x: 10, y: 20, w: 15, h: 40 },
      { x: 10, y: 20, w: 40, h: 15 },
    ])
      for (const turned of [false, true]) {
        const dash = compo(centre, t, turned, 0)?.strokes[0]?.dashMm
        expect(dash).toEqual([...centreDashMm(1, 15)])
        expect(dash?.[0]).toBeCloseTo(3, 9)
        expect(dash?.[1]).toBeCloseTo(2, 9)
      }
  })

  it('maps every command with frameToPage, solid types first, in canonical order', () => {
    fc.assert(
      fc.property(arbLineSettings, anyTrim, fc.boolean(), (lines, t, turned) => {
        const paths = compositionPaths(lines, frameOf(t, turned))
        const placed = (dashed: boolean) =>
          paths
            .filter((p) => p.dashed === dashed)
            .flatMap((p) => p.cmds.map((c) => frameToPage(c, t, turned)))
        const tl = compo(lines, t, turned, 0)
        const all = tl?.strokes.flatMap((s) => s.cmds) ?? []
        const dashed = needsCentring(t, lines.style.widthMm) ? armsOf(placed(true)) : placed(true)
        expect(all).toEqual([...placed(false), ...dashed])
      }),
    )
  })

  it('a turned tile rotates the frame clockwise: a top-left spiral starts at the trim top right', () => {
    const spiral = patchLines(DEFAULT_LINES, { spiral: { on: true, corner: 'topLeft' } })
    const tl = compo(spiral, trim, true, 0)
    expect(tl?.strokes[0]?.cmds[0]).toEqual({ op: 'M', x: 50, y: 20 })
    expect(compo(spiral, trim, false, 0)?.strokes[0]?.cmds[0]).toEqual({
      op: 'M',
      x: 10,
      y: 20,
    })
  })

  it('a turned tile runs the grid columns down the page', () => {
    const grid = patchLines(DEFAULT_LINES, { grid: { on: true, cols: 2, rows: 1 } })
    expect(compo(grid, trim, true, 0)?.strokes[0]?.cmds).toEqual([
      { op: 'M', x: 50, y: 35 },
      { op: 'L', x: 10, y: 35 },
    ])
  })

  it('keeps every point and control point within the trim (property)', () => {
    fc.assert(
      fc.property(arbLineSettings, anyTrim, fc.boolean(), (lines, t, turned) => {
        const tl = compo(lines, t, turned, 0)
        expect(tl === null || tl.clip === t).toBe(true)
        tl?.strokes.forEach((s) => {
          pointsOf(s.cmds).forEach((p) => {
            expect(inside(t, p)).toBe(true)
          })
        })
      }),
    )
  })

  it('stays under MAX_LINE_CMDS_PER_TILE for any settings (memory budget)', () => {
    expect(MAX_LINE_CMDS_PER_TILE).toBe(200)
    expect(cmdCount(everyType)).toBe(76 + 58)
    expect(cmdCount(everyType, true)).toBe(76 + 58)
    fc.assert(
      fc.property(arbLineSettings, (lines) => {
        expect(cmdCount(sanitizeLines(lines))).toBeLessThanOrEqual(MAX_LINE_CMDS_PER_TILE)
      }),
    )
  })
})

describe('centre lines on the smallest tiles (dash phase)', () => {
  const centre2 = patchLines(DEFAULT_LINES, { centre: true, style: { widthMm: 2 } })
  const small: readonly [string, RectMm][] = [
    ['12 × 8', { x: 10, y: 20, w: 12, h: 8 }],
    ['8 × 12', { x: 10, y: 20, w: 8, h: 12 }],
  ]

  it.each(small)(
    'the %s mm tile at 2 mm: one dashed stroke, the centre lines split at the crossing, phase dash / 2',
    (_, t) => {
      for (const turned of [false, true]) {
        const tl = compo(centre2, t, turned, 0)
        expect(tl?.strokes).toHaveLength(1)
        const s = tl?.strokes[0]
        const [dash = NaN, gap = NaN] = s?.dashMm ?? []
        expect(dash).toBeCloseTo(3, 9)
        expect(gap).toBeCloseTo(2, 9)
        expect(s?.dashPhaseMm).toBeCloseTo(1.5, 9)
        expect(s?.cmds).toHaveLength(8)
        expect(s).toEqual(expectedDashed(centre2, t, turned))
        const centre = { x: t.x + t.w / 2, y: t.y + t.h / 2 }
        for (let i = 0; i < 8; i += 2) {
          const start = s?.cmds[i]
          expect(start?.op).toBe('M')
          expect(
            start && start.op !== 'C' && Math.hypot(start.x - centre.x, start.y - centre.y),
          ).toBeLessThan(1e-9)
        }
      }
    },
  )

  it.each(small)(
    'the %s mm tile at 2 mm: every arm shows a whole gap off the crossing line, with a dash past it',
    (_, t) => {
      const s = compo(centre2, t, false, 0)?.strokes[0]
      const [dash = NaN, gap = NaN] = s?.dashMm ?? []
      for (let i = 0; i < 8; i += 4) {
        const arm = s?.cmds.slice(i, i + 2) ?? []
        const length = armLength(arm)
        const gaps = clearGaps(length, dash, gap, s?.dashPhaseMm ?? 0, 0, 2)
        expect(gaps.after).toBeGreaterThan(0)
        expect((s?.dashPhaseMm ?? 0) + length).toBeGreaterThan(dash + gap)
      }
    },
  )

  it('before the phase, the 8 mm line’s only gap fell under the crossing line', () => {
    const [dash, gap] = centreDashMm(2, 8)
    expect(clearGaps(8, dash, gap, 0, 4, 2)).toEqual({ before: 0, after: 0 })
    expect(needsCentring({ x: 0, y: 0, w: 12, h: 8 }, 2)).toBe(true)
  })

  it.each([
    ['20 × 20', { x: 10, y: 20, w: 20, h: 20 }],
    ['20 × 15', { x: 10, y: 20, w: 20, h: 15 }],
    ['16 × 12', { x: 10, y: 20, w: 16, h: 12 }],
  ] as const)('a %s mm tile at 2 mm keeps M3’s centre lines with no phase', (_, t) => {
    for (const turned of [false, true]) {
      const s = compo(centre2, t, turned, 0)?.strokes[0]
      expect(s).toEqual({
        dashMm: [...centreDashMm(2, Math.min(t.w, t.h))],
        cmds: compositionPaths(centre2, frameOf(t, turned)).flatMap((p) =>
          p.cmds.map((c) => frameToPage(c, t, turned)),
        ),
      })
      expect(s && 'dashPhaseMm' in s).toBe(false)
    }
  })

  it('the phase is 0 whenever the tile’s short side is at least 30 × the width, even where the floor period leaves no gap off the crossing (property)', () => {
    const lines = patchLines(DEFAULT_LINES, { centre: true, style: { widthMm: 0.1 } })
    const t = { x: 0, y: 0, w: 3, h: 3 }
    expect(clearGaps(3, 1.5, 1, 0, 1.5, 0.1)).toEqual({ before: 0, after: 0 })
    expect(compo(lines, t, false, 0)?.strokes[0]).toEqual({
      dashMm: [1.5, 1],
      cmds: compositionPaths(lines, t).flatMap((p) => p.cmds.map((c) => frameToPage(c, t, false))),
    })
    fc.assert(
      fc.property(arbLineSettings, anyTrim, fc.boolean(), (lines, t, turned) => {
        fc.pre(lines.centre && Math.min(t.w, t.h) >= 30 * lines.style.widthMm)
        const tl = compo(lines, t, turned, 0)
        for (const s of tl?.strokes ?? []) expect('dashPhaseMm' in s).toBe(false)
      }),
    )
  })

  it('splits the centre lines exactly when phase 0 leaves one without a whole gap off the crossing (property)', () => {
    fc.assert(
      fc.property(arbLineSettings, anyTrim, fc.boolean(), (lines, t, turned) => {
        const dashed = compo(lines, t, turned, 0)?.strokes.find((s) => s.dashMm.length > 0)
        expect(dashed ?? null).toEqual(expectedDashed(lines, t, turned))
        if (dashed) {
          const [dash = NaN, gap = NaN] = dashed.dashMm
          const need =
            Math.min(t.w, t.h) < 30 * lines.style.widthMm &&
            [t.w, t.h].some(
              (l) => centreDashPhaseMm(l, dash, gap, l / 2, lines.style.widthMm) !== 0,
            )
          expect('dashPhaseMm' in dashed).toBe(need)
        }
      }),
    )
  })

  it('on a split tile, every arm long enough for half a dash and a gap shows a whole gap off the crossing (property)', () => {
    const widths = fc.integer({ min: 1, max: 20 }).map((k) => k / 10)
    const sides = fc.double({ min: 1, max: 80, noNaN: true })
    fc.assert(
      fc.property(widths, sides, sides, fc.boolean(), (widthMm, w, h, turned) => {
        const t = { x: 5, y: 7, w, h }
        fc.pre(needsCentring(t, widthMm))
        const lines = patchLines(DEFAULT_LINES, { centre: true, style: { widthMm } })
        const s = compo(lines, t, turned, 0)?.strokes[0]
        const [dash = NaN, gap = NaN] = s?.dashMm ?? []
        for (let i = 0; i < 8; i += 2) {
          const length = armLength(s?.cmds.slice(i, i + 2) ?? [])
          if (length < dash / 2 + gap) continue
          expect(
            clearGaps(length, dash, gap, s?.dashPhaseMm ?? 0, 0, widthMm).after,
          ).toBeGreaterThan(0)
        }
      }),
    )
  })
})

const m3Dash = (w: number) => [Math.max(1.5, 6 * w), Math.max(1, 4 * w)]

/** M3's tileLinesFor, frozen: without guides the page model must not change by a byte. */
function m3TileLinesFor(
  lines: LineSettings,
  t: RectMm,
  turned: boolean,
  tileIndex: number,
  dashMm: readonly number[] = m3Dash(lines.style.widthMm),
): TileLines | null {
  const paths = compositionPaths(lines, frameOf(t, turned))
  if (paths.length === 0) return null
  const place = (dashed: boolean) =>
    paths
      .filter((p) => p.dashed === dashed)
      .flatMap((p) => p.cmds.map((c) => frameToPage(c, t, turned)))
  const { colour, widthMm, opacityPct } = lines.style
  const strokes: LineStroke[] = [
    { dashMm: [], cmds: place(false) },
    { dashMm: [...dashMm], cmds: place(true) },
  ].filter((s) => s.cmds.length > 0)
  return {
    tileIndex,
    clip: t,
    colour,
    opacity: opacityPct / 100,
    widthMm,
    types: paths.map((p) => p.type),
    strokes,
  }
}

const rotations = fc.constantFrom<Rotation>(0, 90, 180, 270)
const guideSwitches = fc.record({
  edges: fc.record({ on: fc.boolean(), detailPct: fc.integer({ min: 1, max: 100 }) }),
  face: fc.boolean(),
  pose: fc.boolean(),
})
const anyEdits = fc.record({
  rotation: rotations,
  flipH: fc.boolean(),
  flipV: fc.boolean(),
  crop: fc.oneof(
    fc.constant(null),
    fc.constant({ x: 300, y: 200, w: 800, h: 1200 }),
    fc.constant({ x: 0, y: 1500, w: PORTRAIT_PX.w, h: 548 }),
  ),
})

const guidesOnly = patchLines(DEFAULT_LINES, EVERY_GUIDE)
const solidOf = (tl: TileLines | null): readonly PathCmd[] =>
  tl?.strokes.find((s) => s.dashMm.length === 0)?.cmds ?? []
const cmdTotal = (tl: TileLines | null): number =>
  tl?.strokes.reduce((k, s) => k + s.cmds.length, 0) ?? 0

/** What each guide should add to the solid batch, in page mm, mapped as M4-R10 and M4-R12 say. */
function expectedGuides(
  img: ReturnType<typeof on>,
  guides: ImageGuides,
  t: RectMm,
  turned: boolean,
): { edges: PathCmd[]; face: PathCmd[]; pose: PathCmd[] } {
  const m = sourceToFrame(img, frameOf(t, turned))
  const place = (c: PathCmd) => frameToPage(applyAffine(m, c), t, turned)
  const pose = (guides.poses ?? []).flatMap((p) => {
    const fig = poseFigure(p, img)
    return [
      ...fig.cmds.map(place),
      ...fig.joints.flatMap((j) => {
        const c = place({ op: 'M', x: j.x, y: j.y })
        return circlePath(c.x, c.y, img.lines.style.widthMm / 2)
      }),
    ]
  })
  return {
    edges: guides.edges ? edgePaths(guides.edges, img).map(place) : [],
    face: (guides.faces ?? []).flatMap((f) => facePaths(f, img)).map(place),
    pose,
  }
}

const rounded = (c: PathCmd | undefined) =>
  c &&
  Object.fromEntries(
    Object.entries(c).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(6)) : v]),
  )

describe('tileLinesFor with guides (M4-R11, R12, R17)', () => {
  const tall = { x: 20, y: 30, w: 60, h: 90 }

  it('without guides the tile lines equal M3’s, byte for byte, whatever the guide switches (property)', () => {
    fc.assert(
      fc.property(arbLineSettings, guideSwitches, anyTrim, fc.boolean(), (lines, g, t, turned) => {
        const img = on(patchLines(lines, g))
        const dash = centreDashMm(lines.style.widthMm, Math.min(t.w, t.h))
        const m3 = m3TileLinesFor(lines, t, turned, 2, dash)
        const want = m3 && {
          ...m3,
          strokes: m3.strokes.map((s) =>
            s.dashMm.length > 0 ? (expectedDashed(lines, t, turned) ?? s) : s,
          ),
        }
        expect(JSON.stringify(tileLinesFor(img, NO_GUIDES, t, turned, 2))).toBe(
          JSON.stringify(want),
        )
      }),
    )
  })

  it('on every tile whose short side is at least 30 × the line width, the tile lines equal M3’s, byte for byte (property)', () => {
    fc.assert(
      fc.property(arbLineSettings, anyTrim, fc.boolean(), (lines, t, turned) => {
        fc.pre(Math.min(t.w, t.h) >= 30 * lines.style.widthMm)
        expect(JSON.stringify(compo(lines, t, turned, 2))).toBe(
          JSON.stringify(m3TileLinesFor(lines, t, turned, 2)),
        )
      }),
    )
  })

  it('guide paths join the solid batch after the composition paths, in edges, face, pose order', () => {
    const img = on(patchLines(DEFAULT_LINES, { ...EVERY_GUIDE, thirds: true, centre: true }))
    const guides = guidesFixture()
    const tl = tileLinesFor(img, guides, tall, false, 0)
    const want = expectedGuides(img, guides, tall, false)
    expect(want.edges.length * want.face.length * want.pose.length).toBeGreaterThan(0)
    const thirdsOnly = compo(patchLines(DEFAULT_LINES, { thirds: true }), tall, false, 0)
    expect(solidOf(tl)).toEqual([...solidOf(thirdsOnly), ...want.edges, ...want.face, ...want.pose])
  })

  it('the dashed batch still holds only the centre lines, and there are never more than two batches', () => {
    const img = on(patchLines(DEFAULT_LINES, { ...EVERY_GUIDE, centre: true }))
    const tl = tileLinesFor(img, guidesFixture(), tall, true, 0)
    const centreOnly = compo(patchLines(DEFAULT_LINES, { centre: true }), tall, true, 0)
    expect(tl?.strokes).toHaveLength(2)
    expect(tl?.strokes[1]).toEqual(centreOnly?.strokes[0])
    expect(tl?.strokes[0]?.dashMm).toEqual([])
  })

  it('types lists the guide types that drew something, in LINE_TYPES order', () => {
    const img = on(patchLines(DEFAULT_LINES, { ...EVERY_GUIDE, thirds: true }))
    expect(tileLinesFor(img, guidesFixture(), tall, false, 0)?.types).toEqual([
      'thirds',
      'edges',
      'face',
      'pose',
    ])
    const noFace = { ...guidesFixture(), faces: [] }
    expect(tileLinesFor(img, noFace, tall, false, 0)?.types).toEqual(['thirds', 'edges', 'pose'])
    const unknown = { ...guidesFixture(), edges: null, poses: null }
    expect(tileLinesFor(img, unknown, tall, false, 0)?.types).toEqual(['thirds', 'face'])
  })

  it('draws a guide only while its switch is on, whatever was found', () => {
    const guides = guidesFixture()
    const only = (patch: Parameters<typeof patchLines>[1]) =>
      tileLinesFor(on(patchLines(DEFAULT_LINES, patch)), guides, tall, false, 0)?.types ?? []
    expect(only({ edges: { on: true } })).toEqual(['edges'])
    expect(only({ face: true })).toEqual(['face'])
    expect(only({ pose: true })).toEqual(['pose'])
    expect(only({ thirds: true })).toEqual(['thirds'])
  })

  it('a guide with nothing found adds no entry; with composition lines on, the entry has only the composition types', () => {
    const nothing: ImageGuides = { faces: [], poses: [], edges: { polylines: [] } }
    expect(tileLinesFor(on(guidesOnly), nothing, tall, false, 0)).toBeNull()
    expect(tileLinesFor(on(guidesOnly), NO_GUIDES, tall, false, 0)).toBeNull()
    const lines = patchLines(guidesOnly, { thirds: true })
    expect(tileLinesFor(on(lines), nothing, tall, false, 4)).toEqual(compo(lines, tall, false, 4))
  })

  it('a face outside the crop adds nothing', () => {
    const img = on(patchLines(DEFAULT_LINES, { face: true }), {
      crop: { x: 0, y: 1500, w: PORTRAIT_PX.w, h: 548 },
    })
    expect(tileLinesFor(img, guidesFixture(), tall, false, 0)).toBeNull()
  })

  it('clips guides to the trim and carries the style', () => {
    const style = { colour: '#102030', widthMm: 0.5, opacityPct: 60 }
    const img = on(patchLines(guidesOnly, { style }))
    expect(tileLinesFor(img, guidesFixture(), tall, false, 7)).toMatchObject({
      tileIndex: 7,
      clip: tall,
      colour: '#102030',
      widthMm: 0.5,
      opacity: 0.6,
    })
  })

  it('a pose joint is a circle of radius widthMm / 2 on the page, for every turn, rotation and flip (property)', () => {
    fc.assert(
      fc.property(
        anyEdits,
        fc.boolean(),
        fc.double({ min: MIN_LINE_WIDTH_MM, max: MAX_LINE_WIDTH_MM, noNaN: true }),
        anyTrim,
        (edits, turned, widthMm, t) => {
          const img = on(patchLines(DEFAULT_LINES, { pose: true, style: { widthMm } }), edits)
          const fig = poseFigure(FIXTURE_POSE, img)
          const tl = tileLinesFor(img, { ...NO_GUIDES, poses: [FIXTURE_POSE] }, t, turned, 0)
          const dots = solidOf(tl).slice(fig.cmds.length)
          expect(dots).toHaveLength(5 * fig.joints.length)
          const r = img.lines.style.widthMm / 2
          const tol = 1e-9 * (1 + Math.abs(t.x) + Math.abs(t.y) + t.w + t.h)
          for (let j = 0; j < fig.joints.length; j++) {
            const circle = dots.slice(5 * j, 5 * j + 5)
            const [top, right, bottom, left, back] = circle
            if (!top || !right || !bottom || !left || !back) throw new Error('short circle')
            expect(circle.map((c) => c.op)).toEqual(['M', 'C', 'C', 'C', 'C'])
            expect(Math.abs((bottom.y - top.y) / 2 - r)).toBeLessThan(tol)
            expect(Math.abs((right.x - left.x) / 2 - r)).toBeLessThan(tol)
            expect(Math.abs(bottom.x - top.x)).toBeLessThan(tol)
            expect(Math.abs(right.y - left.y)).toBeLessThan(tol)
            const want = pointsOf(circlePath(top.x, top.y + r, r))
            pointsOf(circle).forEach(([x, y], q) => {
              expect(Math.abs(x - (want[q]?.[0] ?? NaN))).toBeLessThan(tol)
              expect(Math.abs(y - (want[q]?.[1] ?? NaN))).toBeLessThan(tol)
            })
          }
        },
      ),
    )
  })

  it('places every guide through sourceToFrame then frameToPage (property)', () => {
    fc.assert(
      fc.property(anyEdits, fc.boolean(), anyTrim, (edits, turned, t) => {
        const img = on(guidesOnly, edits)
        const guides = guidesFixture()
        const want = expectedGuides(img, guides, t, turned)
        const got = solidOf(tileLinesFor(img, guides, t, turned, 0))
        expect(got).toEqual([...want.edges, ...want.face, ...want.pose])
      }),
    )
  })

  it('one tile with every guide from the fixtures (golden)', () => {
    const img = on(patchLines(guidesOnly, { style: { widthMm: 0.5 } }))
    const guides = guidesFixture()
    const tl = tileLinesFor(img, guides, tall, false, 0)
    const want = expectedGuides(img, guides, tall, false)
    const cmds = solidOf(tl)
    const nE = want.edges.length
    const nF = want.face.length
    const edges = cmds.slice(0, nE)
    const face = cmds.slice(nE, nE + nF)
    const pose = cmds.slice(nE + nF)
    expect({
      types: tl?.types,
      batches: tl?.strokes.length,
      edges: {
        ops: edges.map((c) => c.op).join(''),
        first: rounded(edges[0]),
        last: rounded(edges.at(-1)),
      },
      face: face.map(rounded),
      pose: {
        ops: pose.map((c) => c.op).join(''),
        first: rounded(pose[0]),
        last: rounded(pose.at(-1)),
      },
    }).toMatchSnapshot()
  })

  it('the per-image caps of every guide add up to at most MAX_GUIDE_CMDS_PER_TILE', () => {
    expect(
      MAX_LINE_CMDS_PER_TILE +
        MAX_EDGE_VERTICES +
        MAX_FACES * MAX_CMDS_PER_FACE +
        MAX_POSES * MAX_CMDS_PER_POSE,
    ).toBeLessThanOrEqual(MAX_GUIDE_CMDS_PER_TILE)
  })

  it('never more than MAX_GUIDE_CMDS_PER_TILE commands: the worst case and any guides (property)', () => {
    expect(MAX_GUIDE_CMDS_PER_TILE).toBe(6000)
    const worst = on(patchLines(everyType, EVERY_GUIDE))
    const full = tileLinesFor(worst, worstCaseGuides(), tall, false, 0)
    expect(full?.types).toEqual([
      ...(compo(everyType, tall, false, 0)?.types ?? []),
      'edges',
      'face',
      'pose',
    ])
    expect(cmdTotal(full)).toBe(134 + 4000 + 4 * 63 + 4 * 99)
    expect(cmdTotal(full)).toBeLessThanOrEqual(MAX_GUIDE_CMDS_PER_TILE)
    const arbPose: fc.Arbitrary<PoseLandmarks> = fc.record({
      points: fc.array(
        fc.record({
          x: fc.double({ min: -0.2, max: 1.2, noNaN: true }),
          y: fc.double({ min: -0.2, max: 1.2, noNaN: true }),
        }),
        { minLength: 33, maxLength: 33 },
      ),
      visibility: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
        minLength: 33,
        maxLength: 33,
      }),
    })
    const shiftedFace = fc.double({ min: -0.3, max: 0.3, noNaN: true }).map((d) => ({
      points: FIXTURE_FACE.points.map((p) => ({ x: p.x + d, y: p.y - d })),
    }))
    fc.assert(
      fc.property(
        arbLineSettings,
        guideSwitches,
        anyEdits,
        fc.array(shiftedFace, { maxLength: 4 }),
        fc.array(arbPose, { maxLength: 4 }),
        fc.integer({ min: 1, max: 100 }),
        fc.boolean(),
        (lines, g, edits, faces, poses, count, turned) => {
          const img = on(sanitizeLines(patchLines(lines, g)), edits)
          const edges = syntheticOutline(count, Math.floor(4000 / count))
          const tl = tileLinesFor(img, { faces, poses, edges }, tall, turned, 0)
          expect(cmdTotal(tl)).toBeLessThanOrEqual(MAX_GUIDE_CMDS_PER_TILE)
        },
      ),
      { numRuns: 60 },
    )
  })
})
