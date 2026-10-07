import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LINES, MAX_GRID, patchLines, sanitizeLines } from '../../../shared/model/lines'
import { compositionPaths } from '../../lines/composition'
import { centreDashMm } from '../../lines/geometry'
import { frameOf, frameToPage } from '../../lines/place'
import type { PathCmd } from '../../lines/types'
import type { RectMm } from '../../layout/types'
import { arbLineSettings } from '../test-support/fixtures'
import { MAX_LINE_CMDS_PER_TILE, tileLinesFor } from './tile-lines'

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
  tileLinesFor(lines, trim, turned, 0)?.strokes.reduce((k, s) => k + s.cmds.length, 0) ?? 0

describe('tileLinesFor', () => {
  it('null when nothing is on', () => {
    expect(tileLinesFor(DEFAULT_LINES, trim, false, 0)).toBeNull()
  })

  it('null when the only type on draws nothing (a 1 × 1 grid)', () => {
    const oneByOne = patchLines(DEFAULT_LINES, { grid: { on: true, cols: 1, rows: 1 } })
    expect(tileLinesFor(oneByOne, trim, false, 0)).toBeNull()
  })

  it('clips to the trim and carries the style', () => {
    const styled = patchLines(thirds, {
      style: { colour: '#102030', widthMm: 0.5, opacityPct: 60 },
    })
    expect(tileLinesFor(styled, trim, false, 3)).toMatchObject({
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
        const tl = tileLinesFor(patchLines(lines, { thirds: true }), trim, false, tileIndex)
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
    expect(tileLinesFor(lines, trim, false, 0)?.types).toEqual(['thirds', 'spiral', 'centre'])
  })

  it('places the thirds in page mm', () => {
    const tl = tileLinesFor(thirds, trim, false, 0)
    expect(tl?.strokes).toHaveLength(1)
    expect(tl?.strokes[0]?.cmds.slice(0, 2)).toEqual([
      { op: 'M', x: 10 + 40 / 3, y: 20 },
      { op: 'L', x: 10 + 40 / 3, y: 50 },
    ])
  })

  it('one solid batch then one dashed batch (M3-R7)', () => {
    const tl = tileLinesFor(patchLines(thirds, { centre: true, golden: true }), trim, false, 0)
    expect(tl?.strokes.map((s) => s.dashMm)).toEqual([
      [],
      [...centreDashMm(DEFAULT_LINES.style.widthMm)],
    ])
    expect(tl?.strokes[0]?.cmds).toHaveLength(16)
    expect(tl?.strokes[0]?.cmds.slice(0, 8)).toEqual(
      tileLinesFor(thirds, trim, false, 0)?.strokes[0]?.cmds,
    )
    expect(tl?.strokes[1]?.cmds).toHaveLength(4)
  })

  it('omits the solid batch when only centre lines are on', () => {
    const tl = tileLinesFor(patchLines(DEFAULT_LINES, { centre: true }), trim, false, 0)
    expect(tl?.strokes).toHaveLength(1)
    expect(tl?.strokes[0]?.dashMm).toEqual([...centreDashMm(DEFAULT_LINES.style.widthMm)])
  })

  it('dashes scale with the width', () => {
    const tl = tileLinesFor(
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
        const tl = tileLinesFor(lines, t, turned, 0)
        const all = tl?.strokes.flatMap((s) => s.cmds) ?? []
        expect(all).toEqual([...placed(false), ...placed(true)])
      }),
    )
  })

  it('a turned tile rotates the frame clockwise: a top-left spiral starts at the trim top right', () => {
    const spiral = patchLines(DEFAULT_LINES, { spiral: { on: true, corner: 'topLeft' } })
    const tl = tileLinesFor(spiral, trim, true, 0)
    expect(tl?.strokes[0]?.cmds[0]).toEqual({ op: 'M', x: 50, y: 20 })
    expect(tileLinesFor(spiral, trim, false, 0)?.strokes[0]?.cmds[0]).toEqual({
      op: 'M',
      x: 10,
      y: 20,
    })
  })

  it('a turned tile runs the grid columns down the page', () => {
    const grid = patchLines(DEFAULT_LINES, { grid: { on: true, cols: 2, rows: 1 } })
    expect(tileLinesFor(grid, trim, true, 0)?.strokes[0]?.cmds).toEqual([
      { op: 'M', x: 50, y: 35 },
      { op: 'L', x: 10, y: 35 },
    ])
  })

  it('keeps every point and control point within the trim (property)', () => {
    fc.assert(
      fc.property(arbLineSettings, anyTrim, fc.boolean(), (lines, t, turned) => {
        const tl = tileLinesFor(lines, t, turned, 0)
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
