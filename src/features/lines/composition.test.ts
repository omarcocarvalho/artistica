import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  COMPOSITION_LINE_TYPES,
  DEFAULT_LINES,
  patchLines,
  SPIRAL_CORNERS,
} from '../../shared/model/lines'
import { compositionPaths } from './composition'
import { armaturePaths, centrePaths, goldenPaths, gridPaths, thirdsPaths } from './geometry'
import { goldenSpiral } from './spiral'

const frame = { w: 100, h: 80 }
const everyType = patchLines(DEFAULT_LINES, {
  centre: true,
  spiral: { on: true },
  golden: true,
  armature: true,
  thirds: true,
  grid: { on: true },
})

describe('compositionPaths', () => {
  it('returns [] when no type is on', () => {
    expect(compositionPaths(DEFAULT_LINES, frame)).toEqual([])
  })

  it('emits active types in canonical order, centre lines dashed and nothing else', () => {
    const paths = compositionPaths(everyType, frame)
    expect(paths.map((p) => p.type)).toEqual([
      'grid',
      'thirds',
      'armature',
      'golden',
      'spiral',
      'centre',
    ])
    expect(paths.map((p) => p.dashed)).toEqual([false, false, false, false, false, true])
  })

  it("gives each type exactly its geometry module's commands", () => {
    const byType = Object.fromEntries(
      compositionPaths(everyType, frame).map((p) => [p.type, p.cmds]),
    )
    expect(byType).toEqual({
      grid: gridPaths(DEFAULT_LINES.grid.cols, DEFAULT_LINES.grid.rows, frame),
      thirds: thirdsPaths(frame),
      armature: armaturePaths(frame),
      golden: goldenPaths(frame),
      spiral: goldenSpiral(DEFAULT_LINES.spiral.corner, frame),
      centre: centrePaths(frame),
    })
  })

  it('passes the grid size and the spiral corner through', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.constantFrom(...SPIRAL_CORNERS),
        (cols, rows, corner) => {
          const lines = patchLines(DEFAULT_LINES, {
            grid: { on: true, cols, rows },
            spiral: { on: true, corner },
          })
          const [grid, spiral] = compositionPaths(lines, frame)
          expect(grid?.cmds).toEqual(gridPaths(cols, rows, frame))
          expect(spiral?.cmds).toEqual(goldenSpiral(corner, frame))
        },
      ),
    )
  })

  it('drops a grid that draws nothing (1 × 1)', () => {
    const oneByOne = patchLines(DEFAULT_LINES, { grid: { on: true, cols: 1, rows: 1 } })
    expect(compositionPaths(oneByOne, frame)).toEqual([])
    const withThirds = patchLines(oneByOne, { thirds: true })
    expect(compositionPaths(withThirds, frame).map((p) => p.type)).toEqual(['thirds'])
  })

  it('emits one entry per switched-on type, each a list of subpaths starting with M', () => {
    fc.assert(
      fc.property(fc.subarray([...COMPOSITION_LINE_TYPES]), (types) => {
        const on = new Set(types)
        const lines = patchLines(DEFAULT_LINES, {
          grid: { on: on.has('grid') },
          thirds: on.has('thirds'),
          armature: on.has('armature'),
          golden: on.has('golden'),
          spiral: { on: on.has('spiral') },
          centre: on.has('centre'),
        })
        const paths = compositionPaths(lines, frame)
        expect(paths.map((p) => p.type)).toEqual(types)
        paths.forEach((p) => {
          expect(p.cmds[0]?.op).toBe('M')
        })
      }),
    )
  })
})
