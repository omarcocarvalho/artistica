import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  activeLineTypes,
  COMPOSITION_LINE_TYPES,
  DEFAULT_LINES,
  linesEqual,
  linesKey,
  patchLines,
  sanitizeLines,
  SPIRAL_CORNERS,
  withoutLineTypes,
  type LineSettings,
} from './lines'

const anyValue = fc.oneof(
  fc.double(),
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
)
const anyLines = fc.record({
  grid: fc.record({ on: anyValue, cols: anyValue, rows: anyValue }),
  thirds: anyValue,
  armature: anyValue,
  golden: anyValue,
  spiral: fc.record({
    on: anyValue,
    corner: fc.oneof(fc.constantFrom(...SPIRAL_CORNERS), fc.string()),
  }),
  centre: anyValue,
  style: fc.record({
    colour: fc.oneof(fc.string(), fc.constant('#A1B2C3')),
    widthMm: anyValue,
    opacityPct: anyValue,
  }),
}) as fc.Arbitrary<unknown> as fc.Arbitrary<LineSettings>

const garbage = fc.oneof(anyValue, fc.array(anyValue), fc.dictionary(fc.string(), anyValue))
const anyShape = fc.oneof(
  anyLines,
  garbage,
  fc.record({ grid: garbage, spiral: garbage, style: garbage, thirds: garbage }),
) as fc.Arbitrary<unknown> as fc.Arbitrary<LineSettings>

describe('sanitizeLines', () => {
  it('is total and idempotent', () => {
    fc.assert(
      fc.property(anyLines, (raw) => {
        const once = sanitizeLines(raw)
        expect(sanitizeLines(once)).toEqual(once)
        expect(once.grid.cols).toBeGreaterThanOrEqual(1)
        expect(once.grid.cols).toBeLessThanOrEqual(20)
        expect(once.grid.rows).toBeGreaterThanOrEqual(1)
        expect(once.grid.rows).toBeLessThanOrEqual(20)
        expect(Number.isInteger(once.grid.cols)).toBe(true)
        expect(Number.isInteger(once.grid.rows)).toBe(true)
        expect(Number.isInteger(once.style.opacityPct)).toBe(true)
        expect(once.style.opacityPct).toBeGreaterThanOrEqual(10)
        expect(once.style.opacityPct).toBeLessThanOrEqual(100)
        expect(once.style.widthMm).toBeGreaterThanOrEqual(0.1)
        expect(once.style.widthMm).toBeLessThanOrEqual(2)
        expect(once.style.colour).toMatch(/^#[0-9a-f]{6}$/)
        expect(SPIRAL_CORNERS).toContain(once.spiral.corner)
        expect(
          Math.abs(once.style.widthMm / 0.05 - Math.round(once.style.widthMm / 0.05)),
        ).toBeLessThan(1e-9)
      }),
    )
  })

  it('never throws on malformed input, at the top level or in a nested group', () => {
    fc.assert(
      fc.property(anyShape, (raw) => {
        const s = sanitizeLines(raw)
        expect(sanitizeLines(s)).toEqual(s)
      }),
    )
    for (const raw of [null, undefined, 42, 'lines', [], { grid: null, spiral: 7, style: 'x' }]) {
      expect(sanitizeLines(raw as unknown as LineSettings)).toEqual(DEFAULT_LINES)
    }
  })

  it('clamps, rounds and falls back field by field', () => {
    const s = sanitizeLines({
      grid: { on: 1, cols: 99, rows: Number.NaN },
      thirds: 'yes',
      spiral: { on: true, corner: 'middle' },
      style: { colour: ' #ABCDEF ', widthMm: 0.337, opacityPct: 5 },
    } as unknown as LineSettings)
    expect(s.grid).toEqual({ on: false, cols: 20, rows: 5 })
    expect(s.thirds).toBe(false)
    expect(s.spiral).toEqual({ on: true, corner: 'topLeft' })
    expect(s.style).toEqual({ colour: '#abcdef', widthMm: 0.35, opacityPct: 10 })
  })

  it('pins the ranges at their edges', () => {
    const at = (grid: number, widthMm: number, opacityPct: number) =>
      sanitizeLines({
        ...DEFAULT_LINES,
        grid: { on: true, cols: grid, rows: grid },
        style: { ...DEFAULT_LINES.style, widthMm, opacityPct },
      })
    const low = at(0, 0.05, 9)
    expect([low.grid.cols, low.grid.rows, low.style.widthMm, low.style.opacityPct]).toEqual([
      1, 1, 0.1, 10,
    ])
    const high = at(21, 2.05, 101)
    expect([high.grid.cols, high.grid.rows, high.style.widthMm, high.style.opacityPct]).toEqual([
      20, 20, 2, 100,
    ])
    const inside = at(1, 0.1, 10)
    expect([inside.grid.cols, inside.style.widthMm, inside.style.opacityPct]).toEqual([1, 0.1, 10])
    expect(at(20, 2, 100).style).toEqual({ colour: '#e0457b', widthMm: 2, opacityPct: 100 })
  })

  it('snaps the width to 0.05 mm and keeps two decimals', () => {
    const width = (widthMm: number) =>
      sanitizeLines({ ...DEFAULT_LINES, style: { ...DEFAULT_LINES.style, widthMm } }).style.widthMm
    expect(width(0.35)).toBe(0.35)
    expect(width(0.324)).toBe(0.3)
    expect(width(0.326)).toBe(0.35)
    expect(width(1.17)).toBe(1.15)
    expect(width(0.7)).toBe(0.7)
  })

  it('gives every snapped width back unchanged, with at most two decimals', () => {
    const width = (widthMm: number) =>
      sanitizeLines({ ...DEFAULT_LINES, style: { ...DEFAULT_LINES.style, widthMm } }).style.widthMm
    for (let k = 2; k <= 40; k++) {
      const w = (k * 5) / 100
      expect(width(w)).toBe(w)
    }
    expect(width(0.1 + 0.2)).toBe(0.3)
    expect(width(0.15 + 0.2)).toBe(0.35)
    fc.assert(
      fc.property(fc.double({ min: -1, max: 3, noNaN: true }), (v) => {
        const w = width(v)
        expect(Number(w.toFixed(2))).toBe(w)
        expect(width(w)).toBe(w)
      }),
    )
  })

  it('takes the default for a non-finite or non-number grid size, width or opacity', () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '7',
      '0.5',
      '',
      true,
      null,
      [3],
    ]) {
      const s = sanitizeLines({
        ...DEFAULT_LINES,
        grid: { on: true, cols: bad as number, rows: bad as number },
        style: { ...DEFAULT_LINES.style, widthMm: bad as number, opacityPct: bad as number },
      })
      expect([s.grid.cols, s.grid.rows, s.style.widthMm, s.style.opacityPct]).toEqual([
        4, 5, 0.35, 90,
      ])
    }
  })

  it('rounds the grid and opacity to integers', () => {
    const s = sanitizeLines({
      ...DEFAULT_LINES,
      grid: { on: true, cols: 3.4, rows: 3.6 },
      style: { ...DEFAULT_LINES.style, opacityPct: 55.5 },
    })
    expect([s.grid.cols, s.grid.rows, s.style.opacityPct]).toEqual([3, 4, 56])
  })

  it('falls back to the default colour for anything that is not #rrggbb', () => {
    const colour = (c: unknown) =>
      sanitizeLines({
        ...DEFAULT_LINES,
        style: { ...DEFAULT_LINES.style, colour: c as string },
      }).style.colour
    expect(colour('#1F3FBF')).toBe('#1f3fbf')
    expect(colour('\t#1F3FBF\n')).toBe('#1f3fbf')
    for (const bad of [
      '#fff',
      '#FFF',
      '1f3fbf',
      'x#1f3fbf',
      '##1f3fbf',
      '#1f3fbg',
      '#1f3fbf0',
      '#1f 3fbf',
      'red',
      'rgb(31, 63, 191)',
      '',
      7,
      null,
    ]) {
      expect(colour(bad)).toBe('#e0457b')
    }
  })

  it('only true switches a type on', () => {
    for (const v of ['yes', 1, 'true', {}, null]) {
      const s = sanitizeLines({ ...DEFAULT_LINES, centre: v as boolean })
      expect(s.centre).toBe(false)
    }
    expect(sanitizeLines({ ...DEFAULT_LINES, centre: true }).centre).toBe(true)
  })

  it('keeps every corner and replaces an unknown one with the top left', () => {
    for (const corner of SPIRAL_CORNERS) {
      expect(sanitizeLines({ ...DEFAULT_LINES, spiral: { on: true, corner } }).spiral.corner).toBe(
        corner,
      )
    }
    expect(SPIRAL_CORNERS).toEqual(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'])
  })

  it('keeps the defaults as they are', () => {
    expect(sanitizeLines(DEFAULT_LINES)).toEqual(DEFAULT_LINES)
  })

  it('pins the defaults (owner Q6)', () => {
    expect(DEFAULT_LINES).toEqual({
      grid: { on: false, cols: 4, rows: 5 },
      thirds: false,
      armature: false,
      golden: false,
      spiral: { on: false, corner: 'topLeft' },
      centre: false,
      style: { colour: '#e0457b', widthMm: 0.35, opacityPct: 90 },
    })
  })
})

describe('linesEqual', () => {
  it('compares by value, not by identity', () => {
    const copy = JSON.parse(JSON.stringify(DEFAULT_LINES)) as LineSettings
    expect(copy).not.toBe(DEFAULT_LINES)
    expect(linesEqual(copy, DEFAULT_LINES)).toBe(true)
  })

  it('tells apart settings that differ in any single field', () => {
    const changes: LineSettings[] = [
      { ...DEFAULT_LINES, grid: { ...DEFAULT_LINES.grid, on: true } },
      { ...DEFAULT_LINES, grid: { ...DEFAULT_LINES.grid, cols: 3 } },
      { ...DEFAULT_LINES, grid: { ...DEFAULT_LINES.grid, rows: 3 } },
      { ...DEFAULT_LINES, thirds: true },
      { ...DEFAULT_LINES, armature: true },
      { ...DEFAULT_LINES, golden: true },
      { ...DEFAULT_LINES, spiral: { ...DEFAULT_LINES.spiral, on: true } },
      { ...DEFAULT_LINES, spiral: { ...DEFAULT_LINES.spiral, corner: 'bottomRight' } },
      { ...DEFAULT_LINES, centre: true },
      { ...DEFAULT_LINES, style: { ...DEFAULT_LINES.style, colour: '#000000' } },
      { ...DEFAULT_LINES, style: { ...DEFAULT_LINES.style, widthMm: 1 } },
      { ...DEFAULT_LINES, style: { ...DEFAULT_LINES.style, opacityPct: 50 } },
    ]
    for (const changed of changes) {
      expect(linesEqual(changed, DEFAULT_LINES)).toBe(false)
      expect(linesEqual(DEFAULT_LINES, changed)).toBe(false)
    }
  })

  it('agrees with deep equality over sanitized settings', () => {
    fc.assert(
      fc.property(anyLines, anyLines, (a, b) => {
        const x = sanitizeLines(a)
        const y = sanitizeLines(b)
        expect(linesEqual(x, y)).toBe(JSON.stringify(x) === JSON.stringify(y))
        expect(linesEqual(x, sanitizeLines(x))).toBe(true)
      }),
    )
  })
})

describe('keys and helpers', () => {
  it('lists active types in canonical order', () => {
    const on = patchLines(DEFAULT_LINES, { centre: true, grid: { on: true }, spiral: { on: true } })
    expect(activeLineTypes(on)).toEqual(['grid', 'spiral', 'centre'])
    const all = patchLines(DEFAULT_LINES, {
      centre: true,
      spiral: { on: true },
      golden: true,
      armature: true,
      thirds: true,
      grid: { on: true },
    })
    expect(activeLineTypes(all)).toEqual([
      'grid',
      'thirds',
      'armature',
      'golden',
      'spiral',
      'centre',
    ])
    expect(activeLineTypes(DEFAULT_LINES)).toEqual([])
  })

  it("is '-' when nothing prints, whatever the parameters", () => {
    expect(linesKey(DEFAULT_LINES)).toBe('-')
    expect(
      linesKey(patchLines(DEFAULT_LINES, { grid: { cols: 9 }, style: { colour: '#000000' } })),
    ).toBe('-')
  })

  it('spells out what prints', () => {
    const lines = patchLines(DEFAULT_LINES, {
      grid: { on: true },
      thirds: true,
      golden: true,
      spiral: { on: true },
    })
    expect(linesKey(lines)).toBe('g4x5,t,phi,s:topLeft|#e0457b|0.35|90')
    expect(linesKey(patchLines(DEFAULT_LINES, { armature: true, centre: true }))).toBe(
      'a,c|#e0457b|0.35|90',
    )
  })

  it('is injective over sanitized settings that print', () => {
    fc.assert(
      fc.property(anyLines, anyLines, (a, b) => {
        const x = sanitizeLines(a)
        const y = sanitizeLines(b)
        if (activeLineTypes(x).length === 0 || activeLineTypes(y).length === 0) return
        const prints = (l: LineSettings) =>
          JSON.stringify([
            activeLineTypes(l),
            l.grid.on ? [l.grid.cols, l.grid.rows] : null,
            l.spiral.on ? l.spiral.corner : null,
            l.style,
          ])
        expect(linesKey(x) === linesKey(y)).toBe(prints(x) === prints(y))
      }),
    )
  })

  it('withoutLineTypes keeps style, grid size and corner', () => {
    const all = patchLines(DEFAULT_LINES, {
      grid: { on: true, cols: 3 },
      thirds: true,
      armature: true,
      golden: true,
      spiral: { on: true, corner: 'bottomRight' },
      centre: true,
      style: { widthMm: 1 },
    })
    const off = withoutLineTypes(all)
    expect(activeLineTypes(off)).toEqual([])
    expect(off.grid).toEqual({ on: false, cols: 3, rows: 5 })
    expect(off.spiral).toEqual({ on: false, corner: 'bottomRight' })
    expect(off.style).toEqual({ colour: '#e0457b', widthMm: 1, opacityPct: 90 })
  })

  it('patches one level deep and sanitizes', () => {
    const p = patchLines(DEFAULT_LINES, { style: { opacityPct: 250 }, grid: { rows: undefined } })
    expect(p.style).toEqual({ ...DEFAULT_LINES.style, opacityPct: 100 })
    expect(p.grid).toEqual(DEFAULT_LINES.grid)
  })

  it('keeps the unpatched fields of a group and every unpatched type', () => {
    const start = patchLines(DEFAULT_LINES, {
      thirds: true,
      grid: { on: true, cols: 7 },
      spiral: { on: true, corner: 'bottomLeft' },
      style: { colour: '#123456' },
    })
    const p = patchLines(start, { grid: { rows: 2 }, spiral: { corner: undefined }, centre: true })
    expect(p.grid).toEqual({ on: true, cols: 7, rows: 2 })
    expect(p.spiral).toEqual({ on: true, corner: 'bottomLeft' })
    expect(p.style).toEqual({ colour: '#123456', widthMm: 0.35, opacityPct: 90 })
    expect(p.thirds).toBe(true)
    expect(p.centre).toBe(true)
    expect(patchLines(start, { thirds: undefined }).thirds).toBe(true)
    expect(patchLines(start, {})).toEqual(start)
  })

  it("keeps every type the patch does not name, from the image's own settings", () => {
    const allOn = patchLines(DEFAULT_LINES, {
      grid: { on: true, cols: 2, rows: 9 },
      thirds: true,
      armature: true,
      golden: true,
      spiral: { on: true, corner: 'topRight' },
      centre: true,
      style: { colour: '#0a0b0c', widthMm: 1.5, opacityPct: 40 },
    })
    expect(patchLines(allOn, { style: { opacityPct: 41 } })).toEqual({
      ...allOn,
      style: { ...allOn.style, opacityPct: 41 },
    })
    expect(
      patchLines(allOn, {
        grid: undefined,
        thirds: undefined,
        armature: undefined,
        golden: undefined,
        spiral: undefined,
        centre: undefined,
        style: undefined,
      }),
    ).toEqual(allOn)
    expect(patchLines(allOn, { golden: false })).toEqual({ ...allOn, golden: false })
  })

  it('changes the key exactly when one change alters what prints', () => {
    const printing = anyLines.map(sanitizeLines).filter((l) => activeLineTypes(l).length > 0)
    const change: fc.Arbitrary<(l: LineSettings) => LineSettings> = fc.oneof(
      fc
        .integer({ min: 1, max: 20 })
        .map((cols) => (l: LineSettings) => patchLines(l, { grid: { cols } })),
      fc
        .integer({ min: 1, max: 20 })
        .map((rows) => (l: LineSettings) => patchLines(l, { grid: { rows } })),
      fc
        .constantFrom(...SPIRAL_CORNERS)
        .map((corner) => (l: LineSettings) => patchLines(l, { spiral: { corner } })),
      fc.constantFrom(...COMPOSITION_LINE_TYPES).map((t) => (l: LineSettings) => {
        if (t === 'grid') return patchLines(l, { grid: { on: !l.grid.on } })
        if (t === 'spiral') return patchLines(l, { spiral: { on: !l.spiral.on } })
        return patchLines(l, { [t]: !l[t] })
      }),
      fc
        .integer({ min: 0, max: 0xffffff })
        .map(
          (n) => (l: LineSettings) =>
            patchLines(l, { style: { colour: `#${n.toString(16).padStart(6, '0')}` } }),
        ),
      fc
        .integer({ min: 2, max: 40 })
        .map((k) => (l: LineSettings) => patchLines(l, { style: { widthMm: k * 0.05 } })),
      fc
        .integer({ min: 10, max: 100 })
        .map((opacityPct) => (l: LineSettings) => patchLines(l, { style: { opacityPct } })),
    )
    const prints = (l: LineSettings) =>
      JSON.stringify([
        activeLineTypes(l),
        l.grid.on ? [l.grid.cols, l.grid.rows] : null,
        l.spiral.on ? l.spiral.corner : null,
        activeLineTypes(l).length > 0 ? l.style : null,
      ])
    fc.assert(
      fc.property(printing, change, (x, f) => {
        const y = f(x)
        expect(linesKey(x) === linesKey(y)).toBe(prints(x) === prints(y))
      }),
    )
  })

  it('has one key per canonical type', () => {
    expect(COMPOSITION_LINE_TYPES).toEqual([
      'grid',
      'thirds',
      'armature',
      'golden',
      'spiral',
      'centre',
    ])
  })
})
