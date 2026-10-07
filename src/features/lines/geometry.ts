import type { Mm } from '../../shared/model/units.ts'
import type { FrameSize, PathCmd } from './types.ts'

export const PHI = (1 + Math.sqrt(5)) / 2
/** M3-R11: 1/φ² ≈ 0.382 and 1/φ ≈ 0.618 of each side. */
export const GOLDEN_FRACTIONS: readonly [number, number] = [1 / (PHI * PHI), 1 / PHI]

const seg = (x1: Mm, y1: Mm, x2: Mm, y2: Mm): PathCmd[] => [
  { op: 'M', x: x1, y: y1 },
  { op: 'L', x: x2, y: y2 },
]
const verticals = (xs: readonly Mm[], h: Mm): PathCmd[] => xs.flatMap((x) => seg(x, 0, x, h))
const horizontals = (ys: readonly Mm[], w: Mm): PathCmd[] => ys.flatMap((y) => seg(0, y, w, y))
/** Multiply before dividing, so a 3-way split gives the same floats as `thirdsPaths`. */
const interior = (n: number, side: Mm): Mm[] =>
  Array.from({ length: Math.max(0, n - 1) }, (_, i) => ((i + 1) * side) / n)

/** M3-R13. */
export function gridPaths(cols: number, rows: number, { w, h }: FrameSize): PathCmd[] {
  return [...verticals(interior(cols, w), h), ...horizontals(interior(rows, h), w)]
}

export function thirdsPaths({ w, h }: FrameSize): PathCmd[] {
  return [...verticals([w / 3, (2 * w) / 3], h), ...horizontals([h / 3, (2 * h) / 3], w)]
}

export function goldenPaths({ w, h }: FrameSize): PathCmd[] {
  const [a, b] = GOLDEN_FRACTIONS
  return [...verticals([a * w, b * w], h), ...horizontals([a * h, b * h], w)]
}

export function centrePaths({ w, h }: FrameSize): PathCmd[] {
  return [...seg(w / 2, 0, w / 2, h), ...seg(0, h / 2, w, h / 2)]
}

/** M3-R12. The rhombus is one open subpath with no close-path, so both renderers draw the same joins. */
export function armaturePaths({ w, h }: FrameSize): PathCmd[] {
  const mx = w / 2
  const my = h / 2
  return [
    ...seg(0, 0, w, h),
    ...seg(w, 0, 0, h),
    ...seg(0, 0, w, my),
    ...seg(0, 0, mx, h),
    ...seg(w, 0, 0, my),
    ...seg(w, 0, mx, h),
    ...seg(0, h, w, my),
    ...seg(0, h, mx, 0),
    ...seg(w, h, 0, my),
    ...seg(w, h, mx, 0),
    { op: 'M', x: mx, y: 0 },
    { op: 'L', x: w, y: my },
    { op: 'L', x: mx, y: h },
    { op: 'L', x: 0, y: my },
    { op: 'L', x: mx, y: 0 },
  ]
}

/** M3-R14: the mockup's 6 : 4 dash, floored so thin lines still read as dashed. */
export function centreDashMm(widthMm: Mm): readonly [Mm, Mm] {
  return [Math.max(1.5, 6 * widthMm), Math.max(1, 4 * widthMm)]
}
