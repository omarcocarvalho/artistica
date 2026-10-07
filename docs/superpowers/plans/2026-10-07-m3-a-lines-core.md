# M3-A: Lines Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure core of composition lines: the per-image line settings model (`src/shared/model/lines.ts`) and the `ImageDescriptor.lines` field, the path types, the straight composition lines (grid, thirds, armature, golden ratio, centre), the mapping from the picture frame onto a tile on the page, and the golden spiral. Everything is plain TypeScript with no DOM, tested in node with example and property tests.

**Architecture:** An image's lines are described by `LineSettings` (which types are on, their parameters, one style). Geometry is computed in the **picture frame** — the picture as edited, in millimetres, origin top left (M3-R2) — as subpaths of `M`/`L`/`C` commands. `frameToPage` places a frame path on a tile's trim, rotating it 90° clockwise when the layout engine turned the item (M3-R3). Curves are cubic Béziers (the spiral's quarter arcs), so they stay exact in the PDF. C1 assembles these into the page model.

**Tech Stack:** TypeScript 6 (strict, `noUncheckedIndexedAccess`), Vitest 5 (`unit` project, node), fast-check 4. No new dependencies (M3-R18).

**Spec:** `docs/spec.md` §2.7, §4 (`lines/` pure TS), §7 (lines: thirds at 1/3 and 2/3, spiral within bounds) **and** `docs/superpowers/plans/2026-10-07-m3-overview.md` (rulings M3-R1–R3, R10–R16; Shared contracts → `lines.ts`, `image.ts`, `features/lines`). Design: `design/lines.html` (the line overlays' SVG is the visual reference: the golden lines at 114.6/185.4 of 300, the spiral's arc end points).

**Prerequisite:** M2 is released (`v0.2.0`). A1 merges before anything else in M3; A2 and A3 start together after A1.

## Global Constraints

From the overview, "Global constraints for every M3 sub-plan":

- One worktree (`.worktrees/m3-<task>`), branch and PR per task; Conventional Commit PR titles (table below); squash. Implementers open PRs and never merge.
- Every shell: `export ASDF_NODEJS_VERSION=24.14.0`; pnpm via `corepack pnpm`.
- Before every PR: `corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test && corepack pnpm e2e --project=chromium` (A has no E2E of its own; run the suite once in A1, which touches the images store, with `E2E_PORT=5001`).
- TypeScript strict and `noUncheckedIndexedAccess`; no `any`; no non-null assertions (an `at()` helper that throws, or `?? 0` where a default is meaningful).
- **Pure core:** `src/shared/model/lines.ts` and `src/features/lines/{types,geometry,place,spiral}.ts` have **no DOM access** and run in the `unit` (node) project.
- **Determinism (M3-R15):** fixed subpath order per the overview; no `Math.random`, no iteration over object keys for ordering.
- **TDD:** test first; paste the RED run in the PR description. **Mutation-checked review:** the reviewer breaks each invariant in "How each rule is tested" once and confirms a test fails.
- **No dependency or config changes** except A1's coverage `include` in `vite.config.ts` and A1's `NAMESPACES` entry.
- Prettier: `semi: false`, `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`. ESLint `strictTypeChecked` + `stylisticTypeChecked`, zero warnings.

Contract items this plan **produces**: the overview's "Shared contracts" blocks `src/shared/model/lines.ts`, `src/shared/model/image.ts` (extended), and `src/features/lines/` (`types.ts`, `geometry.ts`, `place.ts`, `spiral.ts`), verbatim.

## Review Focus

1. **A photo with a fixed print size on a tiny tile** (a 20 mm wide tile with a 20 × 20 grid and 2 mm lines). The geometry must stay finite and inside the frame; how crowded it looks is the user's choice. Pinned in A2 (`every point is inside the frame`, property over frames 1–1000 mm and grids 1–20).
2. **A square crop.** The spiral needs a long side; a square is treated as landscape (M3-R10) deterministically. Pinned in A3 (`a square frame uses the landscape construction`).
3. **The layout turns a group.** A frame of 30 × 40 placed in a 40 × 30 trim must rotate clockwise, never counter-clockwise or mirrored, or the spiral's start corner moves to the wrong place on paper. Pinned in A2 (`turned maps the frame's corners clockwise onto the trim`).
4. **Stored garbage.** Settings from an older or hand-edited `localStorage` reach `sanitizeLines` through B2's types-only schema; every field must fall back alone (M3-R16). Pinned in A1 (`sanitizeLines is total and idempotent`).
5. **Grid on top of thirds.** A 3 × 3 grid and the rule of thirds produce identical subpaths; that's fine because C1 strokes all solid paths once (M3-R7); A2 must not deduplicate (order and content are the contract). Pinned in A2 (`a 3 × 3 grid equals the thirds`).

## File map

| File | Task | Purpose |
|---|---|---|
| `src/shared/model/lines.ts` (+ `.test.ts`) | A1 | settings model, sanitizer, patch, keys |
| `src/shared/model/image.ts` | A1 | `ImageDescriptor.lines` |
| `src/features/images/store.ts`, `index.ts` selectors | A1 | create images with `DEFAULT_LINES`; descriptors carry `lines` |
| every descriptor test builder (`git grep -n "study:" -- 'src/**/*.ts' 'src/**/*.tsx'`) | A1 | add `lines` |
| `src/features/lines/types.ts`, `index.ts` | A1 | path types, barrel with sections |
| `src/locales/en/lines.json`, `src/shared/i18n/languages.ts` | A1 | `type.*`, `corner.*` keys; `'lines'` namespace |
| `vite.config.ts` | A1 | coverage `include` += `src/features/lines/**`, `src/shared/model/lines.ts` |
| `src/features/lines/geometry.ts`, `place.ts` (+ tests) | A2 | straight lines, frame mapping |
| `src/features/lines/spiral.ts` (+ tests) | A3 | golden spiral |

## Parallelization

A1 alone (wave 1). Then A2 ‖ A3 (wave 2, together with B1, B2, B3). A2 and A3 touch disjoint files except `src/features/lines/index.ts`, where each appends in its own section.

---

### Task A1: Line settings model and the `ImageDescriptor.lines` field

**Branch:** `feat/lines-model` · **PR title:** `feat(lines): add the composition-line settings model` · **Depends on:** — · **E2E port:** 5001

**Files:**
- Create: `src/shared/model/lines.ts`, `src/shared/model/lines.test.ts`, `src/features/lines/types.ts`, `src/features/lines/index.ts`, `src/locales/en/lines.json`
- Modify: `src/shared/model/image.ts`, `src/features/images/store.ts` (`loadOne`: `lines: DEFAULT_LINES`; `selectImageDescriptors`: `lines: img.lines`), `src/features/images/types.ts` if `LoadedImage` lists fields, `src/features/render/test-support/fixtures.ts` (`descriptor()`), the other descriptor builders, `src/shared/i18n/languages.ts`, `vite.config.ts`

- [ ] **Step 1: Worktree** `git worktree add .worktrees/m3-a1 -b feat/lines-model origin/master`, then `corepack pnpm install --frozen-lockfile`.

- [ ] **Step 2: Failing tests** `src/shared/model/lines.test.ts`:

```ts
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

const anyValue = fc.oneof(fc.double(), fc.integer(), fc.string(), fc.boolean(), fc.constant(null), fc.constant(undefined))
const anyLines = fc.record({
  grid: fc.record({ on: anyValue, cols: anyValue, rows: anyValue }),
  thirds: anyValue,
  armature: anyValue,
  golden: anyValue,
  spiral: fc.record({ on: anyValue, corner: fc.oneof(fc.constantFrom(...SPIRAL_CORNERS), fc.string()) }),
  centre: anyValue,
  style: fc.record({ colour: fc.oneof(fc.string(), fc.constant('#A1B2C3')), widthMm: anyValue, opacityPct: anyValue }),
}) as fc.Arbitrary<unknown> as fc.Arbitrary<LineSettings>

describe('sanitizeLines', () => {
  it('is total and idempotent', () => {
    fc.assert(
      fc.property(anyLines, (raw) => {
        const once = sanitizeLines(raw)
        expect(sanitizeLines(once)).toEqual(once)
        expect(once.grid.cols).toBeGreaterThanOrEqual(1)
        expect(once.grid.cols).toBeLessThanOrEqual(20)
        expect(Number.isInteger(once.style.opacityPct)).toBe(true)
        expect(once.style.colour).toMatch(/^#[0-9a-f]{6}$/)
        expect(Math.abs(once.style.widthMm / 0.05 - Math.round(once.style.widthMm / 0.05))).toBeLessThan(1e-9)
      }),
    )
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
  it('keeps the defaults as they are', () => {
    expect(sanitizeLines(DEFAULT_LINES)).toEqual(DEFAULT_LINES)
  })
})

describe('keys and helpers', () => {
  it('lists active types in canonical order', () => {
    const on = patchLines(DEFAULT_LINES, { centre: true, grid: { on: true }, spiral: { on: true } })
    expect(activeLineTypes(on)).toEqual(['grid', 'spiral', 'centre'])
  })
  it("is '-' when nothing prints, whatever the parameters", () => {
    expect(linesKey(DEFAULT_LINES)).toBe('-')
    expect(linesKey(patchLines(DEFAULT_LINES, { grid: { cols: 9 }, style: { colour: '#000000' } }))).toBe('-')
  })
  it('is injective over sanitized settings that print', () => {
    fc.assert(
      fc.property(anyLines, anyLines, (a, b) => {
        const x = sanitizeLines(a)
        const y = sanitizeLines(b)
        if (activeLineTypes(x).length === 0 || activeLineTypes(y).length === 0) return
        // What prints: the active types, the parameters of active types, the style.
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
      grid: { on: true, cols: 3 }, thirds: true, armature: true, golden: true,
      spiral: { on: true, corner: 'bottomRight' }, centre: true, style: { widthMm: 1 },
    })
    const off = withoutLineTypes(all)
    expect(activeLineTypes(off)).toEqual([])
    expect(off.grid.cols).toBe(3)
    expect(off.spiral.corner).toBe('bottomRight')
    expect(off.style).toEqual(all.style)
  })
  it('patches one level deep and sanitizes', () => {
    const p = patchLines(DEFAULT_LINES, { style: { opacityPct: 250 }, grid: { rows: undefined } })
    expect(p.style).toEqual({ ...DEFAULT_LINES.style, opacityPct: 100 })
    expect(p.grid).toEqual(DEFAULT_LINES.grid)
  })
  it('has one key per canonical type', () => {
    expect(COMPOSITION_LINE_TYPES).toEqual(['grid', 'thirds', 'armature', 'golden', 'spiral', 'centre'])
  })
})
```

Run `corepack pnpm vitest run src/shared/model/lines.test.ts` → FAIL (module missing). Paste the output in the PR.

- [ ] **Step 3: Implement `src/shared/model/lines.ts`** — the overview's contract plus this implementation (verified in a scratch run: the "clamps" case above gives exactly the asserted object):

```ts
const D = DEFAULT_LINES

function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(value)))
}

/** Clamp to the range, snap to the 0.05 mm grid, keep two decimals (0.35 stays 0.35, not 0.35000000000000003). */
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

const isCorner = (v: unknown): v is SpiralCorner => (SPIRAL_CORNERS as readonly unknown[]).includes(v)
const bool = (v: unknown): boolean => v === true
const objectOr = <T>(v: unknown): Partial<T> => (typeof v === 'object' && v !== null ? (v as Partial<T>) : {})

export function sanitizeLines(lines: LineSettings): LineSettings {
  const grid = objectOr<GridLines>(lines.grid)
  const spiral = objectOr<SpiralLines>(lines.spiral)
  const style = objectOr<LineStyle>(lines.style)
  return {
    grid: {
      on: bool(grid.on),
      cols: clampInt(grid.cols, MIN_GRID, MAX_GRID, D.grid.cols),
      rows: clampInt(grid.rows, MIN_GRID, MAX_GRID, D.grid.rows),
    },
    thirds: bool(lines.thirds),
    armature: bool(lines.armature),
    golden: bool(lines.golden),
    spiral: { on: bool(spiral.on), corner: isCorner(spiral.corner) ? spiral.corner : D.spiral.corner },
    centre: bool(lines.centre),
    style: {
      colour: colourOf(style.colour),
      widthMm: widthOf(style.widthMm),
      opacityPct: clampInt(style.opacityPct, MIN_LINE_OPACITY_PCT, MAX_LINE_OPACITY_PCT, D.style.opacityPct),
    },
  }
}

export function activeLineTypes(lines: LineSettings): readonly CompositionLineType[] {
  const on: Record<CompositionLineType, boolean> = {
    grid: lines.grid.on, thirds: lines.thirds, armature: lines.armature,
    golden: lines.golden, spiral: lines.spiral.on, centre: lines.centre,
  }
  return COMPOSITION_LINE_TYPES.filter((t) => on[t])
}

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
```

Every type has its own code, the types are listed in canonical order and the parameters of types that are off never appear, so the key is injective over settings that print (the property test). `linesEqual` compares every field; `patchLines` merges `grid`, `spiral`, `style` one level deep, ignoring `undefined` values (as `patchStudy`), then sanitizes; `withoutLineTypes` sets every `on`/boolean to false.

Run the test → PASS.

- [ ] **Step 4: `ImageDescriptor.lines`.** Add the field to `image.ts` (import type `LineSettings`), `lines: DEFAULT_LINES` in `loadOne`, `lines: img.lines` in `selectImageDescriptors` (and the memo's equality, if it compares fields), and `lines: DEFAULT_LINES` in every builder from `git grep -n "study:" -- 'src/**/*.ts' 'src/**/*.tsx'` (paste the list in the PR). `corepack pnpm typecheck` must be clean; no snapshot may change (`corepack pnpm test` → all green, 0 snapshots updated).

- [ ] **Step 5: `src/features/lines/types.ts`** — the overview's `PathCmd`, `FrameSize`, `FramePath` (types only), and `index.ts`:

```ts
// --- types (A1) ---
export type { FramePath, FrameSize, PathCmd } from './types'
// --- geometry (A2) ---
// --- spiral (A3) ---
// --- composition (C1) ---
// --- components (D1) ---
```

- [ ] **Step 6: i18n and coverage.** `src/locales/en/lines.json`:

```json
{
  "type": {
    "grid": "Grid",
    "thirds": "Rule of thirds",
    "armature": "Diagonals & armature",
    "golden": "Golden ratio",
    "spiral": "Golden spiral",
    "centre": "Centre lines"
  },
  "corner": {
    "topLeft": "Top left",
    "topRight": "Top right",
    "bottomLeft": "Bottom left",
    "bottomRight": "Bottom right"
  }
}
```

Add `'lines'` to `NAMESPACES` (`locales.test.ts` requires it, as M2 A-CR1). Add `'src/features/lines/**'` and `'src/shared/model/lines.ts'` to the coverage `include`.

- [ ] **Step 7: Verify** the full pre-PR command (`E2E_PORT=5001`). Open the PR.

**How each rule is tested (reviewer mutates each once):** clamp bounds (grid 0/21, opacity 9/101, width 0.05/2.05), the 0.05 rounding, hex lowercasing and fallback, corner fallback, `bool` strictness (`'yes'` is not on), `linesKey` `'-'` rule and injectivity, canonical order in `activeLineTypes`, `withoutLineTypes` keeping style.

---

### Task A2: Straight composition lines and the frame mapping

**Branch:** `feat/lines-geometry` · **PR title:** `feat(lines): add straight composition-line geometry and frame mapping` · **Depends on:** A1

**Files:** Create `src/features/lines/geometry.ts`, `geometry.test.ts`, `place.ts`, `place.test.ts`, `test-support/paths.ts` (helpers: `points(cmds)` → every end and control point; `segments(cmds)`); modify `src/features/lines/index.ts` (section A2).

- [ ] **Step 1: Worktree** `.worktrees/m3-a2`.

- [ ] **Step 2: Failing tests** (`geometry.test.ts`, excerpts; write all of them):

```ts
const frame = { w: 300, h: 400 }
const verticalXs = (cmds: readonly PathCmd[]) =>
  segments(cmds).filter((s) => s.x1 === s.x2).map((s) => s.x1)
const horizontalYs = (cmds: readonly PathCmd[]) =>
  segments(cmds).filter((s) => s.y1 === s.y2).map((s) => s.y1)

it('puts the thirds at exactly 1/3 and 2/3 (spec §7)', () => {
  expect(verticalXs(thirdsPaths(frame))).toEqual([100, 200])
  expect(horizontalYs(thirdsPaths(frame))).toEqual([400 / 3, 800 / 3])
})
it('puts the golden lines at 1/φ² and 1/φ, as the mockup (114.6 / 185.4 of 300)', () => {
  const xs = verticalXs(goldenPaths(frame))
  expect(xs[0]).toBeCloseTo(114.59, 2)
  expect(xs[1]).toBeCloseTo(185.41, 2)
  expect(horizontalYs(goldenPaths(frame))[1]).toBeCloseTo(247.21, 2)
})
it('draws cols − 1 and rows − 1 interior grid lines, none on the edges', () => {
  expect(verticalXs(gridPaths(4, 5, frame))).toEqual([75, 150, 225])
  expect(horizontalYs(gridPaths(4, 5, frame))).toEqual([80, 160, 240, 320])
  expect(gridPaths(1, 1, frame)).toEqual([])
})
it('a 3 × 3 grid equals the thirds (no deduplication)', () => {
  expect(gridPaths(3, 3, frame)).toEqual(thirdsPaths(frame))
})
it('draws the armature: 2 diagonals, 8 corner lines to the far midpoints, the rhombus', () => {
  const a = armaturePaths(frame)
  expect(a).toHaveLength(25) // 10 × (M + L) + rhombus M + 4 L
  expect(a.slice(20)).toEqual([
    { op: 'M', x: 150, y: 0 }, { op: 'L', x: 300, y: 200 }, { op: 'L', x: 150, y: 400 },
    { op: 'L', x: 0, y: 200 }, { op: 'L', x: 150, y: 0 },
  ])
})
it('the armature is symmetric under both mirrors', () => {
  fc.assert(fc.property(dim, dim, (w, h) => {
    const key = (s: Seg) => [s.x1, s.y1, s.x2, s.y2].map((n) => n.toFixed(6)).join()
    const segs = segments(armaturePaths({ w, h }))
    const set = new Set(segs.flatMap((s) => [key(s), key({ x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 })]))
    for (const s of segs) expect(set.has(key({ x1: w - s.x1, y1: s.y1, x2: w - s.x2, y2: s.y2 }))).toBe(true)
  }))
})
it('every point is inside the frame', () => {
  fc.assert(fc.property(dim, dim, fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 }), (w, h, c, r) => {
    for (const cmds of [gridPaths(c, r, { w, h }), thirdsPaths({ w, h }), armaturePaths({ w, h }), goldenPaths({ w, h }), centrePaths({ w, h })])
      for (const p of points(cmds)) {
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(w)
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(h)
      }
  }))
})
it('every subpath starts with M', () => { /* for each generator: cmds[0].op === 'M', and M/L alternate except the rhombus */ })
it('dashes the centre lines 6 : 4 times the width, floored', () => {
  expect(centreDashMm(0.35)[0]).toBeCloseTo(2.1, 9)
  expect(centreDashMm(0.35)[1]).toBeCloseTo(1.4, 9)
  expect(centreDashMm(0.1)).toEqual([1.5, 1])
})
// dim = fc.double({ min: 1, max: 1000, noNaN: true })
```

`place.test.ts`:

```ts
const trim = { x: 10, y: 20, w: 40, h: 30 }
it('frameOf swaps the sides when turned', () => {
  expect(frameOf(trim, false)).toEqual({ w: 40, h: 30 })
  expect(frameOf(trim, true)).toEqual({ w: 30, h: 40 })
})
it('not turned is a translation', () => {
  expect(frameToPage({ op: 'L', x: 5, y: 7 }, trim, false)).toEqual({ op: 'L', x: 15, y: 27 })
})
it("turned maps the frame's corners clockwise onto the trim", () => {
  const at = (x: number, y: number) => frameToPage({ op: 'M', x, y }, trim, true)
  expect(at(0, 0)).toEqual({ op: 'M', x: 50, y: 20 }) // frame TL → trim TR
  expect(at(30, 0)).toEqual({ op: 'M', x: 50, y: 50 }) // frame TR → trim BR
  expect(at(30, 40)).toEqual({ op: 'M', x: 10, y: 50 }) // frame BR → trim BL
  expect(at(0, 40)).toEqual({ op: 'M', x: 10, y: 20 }) // frame BL → trim TL
})
it('maps Bézier control points with the same map', () => { /* a 'C' maps each pair like an 'M' */ })
it('keeps points inside the frame inside the trim (property), and is invertible', () => { /* fc over trims and points */ })
```

RED run → paste.

- [ ] **Step 3: Implement** (the code below was run in a scratch copy: the asserted values above hold, `armaturePaths` has 25 commands, a 20 × 20 grid 76):

```ts
// geometry.ts
import type { Mm } from '../../shared/model/units'
import type { FrameSize, PathCmd } from './types'

export const PHI = (1 + Math.sqrt(5)) / 2
/** M3-R11: 1/φ² ≈ 0.382 and 1/φ ≈ 0.618 of each side. */
export const GOLDEN_FRACTIONS: readonly [number, number] = [1 / (PHI * PHI), 1 / PHI]

const seg = (x1: Mm, y1: Mm, x2: Mm, y2: Mm): PathCmd[] => [
  { op: 'M', x: x1, y: y1 },
  { op: 'L', x: x2, y: y2 },
]
const verticals = (xs: readonly Mm[], h: Mm): PathCmd[] => xs.flatMap((x) => seg(x, 0, x, h))
const horizontals = (ys: readonly Mm[], w: Mm): PathCmd[] => ys.flatMap((y) => seg(0, y, w, y))
const interior = (n: number): number[] => Array.from({ length: Math.max(0, n - 1) }, (_, i) => (i + 1) / n)

/** M3-R13. */
export function gridPaths(cols: number, rows: number, { w, h }: FrameSize): PathCmd[] {
  return [
    ...verticals(interior(cols).map((f) => f * w), h),
    ...horizontals(interior(rows).map((f) => f * h), w),
  ]
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
/** M3-R12 (owner Q1, default). Order is part of the contract (overview). */
export function armaturePaths({ w, h }: FrameSize): PathCmd[] {
  const mx = w / 2
  const my = h / 2
  return [
    ...seg(0, 0, w, h), ...seg(w, 0, 0, h),
    ...seg(0, 0, w, my), ...seg(0, 0, mx, h),
    ...seg(w, 0, 0, my), ...seg(w, 0, mx, h),
    ...seg(0, h, w, my), ...seg(0, h, mx, 0),
    ...seg(w, h, 0, my), ...seg(w, h, mx, 0),
    { op: 'M', x: mx, y: 0 }, { op: 'L', x: w, y: my }, { op: 'L', x: mx, y: h },
    { op: 'L', x: 0, y: my }, { op: 'L', x: mx, y: 0 },
  ]
}
/** M3-R14: the mockup's 6 : 4 dash, floored so thin lines still read as dashed. */
export function centreDashMm(widthMm: Mm): readonly [Mm, Mm] {
  return [Math.max(1.5, 6 * widthMm), Math.max(1, 4 * widthMm)]
}

// place.ts
import type { RectMm } from '../layout/types'
import type { FrameSize, PathCmd } from './types'

/** M3-R3: the picture as edited; its sides swap when the engine turned the item. */
export function frameOf(trim: RectMm, turned: boolean): FrameSize {
  return turned ? { w: trim.h, h: trim.w } : { w: trim.w, h: trim.h }
}
/** M3-R3: translate, or rotate 90° clockwise (as combineRotation) into the trim. Affine, so Béziers stay exact. */
export function frameToPage(cmd: PathCmd, trim: RectMm, turned: boolean): PathCmd {
  const at = (u: number, v: number): [number, number] =>
    turned ? [trim.x + trim.w - v, trim.y + u] : [trim.x + u, trim.y + v]
  if (cmd.op === 'C') {
    const [x1, y1] = at(cmd.x1, cmd.y1)
    const [x2, y2] = at(cmd.x2, cmd.y2)
    const [x, y] = at(cmd.x, cmd.y)
    return { op: 'C', x1, y1, x2, y2, x, y }
  }
  const [x, y] = at(cmd.x, cmd.y)
  return { op: cmd.op, x, y }
}
```

`features/lines` may import the `RectMm` type from `layout/types` (type-only; the render feature already does). Append the exports to the barrel's A2 section. Tests → PASS; coverage of both files 100%.

- [ ] **Step 4: Verify** (pre-PR command). Open the PR.

**How each rule is tested:** thirds/golden positions; grid count and edges (`interior` off by one); armature order, count and symmetry (drop a corner line → symmetry fails); frame swap; turn direction (counter-clockwise → corners test fails; mirror → fails); Bézier mapping of control points.

---

### Task A3: The golden spiral

**Branch:** `feat/lines-spiral` · **PR title:** `feat(lines): add the golden spiral` · **Depends on:** A1

**Files:** Create `src/features/lines/spiral.ts`, `spiral.test.ts`; modify `index.ts` (section A3).

**Construction (M3-R10, normative).** In the canonical portrait golden rectangle `[0, 1] × [0, φ]` (y down), start at the top-right corner `(1, 0)`. Repeat `SPIRAL_ARCS = 12` times on the remaining rectangle `(x, y, w, h)` with `s = min(w, h)`, cycling through four cases: (0) cut the square on **top**, arc from `(x+s, y)` to `(x, y+s)` around `(x+s, y+s)`; (1) square on the **left**, arc `(x, y)` → `(x+s, y+h)` around `(x+s, y)`; (2) square at the **bottom**, arc `(x, y+h)` → `(x+s, y+h−s)` around `(x, y+h−s)`; (3) square on the **right**, arc `(x+w, y+h)` → `(x+w−s, y)` around `(x+w−s, y+h)`. Each quarter arc from `C + u` to `C + v` is the cubic `C+u, C+u+κv, C+v+κu, C+v`. Then map to the frame: portrait frames (`h > w`) scale `(x·w, y·h/φ)`; landscape and square frames transpose first, `(y·w/φ, x·h)` (the canonical start then sits bottom left). Finally mirror x and/or y so the start lands on the chosen corner. The result leaves the corner along the short edge (owner Q3, default).

- [ ] **Step 1: Worktree** `.worktrees/m3-a3`.

- [ ] **Step 2: Failing tests** (`spiral.test.ts`):

```ts
const ends = (cmds: readonly PathCmd[]) => cmds.map((c) => [c.x, c.y])
it('reproduces the mockup spiral for a 300 × 400 frame starting top right', () => {
  const e = ends(goldenSpiral('topRight', { w: 300, h: 400 })).slice(0, 6)
  const want = [[300, 0], [0, 247.2], [185.4, 400], [300, 305.6], [229.2, 247.2], [185.4, 283.3]]
  e.forEach(([x, y], i) => {
    expect(x).toBeCloseTo(want[i]?.[0] ?? NaN, 1)
    expect(y).toBeCloseTo(want[i]?.[1] ?? NaN, 1)
  })
})
it('starts with M at the chosen corner and then has 12 cubic arcs', () => {
  for (const corner of SPIRAL_CORNERS) {
    const s = goldenSpiral(corner, { w: 300, h: 400 })
    expect(s[0]?.op).toBe('M')
    expect(s.slice(1).every((c) => c.op === 'C')).toBe(true)
    expect(s).toHaveLength(1 + SPIRAL_ARCS)
  }
  expect(ends(goldenSpiral('bottomLeft', { w: 300, h: 400 }))[0]).toEqual([0, 400])
})
it('leaves the corner along the short edge', () => {
  const portrait = goldenSpiral('topLeft', { w: 300, h: 400 })[1] // first control point on the top edge
  expect(portrait?.op === 'C' && portrait.y1).toBe(0)
  const landscape = goldenSpiral('topLeft', { w: 400, h: 300 })[1] // on the left edge
  expect(landscape?.op === 'C' && landscape.x1).toBe(0)
})
it('a square frame uses the landscape construction', () => { /* first control point on the left edge for topLeft */ })
it('is tangent-continuous: each arc starts where the last ended, tangents parallel', () => { /* (P3 − C2) ∥ (C1' − P0') */ })
it('shrinks every arc by 1/φ (canonical frame 1 × φ)', () => { /* chord lengths ratio ≈ 1/φ ± 1e-9 */ })
it('the four corners are mirror images', () => { /* topRight = mirror x of topLeft, etc., for random frames */ })
it('stays inside the frame: every end and control point (convex hull ⇒ the curve)', () => {
  fc.assert(fc.property(dim, dim, fc.constantFrom(...SPIRAL_CORNERS), (w, h, corner) => {
    for (const p of points(goldenSpiral(corner, { w, h }))) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9); expect(p.x).toBeLessThanOrEqual(w + 1e-9)
      expect(p.y).toBeGreaterThanOrEqual(-1e-9); expect(p.y).toBeLessThanOrEqual(h + 1e-9)
    }
  }))
})
it('a cubic quarter arc stays within 0.03% of the circle', () => { /* sample 1000 t on quarter(0,0,1,0,0,1): | |B(t)| − 1 | < 3e-4 (measured 2.73e-4) */ })
```

RED run → paste.

- [ ] **Step 3: Implement** (run in a scratch copy: the mockup end points above, all corners inside for 300 × 400, 400 × 300 and 200 × 200, radial error 2.73e-4):

```ts
import type { SpiralCorner } from '../../shared/model/lines'
import type { FrameSize, PathCmd } from './types'

const PHI = (1 + Math.sqrt(5)) / 2
export const KAPPA = (4 / 3) * (Math.SQRT2 - 1)
export const SPIRAL_ARCS = 12

/** Quarter arc from C + u to C + v (u ⊥ v, |u| = |v|) as one cubic Bézier. */
function quarter(cx: number, cy: number, ux: number, uy: number, vx: number, vy: number): PathCmd {
  return {
    op: 'C',
    x1: cx + ux + KAPPA * vx, y1: cy + uy + KAPPA * vy,
    x2: cx + vx + KAPPA * ux, y2: cy + vy + KAPPA * uy,
    x: cx + vx, y: cy + vy,
  }
}

/** Portrait golden rectangle [0,1] × [0,φ], y down, from the top-right corner along the top edge. */
function canonicalSpiral(): PathCmd[] {
  let x = 0, y = 0, w = 1, h = PHI
  const cmds: PathCmd[] = [{ op: 'M', x: 1, y: 0 }]
  for (let k = 0; k < SPIRAL_ARCS; k++) {
    const s = Math.min(w, h)
    switch (k % 4) {
      case 0: cmds.push(quarter(x + s, y + s, 0, -s, -s, 0)); y += s; h -= s; break
      case 1: cmds.push(quarter(x + s, y, -s, 0, 0, s)); x += s; w -= s; break
      case 2: cmds.push(quarter(x, y + h - s, 0, s, s, 0)); h -= s; break
      default: cmds.push(quarter(x + w - s, y + h, s, 0, 0, -s)); w -= s; break
    }
  }
  return cmds
}

export function goldenSpiral(corner: SpiralCorner, { w, h }: FrameSize): PathCmd[] {
  const portrait = h > w // a square is landscape (M3-R10)
  const right = corner === 'topRight' || corner === 'bottomRight'
  const bottom = corner === 'bottomLeft' || corner === 'bottomRight'
  const map = (cx: number, cy: number): [number, number] => {
    // portrait: canonical start = top right; landscape: transposed, start = bottom left
    let px = portrait ? cx * w : (cy / PHI) * w
    let py = portrait ? (cy / PHI) * h : cx * h
    if (portrait !== right) px = w - px
    if (!portrait !== bottom) py = h - py
    return [px, py]
  }
  return canonicalSpiral().map((c) => {
    if (c.op !== 'C') {
      const [x, y] = map(c.x, c.y)
      return { op: c.op, x, y }
    }
    const [x1, y1] = map(c.x1, c.y1)
    const [x2, y2] = map(c.x2, c.y2)
    const [x, y] = map(c.x, c.y)
    return { op: 'C', x1, y1, x2, y2, x, y }
  })
}
```

Note: A2 and A3 run in parallel and both need φ, so A3 keeps its own module-private `PHI` and imports nothing from `geometry.ts` (F's review may fold the two into A2's export). Write the `switch` with one statement per line (Prettier). Tests → PASS.

- [ ] **Step 4: Verify** (pre-PR command). Open the PR.

**How each rule is tested:** the mockup end points (swap a case's centre → fails), the short-edge start (swap the transpose → fails), the mirrors per corner, the 1/φ shrink, KAPPA (use 0.5 → radial error test fails), the arc count, the in-frame property.

---

## Self-review

- Every contract item of the overview's A blocks is produced by exactly one task: A1 (`lines.ts`, `image.ts`, `types.ts`), A2 (`geometry.ts`, `place.ts`), A3 (`spiral.ts`).
- The spec §7 line tests ("thirds at 1/3 and 2/3, spiral within bounds") are A2's first test and A3's last property test.
- The numbers quoted (mockup spiral end points, golden lines, 25 armature commands, 76 grid commands, κ error 2.73e-4, the sanitizer example) come from a scratch run of the code above in node 24.

## Contract change requests

_(none)_

## Open questions for the owner

None new. A implements the defaults of overview Q1 (armature), Q2 and Q3 (spiral), Q6 (defaults and ranges); a different answer changes `armaturePaths`, `goldenSpiral` or `DEFAULT_LINES` before the task starts.
