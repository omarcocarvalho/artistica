import type { RectMm } from '../../src/features/layout/types.ts'
import { tileLinesFor as pageTileLines } from '../../src/features/render/page-model/tile-lines.ts'
import type { TileLines } from '../../src/features/render/types.ts'
import { DEFAULT_LINES, type LineSettings } from '../../src/shared/model/lines.ts'
import { DEFAULT_EDITS } from '../../src/shared/model/image.ts'
import { NO_GUIDES } from '../../src/features/lines/guides/types.ts'
import { PT_PER_MM } from '../../src/shared/model/units.ts'
import { rectPtToMm, strokeToMm, type PdfDraw, type PdfStroke } from './pdf.ts'

export type { RectMm, TileLines }
export interface PointMm {
  x: number
  y: number
}

/** The app's own pure geometry for one tile (what both renderers must draw). */
export function tileLinesFor(lines: LineSettings, trim: RectMm, turned: boolean): TileLines {
  const tile = pageTileLines(
    { pxW: 1, pxH: 1, edits: DEFAULT_EDITS, lines },
    NO_GUIDES,
    trim,
    turned,
    0,
  )
  if (!tile) throw new Error('these settings draw no lines')
  return tile
}

/** Line settings with only the given changes from the defaults. */
export function lineSettings(patch: {
  grid?: Partial<LineSettings['grid']>
  thirds?: boolean
  armature?: boolean
  golden?: boolean
  spiral?: Partial<LineSettings['spiral']>
  centre?: boolean
  style?: Partial<LineSettings['style']>
}): LineSettings {
  return {
    ...DEFAULT_LINES,
    ...patch,
    grid: { ...DEFAULT_LINES.grid, ...patch.grid },
    spiral: { ...DEFAULT_LINES.spiral, ...patch.spiral },
    style: { ...DEFAULT_LINES.style, ...patch.style },
  }
}

/** A drawn tile's trim in page mm (its draw box; bleed must be off). */
export const trimOf = (d: PdfDraw, pageHeightPt: number): RectMm =>
  rectPtToMm({ x: d.xPt, y: d.yPt, w: d.wPt, h: d.hPt }, pageHeightPt)

/** The engine turned the picture when its box and the photo disagree about which side is longer. */
export const isTurned = (d: PdfDraw, photoW: number, photoH: number): boolean =>
  d.wPt > d.hPt !== photoW > photoH

export const hexRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]

/** Every difference between the PDF strokes of one tile and the page model's lines for it. */
export function strokeMismatches(
  got: readonly PdfStroke[],
  want: TileLines,
  pageHeightPt: number,
  tolMm = 0.01,
): string[] {
  const out: string[] = []
  const near = (a: number, b: number, tol: number, what: string) => {
    if (!(Math.abs(a - b) <= tol)) out.push(`${what}: ${String(a)} vs ${String(b)}`)
  }
  if (got.length !== want.strokes.length)
    return [`${String(got.length)} strokes, want ${String(want.strokes.length)}`]
  const rgb = hexRgb(want.colour).map((c) => c / 255)
  got.forEach((s, i) => {
    const w = want.strokes[i]
    const at = `stroke ${String(i)}`
    if (s.colour.space !== 'rgb') out.push(`${at} colour space ${s.colour.space}`)
    rgb.forEach((c, k) => {
      near(s.colour.values[k] ?? NaN, c, 1 / 255, `${at} colour[${String(k)}]`)
    })
    near(s.widthPt, want.widthMm * PT_PER_MM, 0.01, `${at} width pt`)
    near(s.opacity, want.opacity, 1e-6, `${at} opacity`)
    if (s.cap !== 0 || s.join !== 0) out.push(`${at} cap/join ${String(s.cap)}/${String(s.join)}`)
    if (s.dashPt.length !== w.dashMm.length) out.push(`${at} dash ${JSON.stringify(s.dashPt)}`)
    w.dashMm.forEach((d, k) => {
      near(s.dashPt[k] ?? NaN, d * PT_PER_MM, 0.01, `${at} dash[${String(k)}] pt`)
    })
    if (!s.clip) out.push(`${at} has no rect clip`)
    else {
      const c = rectPtToMm(s.clip, pageHeightPt)
      near(c.x, want.clip.x, tolMm, `${at} clip x`)
      near(c.y, want.clip.y, tolMm, `${at} clip y`)
      near(c.w, want.clip.w, tolMm, `${at} clip w`)
      near(c.h, want.clip.h, tolMm, `${at} clip h`)
    }
    const path = strokeToMm(s, pageHeightPt)
    if (path.length !== w.cmds.length) {
      out.push(`${at} has ${String(path.length)} path ops, want ${String(w.cmds.length)}`)
      return
    }
    path.forEach((p, k) => {
      const q = w.cmds[k]
      if (p.op !== q.op) {
        out.push(`${at} op ${String(k)} is ${p.op}, want ${q.op}`)
        return
      }
      if (p.op === 'C' && q.op === 'C') {
        near(p.x1, q.x1, tolMm, `${at} op ${String(k)} x1`)
        near(p.y1, q.y1, tolMm, `${at} op ${String(k)} y1`)
        near(p.x2, q.x2, tolMm, `${at} op ${String(k)} x2`)
        near(p.y2, q.y2, tolMm, `${at} op ${String(k)} y2`)
      }
      near(p.x, q.x, tolMm, `${at} op ${String(k)} x`)
      near(p.y, q.y, tolMm, `${at} op ${String(k)} y`)
    })
  })
  return out
}

type Piece =
  | { kind: 'L'; a: PointMm; b: PointMm }
  | { kind: 'C'; p0: PointMm; p1: PointMm; p2: PointMm; p3: PointMm }

interface Subpath {
  readonly pieces: readonly Piece[]
  readonly dashMm: readonly number[]
  /** Polyline through the subpath (curves split finely), for distances. */
  readonly poly: readonly PointMm[]
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function at(p: Piece, t: number): PointMm {
  if (p.kind === 'L') return { x: lerp(p.a.x, p.b.x, t), y: lerp(p.a.y, p.b.y, t) }
  const u = 1 - t
  const f = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
  return {
    x: f(p.p0.x, p.p1.x, p.p2.x, p.p3.x),
    y: f(p.p0.y, p.p1.y, p.p2.y, p.p3.y),
  }
}

function tangent(p: Piece, t: number): PointMm {
  if (p.kind === 'L') return { x: p.b.x - p.a.x, y: p.b.y - p.a.y }
  const u = 1 - t
  const f = (a: number, b: number, c: number, d: number) =>
    3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c)
  return {
    x: f(p.p0.x, p.p1.x, p.p2.x, p.p3.x),
    y: f(p.p0.y, p.p1.y, p.p2.y, p.p3.y),
  }
}

const CURVE_STEPS = 64

function polyOf(p: Piece): PointMm[] {
  if (p.kind === 'L') return [p.a, p.b]
  return Array.from({ length: CURVE_STEPS + 1 }, (_, i) => at(p, i / CURVE_STEPS))
}

const dist = (a: PointMm, b: PointMm) => Math.hypot(a.x - b.x, a.y - b.y)

function lengthOf(p: Piece, t = 1): number {
  if (p.kind === 'L') return dist(p.a, p.b) * t
  let len = 0
  let prev = p.p0
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const next = at(p, (i / CURVE_STEPS) * t)
    len += dist(prev, next)
    prev = next
  }
  return len
}

function distToPoly(q: PointMm, poly: readonly PointMm[]): number {
  let best = Infinity
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]
    const b = poly[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)))
  }
  return best
}

function subpathsOf(tile: TileLines): Subpath[] {
  const out: Subpath[] = []
  for (const s of tile.strokes) {
    let pieces: Piece[] = []
    let cur: PointMm | null = null
    const flush = () => {
      if (pieces.length > 0)
        out.push({ pieces, dashMm: s.dashMm, poly: pieces.flatMap((p) => polyOf(p)) })
      pieces = []
    }
    for (const c of s.cmds) {
      if (c.op === 'M') {
        flush()
        cur = { x: c.x, y: c.y }
      } else if (cur) {
        const end = { x: c.x, y: c.y }
        pieces.push(
          c.op === 'C'
            ? { kind: 'C', p0: cur, p1: { x: c.x1, y: c.y1 }, p2: { x: c.x2, y: c.y2 }, p3: end }
            : { kind: 'L', a: cur, b: end },
        )
        cur = end
      }
    }
    flush()
  }
  return out
}

export interface SampleOptions {
  /** Spacing of on-line samples along straight pieces; curves are sampled at t = 1/4, 1/2, 3/4. */
  readonly stepMm: number
  /** An on-line sample is used only this far from every other subpath (crossings). */
  readonly crossMm: number
  /** Off-line samples sit this far to either side of the line. */
  readonly offsetMm: number
  /** …and at least this far from every subpath. */
  readonly clearMm: number
  /** Every sample stays this far inside the clip (the cut-line guide and the clip edge). */
  readonly edgeMm: number
  /** Samples this close to a dash end are skipped. */
  readonly dashMarginMm: number
  /** Also probe the device pixels just outside both edges of the stroke (see `LineSamples.edge`). */
  readonly edge?: EdgeOptions
}

export interface EdgeOptions {
  readonly pxPerMm: number
  /** How far past the stroke's edge a probed pixel's centre lies, at least, in device px. */
  readonly marginPx: number
  /** Probes stay this far from the ends of a straight piece (joins and caps). */
  readonly endMm: number
}

export interface LineSamples {
  /** Points that must show the line colour. */
  readonly on: PointMm[]
  /** Points beside the lines, or in a dash gap, that must show the photo. */
  readonly off: PointMm[]
  /**
   * Device-pixel centres just past either edge of the stroke, beside each on-line point, that
   * must show the photo: a path drawn off its place by more than about a pixel covers them.
   */
  readonly edge: PointMm[]
}

/** Sample points along every subpath of a tile's lines, away from crossings and edges. */
export function lineSamples(tile: TileLines, o: SampleOptions): LineSamples {
  const subs = subpathsOf(tile)
  const inside = (q: PointMm) =>
    q.x >= tile.clip.x + o.edgeMm &&
    q.x <= tile.clip.x + tile.clip.w - o.edgeMm &&
    q.y >= tile.clip.y + o.edgeMm &&
    q.y <= tile.clip.y + tile.clip.h - o.edgeMm
  const clearOf = (q: PointMm, skip: number | null, min: number) =>
    subs.every((s, i) => i === skip || distToPoly(q, s.poly) >= min)
  const on: PointMm[] = []
  const off: PointMm[] = []
  const edge: PointMm[] = []
  subs.forEach((sub, si) => {
    let before = 0
    for (const piece of sub.pieces) {
      const len = lengthOf(piece)
      const ts =
        piece.kind === 'C'
          ? [0.25, 0.5, 0.75]
          : Array.from(
              { length: Math.floor(len / o.stepMm) },
              (_, k) => ((k + 0.5) * o.stepMm) / len,
            )
      for (const t of ts) {
        const q = at(piece, t)
        if (!inside(q)) continue
        let gap = false
        if (sub.dashMm.length === 2) {
          const [dash, space] = sub.dashMm
          const pos = (before + lengthOf(piece, t)) % (dash + space)
          const m = o.dashMarginMm
          if (pos >= m && pos <= dash - m) gap = false
          else if (pos >= dash + m && pos <= dash + space - m) gap = true
          else continue
        }
        if (gap) {
          if (clearOf(q, si, o.clearMm)) off.push(q)
          continue
        }
        const lit = clearOf(q, si, o.crossMm)
        if (lit) on.push(q)
        const d = tangent(piece, t)
        const n = Math.hypot(d.x, d.y)
        if (n === 0) continue
        const normal = { x: -d.y / n, y: d.x / n }
        for (const side of [-1, 1]) {
          const p = {
            x: q.x + side * normal.x * o.offsetMm,
            y: q.y + side * normal.y * o.offsetMm,
          }
          if (inside(p) && clearOf(p, null, o.clearMm)) off.push(p)
        }
        const along = lengthOf(piece, t)
        if (o.edge && lit && along >= o.edge.endMm && len - along >= o.edge.endMm)
          for (const side of [-1, 1]) {
            const p = edgeProbe(q, { x: side * normal.x, y: side * normal.y }, sub, o.edge)
            if (p && inside(p) && clearOf(p, si, o.clearMm)) edge.push(p)
          }
      }
      before += len
    }
  })
  return { on, off, edge }

  function edgeProbe(q: PointMm, dir: PointMm, sub: Subpath, e: EdgeOptions): PointMm | null {
    const k = e.pxPerMm
    const min = tile.widthMm / 2 + e.marginPx / k
    for (let s = min; s <= min + 2 / k; s += 0.2 / k) {
      const c = {
        x: (Math.floor((q.x + dir.x * s) * k) + 0.5) / k,
        y: (Math.floor((q.y + dir.y * s) * k) + 0.5) / k,
      }
      if (distToPoly(c, sub.poly) >= min) return c
    }
    return null
  }
}

/** The point at `t` of the first curve of a tile's lines (the spiral's outer arc). */
export function firstCurvePoint(tile: TileLines, t: number): PointMm {
  for (const sub of subpathsOf(tile))
    for (const piece of sub.pieces) if (piece.kind === 'C') return at(piece, t)
  throw new Error('these lines have no curve')
}

/** Distance from a point to the nearest of a tile's lines. */
export const distanceToLines = (tile: TileLines, p: PointMm): number =>
  Math.min(...subpathsOf(tile).map((s) => distToPoly(p, s.poly)))

/** Euclidean RGB distance. */
export const rgbDistance = (px: readonly number[], rgb: readonly number[]): number =>
  Math.hypot(...rgb.map((c, i) => (px[i] ?? NaN) - c))

/**
 * How far a pixel sits from `from` towards `to`: 0 = `from`, 1 = `to` (the coverage of a line of
 * colour `to` drawn at full opacity over a flat `from`).
 */
export function towards(
  px: readonly number[],
  from: readonly number[],
  to: readonly number[],
): number {
  const d = to.map((c, i) => c - (from[i] ?? 0))
  const p = from.map((c, i) => (px[i] ?? NaN) - c)
  const dot = d.reduce((s, v, i) => s + v * (p[i] ?? NaN), 0)
  return dot / d.reduce((s, v) => s + v * v, 0)
}
