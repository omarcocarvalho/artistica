export const COMPOSITION_LINE_TYPES = [
  'grid',
  'thirds',
  'armature',
  'golden',
  'spiral',
  'centre',
] as const
export type CompositionLineType = (typeof COMPOSITION_LINE_TYPES)[number]

export const SPIRAL_CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const
export type SpiralCorner = (typeof SPIRAL_CORNERS)[number]

export interface GridLines {
  readonly on: boolean
  /** Integer MIN_GRID..MAX_GRID. */
  readonly cols: number
  /** Integer MIN_GRID..MAX_GRID. */
  readonly rows: number
}

export interface SpiralLines {
  readonly on: boolean
  /** Where the outer arc starts (M3-R10). */
  readonly corner: SpiralCorner
}

export interface LineStyle {
  /** '#rrggbb', lowercase. */
  readonly colour: string
  /** MIN_LINE_WIDTH_MM..MAX_LINE_WIDTH_MM, a multiple of LINE_WIDTH_STEP_MM. */
  readonly widthMm: number
  /** Integer MIN_LINE_OPACITY_PCT..MAX_LINE_OPACITY_PCT. */
  readonly opacityPct: number
}

export interface LineSettings {
  readonly grid: GridLines
  readonly thirds: boolean
  readonly armature: boolean
  readonly golden: boolean
  readonly spiral: SpiralLines
  readonly centre: boolean
  readonly style: LineStyle
}

export const MIN_GRID = 1
export const MAX_GRID = 20
export const MIN_LINE_WIDTH_MM = 0.1
export const MAX_LINE_WIDTH_MM = 2
export const LINE_WIDTH_STEP_MM = 0.05
export const MIN_LINE_OPACITY_PCT = 10
export const MAX_LINE_OPACITY_PCT = 100

/** Owner Q6 default (design/lines.html): every type off (Q29), grid 4 × 5, spiral from the top left, #e0457b, 0.35 mm, 90 %. */
export const DEFAULT_LINES: LineSettings = {
  grid: { on: false, cols: 4, rows: 5 },
  thirds: false,
  armature: false,
  golden: false,
  spiral: { on: false, corner: 'topLeft' },
  centre: false,
  style: { colour: '#e0457b', widthMm: 0.35, opacityPct: 90 },
}

const D = DEFAULT_LINES

function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(value)))
}

/** Two decimals after snapping, so 0.35 stays 0.35 and not 0.35000000000000003. */
function widthOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return D.style.widthMm
  const clamped = Math.min(MAX_LINE_WIDTH_MM, Math.max(MIN_LINE_WIDTH_MM, value))
  return Math.round(Math.round(clamped / LINE_WIDTH_STEP_MM) * LINE_WIDTH_STEP_MM * 100) / 100
}

const HEX = /^#[0-9a-f]{6}$/
function colourOf(value: unknown): string {
  if (typeof value !== 'string') return D.style.colour
  const v = value.trim().toLowerCase()
  return HEX.test(v) ? v : D.style.colour
}

const isCorner = (v: unknown): v is SpiralCorner =>
  (SPIRAL_CORNERS as readonly unknown[]).includes(v)
const bool = (v: unknown): boolean => v === true
const fieldsOf = (v: unknown): Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

/** Total and idempotent (M3-R16): plain data of any shape becomes valid; each bad field takes its default alone. */
export function sanitizeLines(lines: LineSettings): LineSettings {
  const raw = fieldsOf(lines)
  const grid = fieldsOf(raw.grid)
  const spiral = fieldsOf(raw.spiral)
  const style = fieldsOf(raw.style)
  return {
    grid: {
      on: bool(grid.on),
      cols: clampInt(grid.cols, MIN_GRID, MAX_GRID, D.grid.cols),
      rows: clampInt(grid.rows, MIN_GRID, MAX_GRID, D.grid.rows),
    },
    thirds: bool(raw.thirds),
    armature: bool(raw.armature),
    golden: bool(raw.golden),
    spiral: {
      on: bool(spiral.on),
      corner: isCorner(spiral.corner) ? spiral.corner : D.spiral.corner,
    },
    centre: bool(raw.centre),
    style: {
      colour: colourOf(style.colour),
      widthMm: widthOf(style.widthMm),
      opacityPct: clampInt(
        style.opacityPct,
        MIN_LINE_OPACITY_PCT,
        MAX_LINE_OPACITY_PCT,
        D.style.opacityPct,
      ),
    },
  }
}

export function linesEqual(a: LineSettings, b: LineSettings): boolean {
  return (
    a.grid.on === b.grid.on &&
    a.grid.cols === b.grid.cols &&
    a.grid.rows === b.grid.rows &&
    a.thirds === b.thirds &&
    a.armature === b.armature &&
    a.golden === b.golden &&
    a.spiral.on === b.spiral.on &&
    a.spiral.corner === b.spiral.corner &&
    a.centre === b.centre &&
    a.style.colour === b.style.colour &&
    a.style.widthMm === b.style.widthMm &&
    a.style.opacityPct === b.style.opacityPct
  )
}

export interface LinesPatch {
  readonly grid?: Partial<GridLines>
  readonly thirds?: boolean
  readonly armature?: boolean
  readonly golden?: boolean
  readonly spiral?: Partial<SpiralLines>
  readonly centre?: boolean
  readonly style?: Partial<LineStyle>
}

function defined<T extends object>(patch: T | undefined): Partial<T> {
  const entries: [string, unknown][] = Object.entries(patch ?? {})
  return Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Merge (grid, spiral and style one level deep; undefined = not patched), then sanitize. */
export function patchLines(lines: LineSettings, patch: LinesPatch): LineSettings {
  return sanitizeLines({
    grid: { ...lines.grid, ...defined(patch.grid) },
    thirds: patch.thirds ?? lines.thirds,
    armature: patch.armature ?? lines.armature,
    golden: patch.golden ?? lines.golden,
    spiral: { ...lines.spiral, ...defined(patch.spiral) },
    centre: patch.centre ?? lines.centre,
    style: { ...lines.style, ...defined(patch.style) },
  })
}

/** The switched-on types, in COMPOSITION_LINE_TYPES order. */
export function activeLineTypes(lines: LineSettings): readonly CompositionLineType[] {
  const on: Record<CompositionLineType, boolean> = {
    grid: lines.grid.on,
    thirds: lines.thirds,
    armature: lines.armature,
    golden: lines.golden,
    spiral: lines.spiral.on,
    centre: lines.centre,
  }
  return COMPOSITION_LINE_TYPES.filter((t) => on[t])
}

/**
 * Stable string of what prints: '-' when no type is on; otherwise the active types with their
 * parameters, then the style, e.g. 'g4x5,t,phi,s:topLeft|#e0457b|0.35|90'. Injective over sanitized
 * settings that print something; ignores the parameters of types that are off.
 */
export function linesKey(lines: LineSettings): string {
  const types = activeLineTypes(lines)
  if (types.length === 0) return '-'
  const part: Record<CompositionLineType, string> = {
    grid: `g${String(lines.grid.cols)}x${String(lines.grid.rows)}`,
    thirds: 't',
    armature: 'a',
    golden: 'phi',
    spiral: `s:${lines.spiral.corner}`,
    centre: 'c',
  }
  const { colour, widthMm, opacityPct } = lines.style
  return `${types.map((t) => part[t]).join(',')}|${colour}|${String(widthMm)}|${String(opacityPct)}`
}

/** Every type off; grid size, spiral corner and style kept (owner Q7 default: what new photos inherit). */
export function withoutLineTypes(lines: LineSettings): LineSettings {
  return {
    ...lines,
    grid: { ...lines.grid, on: false },
    thirds: false,
    armature: false,
    golden: false,
    spiral: { ...lines.spiral, on: false },
    centre: false,
  }
}
