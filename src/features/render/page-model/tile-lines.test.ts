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
import { centreDashMm } from '../../lines/geometry'
import { circlePath } from '../../lines/guides/curves'
import { edgePaths } from '../../lines/guides/edge-paths'
import { facePaths, MAX_CMDS_PER_FACE, MAX_FACES } from '../../lines/guides/face'
import { applyAffine, sourceToFrame } from '../../lines/guides/map'
import { MAX_CMDS_PER_POSE, MAX_POSES, poseFigure } from '../../lines/guides/pose'
import { NO_GUIDES, type ImageGuides, type PoseLandmarks } from '../../lines/guides/types'
import { frameOf, frameToPage } from '../../lines/place'
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
      [...centreDashMm(DEFAULT_LINES.style.widthMm)],
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
    expect(tl?.strokes[0]?.dashMm).toEqual([...centreDashMm(DEFAULT_LINES.style.widthMm)])
  })

  it('dashes scale with the width', () => {
    const tl = compo(
      patchLines(DEFAULT_LINES, { centre: true, style: { widthMm: 1.5 } }),
      trim,
      false,
      0,
    )
    expect(tl?.strokes[0]?.dashMm).toEqual([9, 6])
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
        expect(all).toEqual([...placed(false), ...placed(true)])
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

/** M3's tileLinesFor, frozen: without guides the page model must not change by a byte. */
function m3TileLinesFor(
  lines: LineSettings,
  t: RectMm,
  turned: boolean,
  tileIndex: number,
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
    { dashMm: [...centreDashMm(widthMm)], cmds: place(true) },
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
        expect(JSON.stringify(tileLinesFor(img, NO_GUIDES, t, turned, 2))).toBe(
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
