# M2-A: Studies Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure core of image studies: the study settings model (`src/shared/model/study.ts`) and the `ImageDescriptor.study` field, OKLCH colour maths (`src/shared/colour/oklch.ts`), a size-relative Gaussian blur, the single-hue value ramp, posterisation over perceptual lightness, and `applyStudy` / `applyStudyToContext`, which the export worker (B5) and the preview studies worker (C2) both call. Everything is plain TypeScript with no DOM, tested in node with example, property, golden and performance tests.

**Architecture:** A study is described per image by `StudySettings` (versions, blur %, values). Each printed tile resolves to a `TileStudy` (`null` for the original). Pixel work happens **in place** on the tile's `Uint8ClampedArray` (RGBA, straight alpha, alpha always 255 after M1's flatten-on-white): a Gaussian blur approximated by three box passes per axis with running sums (O(w·h) time, one line buffer), then posterisation, which measures each pixel's OKLab lightness, finds the tile's lightness range from a 1024-bin histogram with 1% clipped at each end, splits it into N equal steps and replaces each pixel with the matching colour of an OKLCH ramp built from one hue (L 0.20 → 0.95, chroma clamped into the sRGB gamut). `applyStudyToContext` is the canvas step that `renderTile` calls after the oriented draw and before the bleed is extended.

**Tech Stack:** TypeScript 6 (strict, `noUncheckedIndexedAccess`), Vitest 5 (`unit` project, node), fast-check 4. No new dependencies (M2-R17).

**Spec:** `docs/spec.md` §2.6 (Image studies), §2.5 (PNG for value studies), §3, §4 (pure core), §7 (studies tests: blur keeps the average brightness, values output exactly N distinct colours, the ramp is monotonic) **and** `docs/superpowers/plans/2026-10-07-m2-overview.md` (rulings M2-R1, R4–R10, R17; Shared contracts → `study.ts`, `image.ts`, `oklch.ts`, `studies/` pure maths; Memory budgets; Performance budgets; Testing strategy). Owner decisions D8 (swatches), D9 (ramp L ≈ 0.20 → 0.95), R7 (lightest is a tint, never paper).

**Prerequisite:** M1 is released (`v0.1.0`). Nothing else. A1 merges before anything else in M2; A2 can start at the same time as A1.

## Global Constraints

From the overview, "Global constraints for every M2 sub-plan":

- Follow `CLAUDE.md`: one worktree (`.worktrees/<name>`), branch and PR per task, Conventional Commit PR titles (the table below), squash. Implementers open PRs and never merge; the controller enables auto-merge after a clean review.
- Before every PR: `corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test && corepack pnpm e2e --project=chromium` (A has no E2E of its own; run the existing suite once in A1, which touches the images store, with `E2E_PORT=4601`).
- TypeScript strict and `noUncheckedIndexedAccess`; no `any`; no non-null assertions (use an `at()` helper that throws, or `?? 0` where a default is meaningful).
- **Pure core:** `src/shared/model/study.ts`, `src/shared/colour/**` and `src/features/studies/{blur,ramp,posterize,apply-study}.ts` have **no DOM access** and run in the `unit` (node) project. `apply-study.ts` imports `PixelCtx` and `TilePixelPlan` from `render/pixels` **as types only** (`import type`).
- **Memory (M2-R10):** no allocation proportional to the pixel count inside `gaussianBlurRGBA`, `posterizeRGBA` or `applyStudy`. Extra memory is one line buffer O(max(w, h)) and a 1024-bin histogram. Pinned by A5's allocation-spy test.
- **Privacy:** these functions see pixels only; they persist nothing and send nothing.
- **i18n:** A1 creates `src/locales/en/studies.json` with the four `version.*` keys only (D1 owns the rest). No `.tsx` in A.
- **TDD:** every module is test-first; record the RED run (failing test output) in the PR description.
- **Mutation-checked review:** the reviewer breaks each invariant listed in "How each rule is tested" once and confirms a test fails.
- **No dependency or config changes** except A1's coverage `include` in `vite.config.ts` and A1's `NAMESPACES` entry (see "Contract change requests").
- Prettier: `semi: false`, `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`. ESLint `strictTypeChecked` + `stylisticTypeChecked`, zero warnings.

Contract items this plan **consumes** (from M1, unchanged):

```ts
// src/shared/model/image.ts (M1)
export interface ImageDescriptor { id; contentHash; pxW; pxH; edits: ImageEdits }
// src/features/render/pixels/bleed.ts (M1)
export interface PixelCtx {
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData
  createImageData(sw: number, sh: number): ImageData
  putImageData(data: ImageData, dx: number, dy: number): void
}
// src/features/render/pixels/tile-plan.ts (M1)
export interface TilePixelPlan { src; scaledW; scaledH; outW; outH; bleedPx; canvasW; canvasH; matrix; dpi }
```

Contract items this plan **produces** (verbatim from the overview's "Shared contracts"):

```ts
// src/shared/model/study.ts (A1)
export const STUDY_VERSIONS = ['original', 'blurred', 'values', 'blurValues'] as const
export type StudyVersion = (typeof STUDY_VERSIONS)[number]
export interface StudyValues { readonly count: number; readonly hue: number; readonly neutral: boolean }
export interface StudySettings {
  readonly versions: readonly StudyVersion[]
  readonly blurPct: number
  readonly values: StudyValues
}
export const MIN_BLUR_PCT = 1
export const MAX_BLUR_PCT = 100
export const MIN_VALUES = 2
export const MAX_VALUES = 20
export const BLUR_SIGMA_AT_MAX = 0.05
export const DEFAULT_STUDY: StudySettings
export const HUE_PRESETS: readonly { readonly id: HuePresetId; readonly hue: number | null }[]
export function sanitizeStudy(study: StudySettings): StudySettings
export function studyEqual(a: StudySettings, b: StudySettings): boolean
export function withVersion(study: StudySettings, version: StudyVersion, on: boolean): StudySettings
export interface StudyPatch { readonly versions?; readonly blurPct?; readonly values?: Partial<StudyValues> }
export function patchStudy(study: StudySettings, patch: StudyPatch): StudySettings
export interface TileStudy { readonly blurPct: number | null; readonly values: StudyValues | null }
export function tileStudyFor(version: StudyVersion, study: StudySettings): TileStudy | null
export function studyKey(study: TileStudy | null): string
export function tileFormat(version: StudyVersion): 'jpeg' | 'png'

// src/shared/model/image.ts (A1, extended)
export interface ImageDescriptor { id; contentHash; pxW; pxH; edits; readonly study: StudySettings }

// src/shared/colour/oklch.ts (A2)
export function srgb8ToLinear(c8: number): number
export function linearToSrgb8(c: number): number
export interface Oklab { readonly L: number; readonly a: number; readonly b: number }
export function linearRgbToOklab(r: number, g: number, b: number): Oklab
export function oklabToLinearRgb(lab: Oklab): readonly [number, number, number]
export function oklchToOklab(L: number, C: number, hDeg: number): Oklab
export function lightness8(r8: number, g8: number, b8: number): number
export function inSrgbGamut(L: number, C: number, hDeg: number): boolean
export function maxChroma(L: number, hDeg: number): number
export interface Rgb8 { readonly r: number; readonly g: number; readonly b: number }
export function oklchToRgb8(L: number, C: number, hDeg: number): Rgb8

// src/features/studies/blur.ts (A3)
export function blurSigmaPx(blurPct: number, w: number, h: number): number
export function boxRadiiForGauss(sigma: number): readonly [number, number, number]
export function gaussianBlurRGBA(data: Uint8ClampedArray, w: number, h: number, sigma: number): void

// src/features/studies/ramp.ts (A4)
export const RAMP_L_DARK = 0.2
export const RAMP_L_LIGHT = 0.95
export const RAMP_GAMUT_MARGIN = 0.002
export function rampChroma(t: number): number
export function valueRamp(values: StudyValues): readonly Rgb8[]

// src/features/studies/posterize.ts (A4)
export interface LightnessRange { readonly lo: number; readonly hi: number }
export const LIGHTNESS_BINS = 1024
export const VALUE_CLIP = 0.01
export function lightnessRange(data: Uint8ClampedArray, w: number, h: number): LightnessRange
export function valueIndex(L: number, range: LightnessRange, count: number): number
export function posterizeRGBA(
  data: Uint8ClampedArray, w: number, h: number, ramp: readonly Rgb8[], range: LightnessRange,
): void

// src/features/studies/apply-study.ts (A5)
export function applyStudy(data: Uint8ClampedArray, w: number, h: number, study: TileStudy): void
export function applyStudyToContext(
  ctx: PixelCtx, plan: Pick<TilePixelPlan, 'bleedPx' | 'outW' | 'outH'>, study: TileStudy,
): void
```

## Review Focus

Five situations real users will hit that the contract does not spell out. Each has a pinned test.

1. **A low-key or high-key photo** (a night street, a snowy field). With the tile's own range (owner Q11, default), the darkest pixels still map to value 1 and the lightest to value N, so a 5-value study shows 5 tones, not 2. A few specular highlights must not stretch the scale: 1% is clipped at each end. Pinned in A4 (`clips the brightest and darkest 1% before splitting`, `a dark photo still uses every value`).
2. **A flat area or a nearly flat tile** (a grey wall, a tight crop of sky). Range width below 1e-6 must not divide by zero; everything maps to the middle value. Pinned in A4 (`a flat image maps to one middle value`).
3. **A tiny tile at preview resolution** (a 40 × 60 px preview tile, or a 1 px wide sliver from an extreme crop). The blur must stay finite and in bounds; σ below 0.25 px is a no-op, and 1 × h / w × 1 images work. Pinned in A3 (`handles 1-pixel-wide and 1-pixel-tall images`, `is a no-op below 0.25 px`).
4. **Blur near the tile edges.** Clamp-to-edge must not darken or lighten the border (no black or white leak from outside the tile), so with bleed the extended edge pixels look like the tile. Pinned in A3 (`keeps a constant image constant`, `never widens the range`) and B5's order test (study before bleed).
5. **Preview and PDF look the same at different resolutions.** σ is relative to the rendered tile's short side, so a 300 px preview tile and a 3000 px print tile get σ in the same proportion; posterising a resampled image gives the same number of values. Pinned in A3 (`scales with the short side, linearly in percent`) and A5 (`gives the same number of values at two resolutions`).

---

## Algorithm specification (normative)

The code in the tasks implements this section line for line. If the code and this text disagree, that is a bug.

### sRGB transfer (A2)

- Decode (8-bit → linear): `c = c8 / 255`; `lin = c ≤ 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055)^2.4`. Precomputed once into a 256-entry `Float64Array` (`SRGB_TO_LINEAR`), the only table in the module (2 KB).
- Encode (linear → 8-bit): clamp `c` to [0, 1]; `s = c ≤ 0.0031308 ? 12.92·c : 1.055·c^(1/2.4) − 0.055`; `round(s · 255)`.

### OKLab (A2) — Björn Ottosson, "A perceptual color space for image processing" (2020), sRGB D65

Linear sRGB → LMS:

```
l = 0.4122214708·r + 0.5363325363·g + 0.0514459929·b
m = 0.2119034982·r + 0.6806995451·g + 0.1073969566·b
s = 0.0883024619·r + 0.2817188376·g + 0.6299787005·b
```

Non-linearity: `l' = cbrt(l)`, `m' = cbrt(m)`, `s' = cbrt(s)` (`Math.cbrt`, defined for negatives).

LMS' → OKLab:

```
L = 0.2104542553·l' + 0.7936177850·m' − 0.0040720468·s'
a = 1.9779984951·l' − 2.4285922050·m' + 0.4505937099·s'
b = 0.0259040371·l' + 0.7827717662·m' − 0.8086757660·s'
```

Inverse, OKLab → LMS':

```
l' = L + 0.3963377774·a + 0.2158037573·b
m' = L − 0.1055613458·a − 0.0638541728·b
s' = L − 0.0894841775·a − 1.2914855480·b
```

then `l = l'³`, `m = m'³`, `s = s'³`, and LMS → linear sRGB:

```
r =  4.0767416621·l − 3.3077115913·m + 0.2309699292·s
g = −1.2684380046·l + 2.6097574011·m − 0.3413193965·s
b = −0.0041960863·l − 0.7034186147·m + 1.7076147010·s
```

OKLCH ↔ OKLab: `a = C·cos(h·π/180)`, `b = C·sin(h·π/180)`.

Reference values (from the paper's table and widely published conversions; tolerances in tests): white `#ffffff` → L = 1.0000 (±1e-4), a, b ≈ 0 (±1e-4); black → L = 0; `#ff0000` → L 0.62796, C 0.25768, h 29.23°; `#00ff00` → L 0.86644; `#0000ff` → L 0.45201.

**Gamut:** `inSrgbGamut(L, C, h)` converts to linear sRGB and returns true iff every channel is in `[−1e-6, 1 + 1e-6]`. `maxChroma(L, h)`: 0 when `L ≤ 0` or `L ≥ 1`; otherwise bisect `C` in `[0, 0.4]` for 17 iterations (0.4 / 2¹⁷ ≈ 3e-6 < 1e-5), keeping `lo` in gamut, and return `lo`.

### Blur (A3)

- **σ** (M2-R6): `blurSigmaPx(pct, w, h) = pct / 100 × BLUR_SIGMA_AT_MAX × min(w, h)`. Not clamped: callers pass sanitised percents.
- **Box radii** (Kovesi's "Fast almost-Gaussian filtering", n = 3, as popularised by Ivan Kutskir):

  ```
  wIdeal = sqrt(12·σ²/n + 1)
  wl = floor(wIdeal); if wl is even: wl = wl − 1
  wu = wl + 2
  mIdeal = (12·σ² − n·wl² − 4·n·wl − 3·n) / (−4·wl − 4)
  m = round(mIdeal)
  size_i = i < m ? wl : wu        (i = 0, 1, 2)
  radius_i = (size_i − 1) / 2
  ```

  `m` is clamped to `[0, 3]` (it can fall outside for σ < 0.8). The variance of three boxes of radius `r_i` is `Σ ((2r_i + 1)² − 1) / 12`; it is within 5% of σ² for σ ≥ 1.

- **One box pass along one line** (horizontal: a row of `w` pixels; vertical: a column of `h` pixels), radius `r`, window `d = 2r + 1`, per colour channel c ∈ {R, G, B} (alpha untouched):
  1. Copy the line's RGBA bytes into the line buffer `buf` (a `Uint8ClampedArray` of `4 · max(w, h)`, allocated once per `gaussianBlurRGBA` call). The output is written straight back into `data`.
  2. Clamp-to-edge index: `at(i) = buf[4·clamp(i, 0, n − 1) + c]`.
  3. `sum = Σ_{i = −r}^{r} at(i)` (initial window centred on 0).
  4. For `x = 0 … n − 1`: write `floor((sum + r) / d)` (round half up; `d` is odd so exact halves do not occur), then `sum += at(x + r + 1) − at(x − r)`.
  5. `r = 0` skips the pass.
- **`gaussianBlurRGBA`:** `σ < 0.25` → return. Else compute the three radii; run the 3 horizontal passes on every row, then the 3 vertical passes on every column. Time O(3 · 2 · w · h · 3) = O(w · h) regardless of σ.
- Properties: a constant image stays constant; no output value is outside `[min, max]` of the input channel; when the border ring of width ≥ `r_0 + r_1 + r_2` is constant, clamping changes nothing and the channel mean is kept up to rounding (≤ 0.5 levels).

### Ramp (A4) — M2-R8, owner D9

For `values = { count: N, hue: h, neutral }`, `k = 0 … N − 1`, `t = k / (N − 1)`:

```
L_k = RAMP_L_DARK + (RAMP_L_LIGHT − RAMP_L_DARK) · t          // 0.20 → 0.95
C_k = neutral ? 0 : max(0, min(rampChroma(t), maxChroma(L_k, h) − RAMP_GAMUT_MARGIN))
rampChroma(t) = 0.045 + 0.05 · sin(π·t) − 0.02 · t               // the approved mockup's curve
ramp[k] = oklchToRgb8(L_k, C_k, h)                                  // 8-bit sRGB, channels clamped
```

The 8-bit output's measured OKLab L is strictly increasing in `k` (consecutive L targets differ by ≥ 0.75/19 ≈ 0.039, far above 8-bit rounding near these lightnesses). The lightest colour is never `#ffffff` (L 0.95 < 1). `#ffffff` is the paper (R7).

### Lightness range and bins (A4) — M2-R7, owner Q11 default

- `lightness8(r8, g8, b8)` = OKLab L of the pixel (LUT linearisation, the LMS matrix rows, three `Math.cbrt`, the L row only).
- **Histogram:** `n = w·h` pixels; bin of a pixel = `min(BINS − 1, max(0, floor(L · BINS)))` with `BINS = LIGHTNESS_BINS = 1024`.
- **Clipped range:** `k = floor(VALUE_CLIP · n)` (1%). `loBin` = the smallest bin with cumulative count `> k`; `hiBin` = the smallest bin with cumulative count `≥ n − k`. `lo = loBin / BINS`, `hi = (hiBin + 1) / BINS`. If `hiBin = loBin` (every kept pixel in one bin: a flat tile), the range is degenerate: `lo = hi = (loBin + 0.5) / BINS`, which `valueIndex` maps to the middle value. For `n = 0`, `{ lo: 0, hi: 1 }`.
- **Value index:** `valueIndex(L, {lo, hi}, N)`: if `hi − lo < 1e-6` → `floor(N / 2)`; else `clamp(floor((L − lo) / (hi − lo) · N), 0, N − 1)`. These are N equal steps with edges at `lo + j·(hi − lo)/N`, `j = 1 … N − 1`; a pixel exactly on an edge goes to the upper value.
- **Posterise:** every pixel → `ramp[valueIndex(lightness8(px), range, ramp.length)]`, alpha set to 255.
- **Notan (N = 2):** one edge at the midpoint `(lo + hi) / 2`.

### Apply (A5)

`applyStudy(data, w, h, study)`:

1. If `study.blurPct !== null`: `gaussianBlurRGBA(data, w, h, blurSigmaPx(study.blurPct, w, h))`.
2. If `study.values !== null`: `ramp = valueRamp(study.values)`, `range = lightnessRange(data, w, h)` (measured **after** the blur), `posterizeRGBA(data, w, h, ramp, range)`.

`applyStudyToContext(ctx, plan, study)`: `img = ctx.getImageData(plan.bleedPx, plan.bleedPx, plan.outW, plan.outH)`; `applyStudy(img.data, plan.outW, plan.outH, study)`; `ctx.putImageData(img, plan.bleedPx, plan.bleedPx)`. The `getImageData` copy is the one tile-sized allocation, owned by the canvas step (overview "Memory budgets", export row).

### How each rule is tested

| Rule | Test (file → name) | Mutation the reviewer tries |
|---|---|---|
| sRGB transfer both ways | `oklch.test.ts` → `round-trips every 8-bit level` | swap 0.04045/0.0031308 thresholds |
| OKLab matrices | `oklch.test.ts` → `matches the reference values` | change one coefficient's 3rd decimal |
| Gamut bisection | `oklch.test.ts` → `maxChroma is in gamut and 1e-3 more is not` | return `hi` instead of `lo` |
| `lightness8` = full conversion | `oklch.test.ts` → `lightness8 equals linearRgbToOklab L` | drop the LUT (use c8/255) |
| σ scaling | `blur.test.ts` → `scales with the short side, linearly in percent` | use `max(w, h)` |
| Box radii ≈ σ | `blur.test.ts` → `three boxes approximate the Gaussian variance` | drop the even-width correction |
| Clamp-to-edge | `blur.test.ts` → `keeps a constant image constant`, `never widens the range` | treat outside pixels as 0 |
| Mean kept (spec §7) | `blur.test.ts` → `keeps the average brightness` | round down (`floor(sum/d)`) |
| Alpha untouched | `blur.test.ts` → `never touches alpha` | loop c to 4 |
| Ramp monotonic (spec §7) | `ramp.test.ts` → `is strictly increasing in measured lightness` | reverse `t` |
| Ramp end points (D9) | `ramp.test.ts` → `runs from L 0.20 to L 0.95` | `RAMP_L_LIGHT = 1` |
| Never paper (R7) | `ramp.test.ts` → `is never white, for every hue` | `RAMP_L_LIGHT = 1` |
| In gamut | `ramp.test.ts` → `every colour is in gamut` | remove the `maxChroma` clamp |
| Hue kept / neutral | `ramp.test.ts` → `keeps the hue`, `neutral is grey` | ignore `neutral` |
| N equal steps | `posterize.test.ts` → `puts each edge at lo + j(hi − lo)/N` | `round` instead of `floor` |
| Exactly N colours (spec §7) | `posterize.test.ts` → `outputs exactly N ramp colours on a full gradient` | clamp to `N − 2` |
| Notan | `posterize.test.ts` → `two values split at the midpoint` | — |
| Clipping | `posterize.test.ts` → `clips the brightest and darkest 1% before splitting` | `VALUE_CLIP = 0` |
| Flat image | `posterize.test.ts` → `a flat image maps to one middle value` | remove the 1e-6 guard (NaN) |
| Blur before posterise | `apply-study.test.ts` → `blurs first, then posterises` | swap the two steps |
| In place, no big allocation | `apply-study.test.ts` → `allocates nothing proportional to the pixels` | allocate a Float32Array copy |
| Canvas step region | `apply-study.test.ts` → `processes only the image area inside the bleed` | read from (0, 0) |
| Golden outputs | `golden.test.ts` → `study outputs` | any of the above |
| Performance | `perf.test.ts` → `blur + values on a 1 MP tile` | — |

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `src/shared/model/study.ts` (+ `study.test.ts`) | A1 | Study types, constants, defaults, presets, sanitise/patch/withVersion, `tileStudyFor`, `studyKey`, `tileFormat` |
| `src/shared/model/image.ts` | A1 | `ImageDescriptor.study` field |
| `src/features/images/store.ts` | A1 | `study: DEFAULT_STUDY` on import; `study` in `selectImageDescriptors` |
| test builders (list in A1) | A1 | add `study: DEFAULT_STUDY` |
| `src/shared/i18n/languages.ts` | A1 | add `'studies'` to `NAMESPACES` |
| `src/locales/en/studies.json` | A1 | `version.*` keys only |
| `vite.config.ts` | A1 | coverage `include` += `src/features/studies/**`, `src/shared/colour/**` |
| `src/features/studies/index.ts` | A1 (create), A3–A5 (append in their section) | Barrel |
| `src/shared/colour/oklch.ts` (+ test) | A2 | sRGB transfer, OKLab/OKLCH, gamut, `lightness8` |
| `src/features/studies/blur.ts` (+ test) | A3 | `blurSigmaPx`, `boxRadiiForGauss`, `gaussianBlurRGBA` |
| `src/features/studies/test-support/pixels.ts` | A3 | Synthetic RGBA builders, `mulberry32`, channel stats |
| `src/features/studies/test-support/lightness.ts` | A4 | Lightness-ramp image builder, distinct-colour counter |
| `src/features/studies/ramp.ts` (+ test) | A4 | `rampChroma`, `valueRamp` |
| `src/features/studies/posterize.ts` (+ test) | A4 | `lightnessRange`, `valueIndex`, `posterizeRGBA` |
| `src/features/studies/apply-study.ts` (+ test) | A5 | `applyStudy`, `applyStudyToContext` |
| `src/features/studies/golden.test.ts` (+ `__snapshots__/`) | A5 | FNV-1a hashes of 4 images × 4 versions |
| `src/features/studies/perf.test.ts` | A5 | Node performance bound |

`test-support/**` is excluded from coverage (M1 ruling B-1).

## Parallelization

```
A1 (model, descriptor field, barrel, coverage) ──┬──> A3 (blur) ─────────────┐
                                                  │                           ├──> A5 (apply, golden, perf)
A2 (OKLCH, no deps) ──────────────────────────────┴──> A4 (ramp, posterize) ──┘
```

- **A1 ‖ A2** start together. A2 touches only `src/shared/colour/**` (new); its coverage is counted once A1's `include` lands (until then the file is simply not in the gate).
- **A3** needs A1 (`BLUR_SIGMA_AT_MAX`, the barrel). It runs in parallel with A2/A4 and with every B task, C1.
- **A4** needs A1 (`StudyValues`) and A2 (`oklchToRgb8`, `maxChroma`, `lightness8`).
- **A5** needs A3 and A4.
- Shared files: `src/features/studies/index.ts` — each task appends one line in the `// --- maths (A3–A5) ---` section; A3 and A4 may run at the same time, so the second to merge resolves a one-line conflict. Test helpers are split by owner so A3 and A4 never edit the same helper file: A3 owns `test-support/pixels.ts` (builders, `mulberry32`, channel stats); A4 owns `test-support/lightness.ts` (lightness-ramp image, distinct colours). A5 imports both and edits neither.

---

### Task A1: Study settings model, `ImageDescriptor.study`, barrel and coverage

**Branch:** `feat/studies-model` · **PR title:** `feat(studies): add the study settings model` · **Depends on:** — (merge first) · **E2E port:** 4601

This task lands the binding model every other M2 task imports, gives every image `study: DEFAULT_STUDY` (so nothing changes in behaviour: all images are "Original only"), and opens the `studies` feature: barrel, locale namespace, coverage gate.

**Files:**
- Create: `src/shared/model/study.ts`, `src/shared/model/study.test.ts`, `src/features/studies/index.ts`, `src/locales/en/studies.json`
- Modify: `src/shared/model/image.ts` (field), `src/features/images/store.ts` (import default, descriptor memo), `src/shared/i18n/languages.ts` (`NAMESPACES`), `vite.config.ts` (coverage `include`)
- Modify (test builders that construct an `ImageDescriptor` or `LoadedImage` literal — found with `grep -rln contentHash src`, 2026-10-07):
  - `src/shared/model/image.test.ts` (`make`)
  - `src/features/layout/build-items.test.ts` (`img`)
  - `src/features/render/test-support/fixtures.ts` (`descriptor`)
  - `src/features/images/test-utils.tsx` (`makeLoadedImage`)
  - `src/features/images/store.test.ts` (descriptor-keys assertion, line ~571: add `'study'`)
  - `src/app/pipeline.test.ts` (`img`)
  - `src/app/effects/PipelineEffect.test.tsx` (the inline `LoadedImage`)
  - Re-run the grep after editing; `corepack pnpm typecheck` finds any literal the grep missed (a missing required field is a type error).

**Interfaces:**
- Consumes: `ImageDescriptor` (M1).
- Produces: everything listed for `study.ts` and `image.ts` in "Contract items this plan produces", plus `HuePresetId`.

- [ ] **Step 1: Create the worktree**

```bash
git worktree add .worktrees/studies-model -b feat/studies-model origin/master
cd .worktrees/studies-model && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Write the failing model tests**

`src/shared/model/study.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDY,
  HUE_PRESETS,
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
  STUDY_VERSIONS,
  patchStudy,
  sanitizeStudy,
  studyEqual,
  studyKey,
  tileFormat,
  tileStudyFor,
  withVersion,
  type StudySettings,
  type StudyVersion,
  type TileStudy,
} from './study'

const arbVersion = fc.constantFrom<StudyVersion>(...STUDY_VERSIONS)
/** Anything a corrupted store or a careless caller could hand us. */
const arbRawStudy: fc.Arbitrary<StudySettings> = fc.record({
  versions: fc.array(fc.oneof(arbVersion, fc.string() as fc.Arbitrary<StudyVersion>), {
    maxLength: 6,
  }),
  blurPct: fc.oneof(fc.double(), fc.integer({ min: -50, max: 500 })),
  values: fc.record({
    count: fc.oneof(fc.double(), fc.integer({ min: -5, max: 50 })),
    hue: fc.oneof(fc.double(), fc.integer({ min: -1000, max: 1000 })),
    neutral: fc.boolean(),
  }),
})

describe('DEFAULT_STUDY (owner Q1–Q4, default)', () => {
  it('is Original only, 40% blur, 5 values, sepia', () => {
    expect(DEFAULT_STUDY).toEqual({
      versions: ['original'],
      blurPct: 40,
      values: { count: 5, hue: 55, neutral: false },
    })
  })
  it('is already sanitized', () => {
    expect(sanitizeStudy(DEFAULT_STUDY)).toEqual(DEFAULT_STUDY)
  })
})

describe('HUE_PRESETS (D8)', () => {
  it('lists the mockup swatches in order', () => {
    expect(HUE_PRESETS.map((p) => [p.id, p.hue])).toEqual([
      ['sepia', 55],
      ['terracotta', 35],
      ['ochre', 85],
      ['sapGreen', 135],
      ['teal', 195],
      ['ultramarine', 265],
      ['violet', 305],
      ['neutral', null],
    ])
  })
})

describe('sanitizeStudy', () => {
  it('keeps versions in canonical order without duplicates', () => {
    const s = sanitizeStudy({ ...DEFAULT_STUDY, versions: ['values', 'original', 'values'] })
    expect(s.versions).toEqual(['original', 'values'])
  })
  it('falls back to Original when no version is valid', () => {
    expect(sanitizeStudy({ ...DEFAULT_STUDY, versions: [] }).versions).toEqual(['original'])
    expect(
      sanitizeStudy({ ...DEFAULT_STUDY, versions: ['bogus' as StudyVersion] }).versions,
    ).toEqual(['original'])
  })
  it('clamps and rounds blur and value count, wraps hue', () => {
    const s = sanitizeStudy({
      versions: ['blurred'],
      blurPct: 140.6,
      values: { count: 1.2, hue: -5, neutral: true },
    })
    expect(s).toEqual({ versions: ['blurred'], blurPct: 100, values: { count: 2, hue: 355, neutral: true } })
    expect(sanitizeStudy({ ...DEFAULT_STUDY, values: { count: 99, hue: 360, neutral: false } }).values).toEqual({
      count: MAX_VALUES,
      hue: 0,
      neutral: false,
    })
  })
  it('replaces non-finite numbers with the defaults', () => {
    const s = sanitizeStudy({
      versions: ['original'],
      blurPct: Number.NaN,
      values: { count: Number.POSITIVE_INFINITY, hue: Number.NaN, neutral: false },
    })
    expect(s.blurPct).toBe(DEFAULT_STUDY.blurPct)
    expect(s.values.count).toBe(DEFAULT_STUDY.values.count)
    expect(s.values.hue).toBe(DEFAULT_STUDY.values.hue)
  })
  it('is total and idempotent, and always in range (property)', () => {
    fc.assert(
      fc.property(arbRawStudy, (raw) => {
        const s = sanitizeStudy(raw)
        expect(sanitizeStudy(s)).toEqual(s)
        expect(s.versions.length).toBeGreaterThanOrEqual(1)
        expect([...s.versions]).toEqual(STUDY_VERSIONS.filter((v) => s.versions.includes(v)))
        expect(Number.isInteger(s.blurPct)).toBe(true)
        expect(s.blurPct).toBeGreaterThanOrEqual(MIN_BLUR_PCT)
        expect(s.blurPct).toBeLessThanOrEqual(MAX_BLUR_PCT)
        expect(Number.isInteger(s.values.count)).toBe(true)
        expect(s.values.count).toBeGreaterThanOrEqual(MIN_VALUES)
        expect(s.values.count).toBeLessThanOrEqual(MAX_VALUES)
        expect(s.values.hue).toBeGreaterThanOrEqual(0)
        expect(s.values.hue).toBeLessThan(360)
        expect(Object.is(s.values.hue, -0)).toBe(false)
      }),
    )
  })
})

describe('withVersion', () => {
  it('turns versions on in canonical order', () => {
    const s = withVersion(withVersion(DEFAULT_STUDY, 'values', true), 'blurred', true)
    expect(s.versions).toEqual(['original', 'blurred', 'values'])
  })
  it('turns versions off', () => {
    const s = withVersion({ ...DEFAULT_STUDY, versions: ['original', 'values'] }, 'original', false)
    expect(s.versions).toEqual(['values'])
  })
  it('never turns off the last version (owner Q13, default)', () => {
    const s = { ...DEFAULT_STUDY, versions: ['values'] as const }
    expect(withVersion(s, 'values', false)).toBe(s)
  })
  it('never empties the selection (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(arbVersion, fc.boolean())), (ops) => {
        let s: StudySettings = DEFAULT_STUDY
        for (const [v, on] of ops) s = withVersion(s, v, on)
        expect(s.versions.length).toBeGreaterThanOrEqual(1)
      }),
    )
  })
})

describe('patchStudy', () => {
  it('merges values one level deep and ignores undefined', () => {
    const s = patchStudy(DEFAULT_STUDY, { values: { hue: 200, count: undefined } })
    expect(s.values).toEqual({ count: 5, hue: 200, neutral: false })
  })
  it('sanitizes the result', () => {
    expect(patchStudy(DEFAULT_STUDY, { blurPct: 0 }).blurPct).toBe(MIN_BLUR_PCT)
  })
})

describe('studyEqual', () => {
  it('compares field by field', () => {
    expect(studyEqual(DEFAULT_STUDY, { ...DEFAULT_STUDY, versions: ['original'] })).toBe(true)
    expect(studyEqual(DEFAULT_STUDY, patchStudy(DEFAULT_STUDY, { blurPct: 41 }))).toBe(false)
    expect(studyEqual(DEFAULT_STUDY, patchStudy(DEFAULT_STUDY, { values: { neutral: true } }))).toBe(false)
    expect(studyEqual(DEFAULT_STUDY, withVersion(DEFAULT_STUDY, 'values', true))).toBe(false)
  })
})

describe('tileStudyFor', () => {
  const s: StudySettings = { versions: [...STUDY_VERSIONS], blurPct: 30, values: { count: 4, hue: 10, neutral: false } }
  it('maps each version to what its tile needs', () => {
    expect(tileStudyFor('original', s)).toBeNull()
    expect(tileStudyFor('blurred', s)).toEqual({ blurPct: 30, values: null })
    expect(tileStudyFor('values', s)).toEqual({ blurPct: null, values: s.values })
    expect(tileStudyFor('blurValues', s)).toEqual({ blurPct: 30, values: s.values })
  })
})

describe('studyKey', () => {
  it('has a readable, stable format', () => {
    expect(studyKey(null)).toBe('-')
    expect(studyKey({ blurPct: 40, values: null })).toBe('b40')
    expect(studyKey({ blurPct: null, values: { count: 5, hue: 55, neutral: false } })).toBe('v5h55')
    expect(studyKey({ blurPct: 40, values: { count: 5, hue: 55, neutral: false } })).toBe('b40v5h55')
    expect(studyKey({ blurPct: null, values: { count: 5, hue: 55, neutral: true } })).toBe('v5n')
    expect(studyKey({ blurPct: null, values: { count: 5, hue: 99, neutral: true } })).toBe('v5n')
  })
  it('differs whenever the tile pixels would differ (property)', () => {
    const arbTile: fc.Arbitrary<TileStudy | null> = fc.option(
      fc.record({
        blurPct: fc.option(fc.integer({ min: 1, max: 100 })),
        values: fc.option(
          fc.record({
            count: fc.integer({ min: 2, max: 20 }),
            hue: fc.integer({ min: 0, max: 359 }),
            neutral: fc.boolean(),
          }),
        ),
      }),
    )
    // Same pixels ⇔ same blur, same count, same neutral, and same hue unless neutral.
    const samePixels = (a: TileStudy | null, b: TileStudy | null): boolean => {
      if (a === null || b === null) return a === b
      if (a.blurPct !== b.blurPct) return false
      if (a.values === null || b.values === null) return a.values === b.values
      return (
        a.values.count === b.values.count &&
        a.values.neutral === b.values.neutral &&
        (a.values.neutral || a.values.hue === b.values.hue)
      )
    }
    fc.assert(
      fc.property(arbTile, arbTile, (a, b) => {
        expect(studyKey(a) === studyKey(b)).toBe(samePixels(a, b))
      }),
    )
  })
})

describe('tileFormat (M2-R9)', () => {
  it('uses PNG for flat value studies and JPEG for photos', () => {
    expect(STUDY_VERSIONS.map(tileFormat)).toEqual(['jpeg', 'jpeg', 'png', 'png'])
  })
})
```

Note the edge case in the property test: `{blurPct: null, values: null}` is not a real tile (that is `null`), but `studyKey` must still not collide with `'-'`; it returns `''`. The property covers it (`samePixels` says it differs from `null`).

- [ ] **Step 3: Run it and see it fail**

```bash
corepack pnpm vitest run --project unit src/shared/model/study.test.ts
```

Expected: FAIL, `Cannot find module './study'`. Paste the output into the PR description (RED).

- [ ] **Step 4: Implement `study.ts`**

`src/shared/model/study.ts`:

```ts
export const STUDY_VERSIONS = ['original', 'blurred', 'values', 'blurValues'] as const
export type StudyVersion = (typeof STUDY_VERSIONS)[number]

export interface StudyValues {
  /** Integer MIN_VALUES..MAX_VALUES. */
  readonly count: number
  /** OKLCH hue in whole degrees, [0, 360). */
  readonly hue: number
  /** True: chroma 0 (the "Neutral grey" swatch). The hue is kept for when it is switched off. */
  readonly neutral: boolean
}

export interface StudySettings {
  /** Non-empty, no duplicates, always in STUDY_VERSIONS order. */
  readonly versions: readonly StudyVersion[]
  /** Integer MIN_BLUR_PCT..MAX_BLUR_PCT. */
  readonly blurPct: number
  readonly values: StudyValues
}

export const MIN_BLUR_PCT = 1
export const MAX_BLUR_PCT = 100
export const MIN_VALUES = 2
export const MAX_VALUES = 20
/** At 100% the Gaussian σ is this fraction of the printed tile's short side (spec §2.6). */
export const BLUR_SIGMA_AT_MAX = 0.05

/** New images start with this (owner Q1–Q4, default): Original only, 40%, 5 values, sepia. */
export const DEFAULT_STUDY: StudySettings = {
  versions: ['original'],
  blurPct: 40,
  values: { count: 5, hue: 55, neutral: false },
}

export type HuePresetId =
  | 'sepia'
  | 'terracotta'
  | 'ochre'
  | 'sapGreen'
  | 'teal'
  | 'ultramarine'
  | 'violet'
  | 'neutral'

/** The swatches of design/studies.html (owner D8), in display order. `hue: null` = neutral grey. */
export const HUE_PRESETS: readonly { readonly id: HuePresetId; readonly hue: number | null }[] = [
  { id: 'sepia', hue: 55 },
  { id: 'terracotta', hue: 35 },
  { id: 'ochre', hue: 85 },
  { id: 'sapGreen', hue: 135 },
  { id: 'teal', hue: 195 },
  { id: 'ultramarine', hue: 265 },
  { id: 'violet', hue: 305 },
  { id: 'neutral', hue: null },
]

function clampInt(value: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(value)))
}

function wrapHue(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STUDY.values.hue
  // `+ 0` turns -0 into 0, so equal hues always compare and serialise equal.
  return (((Math.round(value) % 360) + 360) % 360) + 0
}

const isVersion = (v: unknown): v is StudyVersion =>
  (STUDY_VERSIONS as readonly unknown[]).includes(v)

/** Total and idempotent: any input that has the right shape becomes a valid StudySettings. */
export function sanitizeStudy(study: StudySettings): StudySettings {
  const raw: readonly unknown[] = Array.isArray(study.versions) ? study.versions : []
  const wanted = new Set(raw.filter(isVersion))
  const versions = STUDY_VERSIONS.filter((v) => wanted.has(v))
  return {
    versions: versions.length > 0 ? versions : ['original'],
    blurPct: clampInt(study.blurPct, MIN_BLUR_PCT, MAX_BLUR_PCT, DEFAULT_STUDY.blurPct),
    values: {
      count: clampInt(study.values.count, MIN_VALUES, MAX_VALUES, DEFAULT_STUDY.values.count),
      hue: wrapHue(study.values.hue),
      neutral: study.values.neutral === true,
    },
  }
}

export function studyEqual(a: StudySettings, b: StudySettings): boolean {
  return (
    a.blurPct === b.blurPct &&
    a.values.count === b.values.count &&
    a.values.hue === b.values.hue &&
    a.values.neutral === b.values.neutral &&
    a.versions.length === b.versions.length &&
    a.versions.every((v, i) => b.versions[i] === v)
  )
}

/** Turn one version on or off. Turning off the last selected version returns `study` itself (owner Q13). */
export function withVersion(study: StudySettings, version: StudyVersion, on: boolean): StudySettings {
  if (!on && study.versions.length === 1 && study.versions[0] === version) return study
  const versions = on
    ? [...study.versions, version]
    : study.versions.filter((v) => v !== version)
  return sanitizeStudy({ ...study, versions })
}

export interface StudyPatch {
  readonly versions?: readonly StudyVersion[]
  readonly blurPct?: number
  readonly values?: Partial<StudyValues>
}

/** Merge (values one level deep; undefined means "not patched") then sanitize. */
export function patchStudy(study: StudySettings, patch: StudyPatch): StudySettings {
  const values = Object.fromEntries(
    Object.entries(patch.values ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<StudyValues>
  return sanitizeStudy({
    versions: patch.versions ?? study.versions,
    blurPct: patch.blurPct ?? study.blurPct,
    values: { ...study.values, ...values },
  })
}

/** What one printed tile needs. null for 'original'. */
export interface TileStudy {
  readonly blurPct: number | null
  readonly values: StudyValues | null
}

export function tileStudyFor(version: StudyVersion, study: StudySettings): TileStudy | null {
  switch (version) {
    case 'original':
      return null
    case 'blurred':
      return { blurPct: study.blurPct, values: null }
    case 'values':
      return { blurPct: null, values: study.values }
    case 'blurValues':
      return { blurPct: study.blurPct, values: study.values }
  }
}

/** Stable key: '-' for null; e.g. 'b40', 'v5h55', 'b40v5h55', 'v5n' (a neutral ramp ignores the hue). */
export function studyKey(study: TileStudy | null): string {
  if (study === null) return '-'
  const blur = study.blurPct === null ? '' : `b${String(study.blurPct)}`
  const v = study.values
  const values =
    v === null ? '' : `v${String(v.count)}${v.neutral ? 'n' : `h${String(v.hue)}`}`
  return blur + values
}

/** PNG for flat value studies (spec §2.5), JPEG for photographic tiles. */
export function tileFormat(version: StudyVersion): 'jpeg' | 'png' {
  return version === 'values' || version === 'blurValues' ? 'png' : 'jpeg'
}
```

- [ ] **Step 5: Run the model tests: PASS**

```bash
corepack pnpm vitest run --project unit src/shared/model/study.test.ts
```

- [ ] **Step 6: Add the descriptor field (RED via typecheck)**

`src/shared/model/image.ts`: add `import type { StudySettings } from './study'` and the field, last in the interface:

```ts
export interface ImageDescriptor {
  readonly id: ImageId
  /** SHA-256 of the source file bytes, lowercase hex. Orders layout ties the same way in every session. */
  readonly contentHash: string
  /** Decoded (possibly downscaled), EXIF-corrected. */
  readonly pxW: number
  readonly pxH: number
  readonly edits: ImageEdits
  /** Which versions print and how (M2-R1). DEFAULT_STUDY prints the original only. */
  readonly study: StudySettings
}
```

Run `corepack pnpm typecheck`: it fails at every builder in the Files list and in `images/store.ts`. That list of errors is the RED for this step.

- [ ] **Step 7: Fill in the store and the builders**

`src/features/images/store.ts`:
- `import { DEFAULT_STUDY } from '../../shared/model/study'`.
- In `loadOne`, the `LoadedImage` literal gains `study: DEFAULT_STUDY` right after `edits: DEFAULT_EDITS`. (B1 replaces the constant with the injectable default.)
- In `selectImageDescriptors`, the descriptor literal gains `study: img.study`.

`src/features/images/store.test.ts` (descriptor keys test):

```ts
expect(Object.keys(a[0] ?? {}).sort()).toEqual(['contentHash', 'edits', 'id', 'pxH', 'pxW', 'study'])
```

and add one assertion to the existing "adds files" test (or a new `it`):

```ts
it('gives every new image the default study (Original only)', async () => {
  const { store } = setup()
  await store.getState().addFiles([file('a.jpg')])
  expect(store.getState().images[0]?.study).toEqual(DEFAULT_STUDY)
})
```

Each test builder gets `study: DEFAULT_STUDY` (imported from the shared model; in `test-utils.tsx` it goes before `...rest` so callers can override it):

- `src/shared/model/image.test.ts` → `make`
- `src/features/layout/build-items.test.ts` → `img`
- `src/features/render/test-support/fixtures.ts` → `descriptor` (add an optional 5th parameter `study: StudySettings = DEFAULT_STUDY`, which B4 uses)
- `src/features/images/test-utils.tsx` → `makeLoadedImage`
- `src/app/pipeline.test.ts` → `img`
- `src/app/effects/PipelineEffect.test.tsx` → the inline image

Run `corepack pnpm typecheck && corepack pnpm test`: all green, no snapshot changes (layout golden, page-model snapshot). A snapshot change here is a bug: this task changes no behaviour.

- [ ] **Step 8: Namespace, locale file and barrel**

`src/shared/i18n/languages.ts`: append `'studies'` to `NAMESPACES` (the `locales.test.ts` "one file per namespace" check requires it; contract change request A-CR1 below).

`src/locales/en/studies.json` (A1 owns exactly these keys; D1 owns everything else in the file):

```json
{
  "version": {
    "original": "Original",
    "blurred": "Blurred",
    "values": "Values",
    "blurValues": "Blur + Values"
  }
}
```

`src/features/studies/index.ts`:

```ts
// --- model re-exports (A1) ---
export {
  BLUR_SIGMA_AT_MAX,
  DEFAULT_STUDY,
  HUE_PRESETS,
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
  STUDY_VERSIONS,
  patchStudy,
  sanitizeStudy,
  studyEqual,
  studyKey,
  tileFormat,
  tileStudyFor,
  withVersion,
} from '../../shared/model/study'
export type {
  HuePresetId,
  StudyPatch,
  StudySettings,
  StudyValues,
  StudyVersion,
  TileStudy,
} from '../../shared/model/study'
// --- maths (A3–A5) ---
// --- preview (C1, C2) ---
// --- components (D1) ---
```

The barrel must stay free of React and workers until D1/C2, and `export {}`-only sections are comments, so ESLint has nothing to flag.

- [ ] **Step 9: Coverage gate**

`vite.config.ts`, `test.coverage.include`:

```ts
include: [
  'src/features/layout/**',
  'src/features/render/**',
  'src/features/studies/**',
  'src/shared/colour/**',
],
```

`excludes` stay as they are (`**/components/**`, `**/*.worker.ts`, `**/test-support/**`). Update the comment above it to say the gate covers the M2 core modules (owner P3). Run `corepack pnpm test:coverage`: `studies/index.ts` is re-exports only and counts 100%; `shared/colour` matches nothing yet (A2) and Vitest 5 exits 0 for an unmatched glob.

- [ ] **Step 10: Verify, commit, PR**

```bash
corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test:coverage
E2E_PORT=4601 corepack pnpm e2e --project=chromium
git add -A && git commit -m "feat(studies): add the study settings model

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/studies-model
gh pr create --base master --title "feat(studies): add the study settings model" --body "…"
```

The PR body lists: the RED outputs (Step 3, Step 6), "no behaviour change: snapshots untouched", the A-CR1 namespace note.

---

### Task A2: OKLCH colour maths

**Branch:** `feat/oklch-colour` · **PR title:** `feat(shared): add OKLCH colour maths` · **Depends on:** — (runs alongside A1)

**Files:**
- Create: `src/shared/colour/oklch.ts`, `src/shared/colour/oklch.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `oklch.ts` contract (see "Contract items this plan produces").

- [ ] **Step 1: Create the worktree**

```bash
git worktree add .worktrees/oklch-colour -b feat/oklch-colour origin/master
cd .worktrees/oklch-colour && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Write the failing tests**

`src/shared/colour/oklch.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  inSrgbGamut,
  lightness8,
  linearRgbToOklab,
  linearToSrgb8,
  maxChroma,
  oklabToLinearRgb,
  oklchToOklab,
  oklchToRgb8,
  srgb8ToLinear,
} from './oklch'

const byte = fc.integer({ min: 0, max: 255 })
const lab8 = (r: number, g: number, b: number) =>
  linearRgbToOklab(srgb8ToLinear(r), srgb8ToLinear(g), srgb8ToLinear(b))
const chroma = (a: number, b: number) => Math.hypot(a, b)
const hueDeg = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360

describe('sRGB transfer', () => {
  it('round-trips every 8-bit level', () => {
    for (let c = 0; c <= 255; c++) expect(linearToSrgb8(srgb8ToLinear(c))).toBe(c)
  })
  it('has the standard end points and knee', () => {
    expect(srgb8ToLinear(0)).toBe(0)
    expect(srgb8ToLinear(255)).toBeCloseTo(1, 12)
    expect(srgb8ToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 12) // below the 0.04045 knee
    expect(srgb8ToLinear(128)).toBeCloseTo(0.2158605, 6)
  })
  it('clamps out-of-range linear values', () => {
    expect(linearToSrgb8(-0.2)).toBe(0)
    expect(linearToSrgb8(1.7)).toBe(255)
  })
})

describe('OKLab', () => {
  it('matches the reference values', () => {
    const white = lab8(255, 255, 255)
    expect(white.L).toBeCloseTo(1, 4)
    expect(white.a).toBeCloseTo(0, 4)
    expect(white.b).toBeCloseTo(0, 4)
    expect(lab8(0, 0, 0).L).toBe(0)
    const red = lab8(255, 0, 0)
    expect(red.L).toBeCloseTo(0.62796, 4)
    expect(chroma(red.a, red.b)).toBeCloseTo(0.25768, 4)
    expect(hueDeg(red.a, red.b)).toBeCloseTo(29.23, 1)
    expect(lab8(0, 255, 0).L).toBeCloseTo(0.86644, 4)
    expect(lab8(0, 0, 255).L).toBeCloseTo(0.45201, 4)
  })
  it('gives greys zero chroma', () => {
    for (let c = 0; c <= 255; c += 17) {
      const g = lab8(c, c, c)
      expect(chroma(g.a, g.b)).toBeLessThan(1e-4)
    }
  })
  it('is increasing in lightness along the grey axis', () => {
    let last = -1
    for (let c = 0; c <= 255; c++) {
      const L = lab8(c, c, c).L
      expect(L).toBeGreaterThan(last)
      last = L
    }
  })
  it('round-trips sRGB → OKLab → sRGB within one level (property)', () => {
    fc.assert(
      fc.property(byte, byte, byte, (r, g, b) => {
        const [lr, lg, lb] = oklabToLinearRgb(lab8(r, g, b))
        expect(Math.abs(linearToSrgb8(lr) - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(linearToSrgb8(lg) - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(linearToSrgb8(lb) - b)).toBeLessThanOrEqual(1)
      }),
      { numRuns: 10_000 },
    )
  })
  it('converts OKLCH polar coordinates', () => {
    const lab = oklchToOklab(0.5, 0.1, 90)
    expect(lab).toEqual({ L: 0.5, a: expect.closeTo(0, 12) as number, b: expect.closeTo(0.1, 12) as number })
  })
})

describe('lightness8', () => {
  it('equals linearRgbToOklab L (property)', () => {
    fc.assert(
      fc.property(byte, byte, byte, (r, g, b) => {
        expect(lightness8(r, g, b)).toBeCloseTo(lab8(r, g, b).L, 12)
      }),
    )
  })
})

describe('gamut', () => {
  it('knows sRGB primaries are in gamut and wild chroma is not', () => {
    const red = lab8(255, 0, 0)
    expect(inSrgbGamut(red.L, chroma(red.a, red.b) - 1e-4, hueDeg(red.a, red.b))).toBe(true)
    expect(inSrgbGamut(0.5, 0.4, 200)).toBe(false)
    expect(inSrgbGamut(0.5, 0, 0)).toBe(true)
  })
  it('maxChroma is in gamut and 1e-3 more is not (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.97, noNaN: true }),
        fc.double({ min: 0, max: 359.99, noNaN: true }),
        (L, h) => {
          const c = maxChroma(L, h)
          expect(c).toBeGreaterThanOrEqual(0)
          expect(inSrgbGamut(L, c, h)).toBe(true)
          expect(inSrgbGamut(L, c + 1e-3, h)).toBe(false)
        },
      ),
    )
  })
  it('is 0 at the ends of the lightness axis', () => {
    expect(maxChroma(0, 120)).toBe(0)
    expect(maxChroma(1, 120)).toBe(0)
  })
})

describe('oklchToRgb8', () => {
  it('maps greys to equal channels and clamps', () => {
    const g = oklchToRgb8(0.6, 0, 0)
    expect(g.r).toBe(g.g)
    expect(g.g).toBe(g.b)
    const wild = oklchToRgb8(0.7, 0.4, 150)
    for (const c of [wild.r, wild.g, wild.b]) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
  it('lands within one level of the original when in gamut (property)', () => {
    fc.assert(
      fc.property(byte, byte, byte, (r, g, b) => {
        const lab = lab8(r, g, b)
        const out = oklchToRgb8(lab.L, chroma(lab.a, lab.b), hueDeg(lab.a, lab.b))
        expect(Math.abs(out.r - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(out.g - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(out.b - b)).toBeLessThanOrEqual(1)
      }),
    )
  })
})
```

- [ ] **Step 3: Run it and see it fail**

```bash
corepack pnpm vitest run --project unit src/shared/colour/oklch.test.ts
```

Expected: FAIL (`Cannot find module './oklch'`). Paste into the PR.

- [ ] **Step 4: Implement**

`src/shared/colour/oklch.ts`:

```ts
/**
 * OKLab / OKLCH (Björn Ottosson, 2020) for sRGB (D65). Pure, no DOM. Used per pixel by the value
 * studies, so the hot path (lightness8) avoids allocation: one table lookup per channel, three cbrt.
 */

const SRGB_TO_LINEAR = (() => {
  const t = new Float64Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return t
})()

/** 8-bit gamma-encoded sRGB → linear [0, 1]. */
export function srgb8ToLinear(c8: number): number {
  return SRGB_TO_LINEAR[c8 & 255] ?? 0
}

/** Linear [0, 1] → 8-bit sRGB, rounded and clamped to 0..255. */
export function linearToSrgb8(c: number): number {
  const x = Math.min(1, Math.max(0, c))
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  return Math.round(s * 255)
}

export interface Oklab {
  readonly L: number
  readonly a: number
  readonly b: number
}

export function linearRgbToOklab(r: number, g: number, b: number): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function oklabToLinearRgb(lab: Oklab): readonly [number, number, number] {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function oklchToOklab(L: number, C: number, hDeg: number): Oklab {
  const h = (hDeg * Math.PI) / 180
  return { L, a: C * Math.cos(h), b: C * Math.sin(h) }
}

/** OKLab L of one 8-bit sRGB pixel (the L row only). */
export function lightness8(r8: number, g8: number, b8: number): number {
  const r = srgb8ToLinear(r8)
  const g = srgb8ToLinear(g8)
  const b = srgb8ToLinear(b8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

const GAMUT_EPS = 1e-6

export function inSrgbGamut(L: number, C: number, hDeg: number): boolean {
  return oklabToLinearRgb(oklchToOklab(L, C, hDeg)).every(
    (c) => c >= -GAMUT_EPS && c <= 1 + GAMUT_EPS,
  )
}

/** Largest in-gamut chroma at (L, h), to 1e-5 (17 bisection steps over [0, 0.4]). */
export function maxChroma(L: number, hDeg: number): number {
  if (!(L > 0 && L < 1)) return 0
  let lo = 0
  let hi = 0.4
  for (let i = 0; i < 17; i++) {
    const mid = (lo + hi) / 2
    if (inSrgbGamut(L, mid, hDeg)) lo = mid
    else hi = mid
  }
  return lo
}

export interface Rgb8 {
  readonly r: number
  readonly g: number
  readonly b: number
}

export function oklchToRgb8(L: number, C: number, hDeg: number): Rgb8 {
  const [r, g, b] = oklabToLinearRgb(oklchToOklab(L, C, hDeg))
  return { r: linearToSrgb8(r), g: linearToSrgb8(g), b: linearToSrgb8(b) }
}
```

Prettier drops trailing zeros in numeric literals (`0.7936177850` → `0.793617785`); the values are identical.

- [ ] **Step 5: Run: PASS; coverage**

```bash
corepack pnpm vitest run --project unit src/shared/colour/oklch.test.ts
corepack pnpm test:coverage
```

If A1 has merged, `src/shared/colour/oklch.ts` must show ≥ 95% lines and branches (it is all exercised). If not, note in the PR that coverage is counted once A1's `include` lands.

- [ ] **Step 6: Verify, commit, PR**

```bash
corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test
git add -A && git commit -m "feat(shared): add OKLCH colour maths

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/oklch-colour
gh pr create --base master --title "feat(shared): add OKLCH colour maths" --body "…"
```

---

### Task A3: Size-relative Gaussian blur

**Branch:** `feat/studies-blur` · **PR title:** `feat(studies): add a size-relative Gaussian blur` · **Depends on:** A1

**Files:**
- Create: `src/features/studies/blur.ts`, `src/features/studies/blur.test.ts`, `src/features/studies/test-support/pixels.ts`
- Modify: `src/features/studies/index.ts` (one line in the maths section)

**Interfaces:**
- Consumes (A1): `BLUR_SIGMA_AT_MAX`.
- Produces: `blurSigmaPx`, `boxRadiiForGauss`, `gaussianBlurRGBA`; test helpers `rgba`, `solid`, `noise`, `mulberry32`, `channelMean`, `channelRange`.

- [ ] **Step 1: Create the worktree** (after A1 has merged)

```bash
git worktree add .worktrees/studies-blur -b feat/studies-blur origin/master
cd .worktrees/studies-blur && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Test helpers** (no behaviour of their own; used by A3–A5 tests)

`src/features/studies/test-support/pixels.ts`:

```ts
/** Test-only RGBA builders and statistics. Alpha is always 255 (M1 flattens transparency on white). */

export type Px = readonly [number, number, number]

/** w × h image from a pixel function. */
export function rgba(w: number, h: number, f: (x: number, y: number) => Px): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y)
      const i = (y * w + x) * 4
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    }
  }
  return d
}

export const solid = (w: number, h: number, px: Px): Uint8ClampedArray => rgba(w, h, () => px)

/** Deterministic PRNG (mulberry32); never Math.random in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function noise(w: number, h: number, seed: number): Uint8ClampedArray {
  const rnd = mulberry32(seed)
  return rgba(w, h, () => [
    Math.floor(rnd() * 256),
    Math.floor(rnd() * 256),
    Math.floor(rnd() * 256),
  ])
}

/** Mean of channel c (0 = R, 1 = G, 2 = B, 3 = A). */
export function channelMean(d: Uint8ClampedArray, c: number): number {
  let s = 0
  for (let i = c; i < d.length; i += 4) s += d[i] ?? 0
  return s / (d.length / 4)
}

export function channelRange(d: Uint8ClampedArray, c: number): { min: number; max: number } {
  let min = 255
  let max = 0
  for (let i = c; i < d.length; i += 4) {
    const v = d[i] ?? 0
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}
```

- [ ] **Step 3: Write the failing blur tests**

`src/features/studies/blur.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { blurSigmaPx, boxRadiiForGauss, gaussianBlurRGBA } from './blur'
import { channelMean, channelRange, noise, rgba, solid } from './test-support/pixels'

const variance = (radii: readonly number[]) =>
  radii.reduce((s, r) => s + ((2 * r + 1) ** 2 - 1) / 12, 0)

describe('blurSigmaPx (M2-R6)', () => {
  it('scales with the short side, linearly in percent', () => {
    expect(blurSigmaPx(100, 400, 300)).toBeCloseTo(15, 12) // 5% of 300
    expect(blurSigmaPx(40, 300, 400)).toBeCloseTo(6, 12) // 40% of 5% of 300
    expect(blurSigmaPx(20, 3000, 4000)).toBeCloseTo(10 * blurSigmaPx(20, 300, 400), 12)
    expect(blurSigmaPx(50, 400, 300)).toBeCloseTo(blurSigmaPx(100, 400, 300) / 2, 12)
  })
})

describe('boxRadiiForGauss', () => {
  it('three boxes approximate the Gaussian variance', () => {
    for (const sigma of [1, 1.7, 2.5, 6, 15, 40, 120]) {
      const radii = boxRadiiForGauss(sigma)
      expect(radii).toHaveLength(3)
      for (const r of radii) expect(Number.isInteger(r) && r >= 0).toBe(true)
      expect(Math.abs(variance(radii) - sigma ** 2) / sigma ** 2).toBeLessThan(0.05)
    }
  })
  it('never returns negative radii for tiny sigmas', () => {
    for (const sigma of [0.25, 0.4, 0.6, 0.9]) {
      for (const r of boxRadiiForGauss(sigma)) expect(r).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('gaussianBlurRGBA', () => {
  it('keeps a constant image constant', () => {
    const d = solid(37, 23, [120, 30, 200])
    gaussianBlurRGBA(d, 37, 23, 9)
    expect(d).toEqual(solid(37, 23, [120, 30, 200]))
  })

  it('is a no-op below 0.25 px', () => {
    const d = noise(20, 20, 1)
    const before = d.slice()
    gaussianBlurRGBA(d, 20, 20, 0.2)
    expect(d).toEqual(before)
  })

  it('never touches alpha', () => {
    const d = noise(16, 16, 2)
    for (let i = 3; i < d.length; i += 4) d[i] = i % 7 === 0 ? 10 : 255
    const alpha = d.filter((_, i) => i % 4 === 3)
    gaussianBlurRGBA(d, 16, 16, 3)
    expect(d.filter((_, i) => i % 4 === 3)).toEqual(alpha)
  })

  it('never widens the range of a channel (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 1e6 }),
        fc.double({ min: 0.3, max: 20, noNaN: true }),
        (w, h, seed, sigma) => {
          const d = noise(w, h, seed)
          const before = [0, 1, 2].map((c) => channelRange(d, c))
          gaussianBlurRGBA(d, w, h, sigma)
          ;[0, 1, 2].forEach((c, k) => {
            const r = channelRange(d, c)
            expect(r.min).toBeGreaterThanOrEqual(before[k]?.min ?? 0)
            expect(r.max).toBeLessThanOrEqual(before[k]?.max ?? 255)
          })
        },
      ),
    )
  })

  it('keeps the average brightness (spec §7) when the border is constant', () => {
    // A noisy centre inside a constant ring wider than the total box reach: clamping changes nothing.
    const sigma = 4
    const reach = boxRadiiForGauss(sigma).reduce((a, b) => a + b, 0)
    const w = 80
    const h = 60
    const inner = noise(w, h, 3)
    const d = rgba(w, h, (x, y) => {
      const border = x < reach || y < reach || x >= w - reach || y >= h - reach
      const i = (y * w + x) * 4
      return border ? [128, 128, 128] : [inner[i] ?? 0, inner[i + 1] ?? 0, inner[i + 2] ?? 0]
    })
    const before = [0, 1, 2].map((c) => channelMean(d, c))
    gaussianBlurRGBA(d, w, h, sigma)
    ;[0, 1, 2].forEach((c, k) => {
      expect(Math.abs(channelMean(d, c) - (before[k] ?? 0))).toBeLessThanOrEqual(0.5)
    })
  })

  it('moves the average only through the edges, for any image (property)', () => {
    // Clamp-to-edge re-weights at most `reach` pixels at each end of every line, so the mean can
    // move by at most 255 · 2 · reach / n per axis, plus rounding (0.5 per pass, 6 passes).
    fc.assert(
      fc.property(
        fc.integer({ min: 24, max: 64 }),
        fc.integer({ min: 24, max: 64 }),
        fc.integer({ min: 0, max: 1e6 }),
        fc.double({ min: 0.3, max: 3, noNaN: true }),
        (w, h, seed, sigma) => {
          const reach = boxRadiiForGauss(sigma).reduce((a, b) => a + b, 0)
          const bound = 255 * 2 * reach * (1 / w + 1 / h) + 3
          const d = noise(w, h, seed)
          const before = channelMean(d, 0)
          gaussianBlurRGBA(d, w, h, sigma)
          expect(Math.abs(channelMean(d, 0) - before)).toBeLessThanOrEqual(bound)
        },
      ),
    )
  })

  it('handles 1-pixel-wide and 1-pixel-tall images', () => {
    const col = rgba(1, 9, (_, y) => [y * 30, 0, 0])
    gaussianBlurRGBA(col, 1, 9, 2)
    expect(channelRange(col, 0).max).toBeLessThanOrEqual(240)
    expect(channelRange(col, 0).min).toBeGreaterThanOrEqual(0)
    const row = rgba(9, 1, (x) => [x * 30, 0, 0])
    gaussianBlurRGBA(row, 9, 1, 2)
    expect(row[0]).toBeGreaterThan(0) // the edge took its neighbours in
  })

  it('actually blurs: a hard edge becomes a ramp', () => {
    const w = 64
    const d = rgba(w, 4, (x) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]))
    gaussianBlurRGBA(d, w, 4, 4)
    const row = Array.from({ length: w }, (_, x) => d[x * 4] ?? 0)
    expect(row[0]).toBe(0)
    expect(row[w - 1]).toBe(255)
    expect(row[w / 2 - 1]).toBeGreaterThan(60)
    expect(row[w / 2]).toBeLessThan(195)
    for (let x = 1; x < w; x++) expect(row[x]).toBeGreaterThanOrEqual(row[x - 1] ?? 0) // monotone
  })

  it('is symmetric: blurring a mirrored image gives the mirrored result', () => {
    const w = 31
    const h = 17
    const d = noise(w, h, 9)
    const m = rgba(w, h, (x, y) => {
      const i = (y * w + (w - 1 - x)) * 4
      return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0]
    })
    gaussianBlurRGBA(d, w, h, 3)
    gaussianBlurRGBA(m, w, h, 3)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = d[(y * w + x) * 4] ?? 0
        const b = m[(y * w + (w - 1 - x)) * 4] ?? 0
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1) // rounding may differ by one level
      }
    }
  })
})
```

- [ ] **Step 4: Run it and see it fail**

```bash
corepack pnpm vitest run --project unit src/features/studies/blur.test.ts
```

Expected: FAIL (`Cannot find module './blur'`). Paste into the PR.

- [ ] **Step 5: Implement**

`src/features/studies/blur.ts`:

```ts
import { BLUR_SIGMA_AT_MAX } from '../../shared/model/study'

/** Gaussian σ in px for a tile rendered at w × h px (M2-R6): relative to the short side. */
export function blurSigmaPx(blurPct: number, w: number, h: number): number {
  return (blurPct / 100) * BLUR_SIGMA_AT_MAX * Math.min(w, h)
}

/** Below this σ (px) a blur changes nothing visible; skip it. */
const MIN_SIGMA_PX = 0.25

/**
 * Radii of three box filters whose successive application approximates a Gaussian of σ
 * (Kovesi, "Fast almost-Gaussian filtering", n = 3).
 */
export function boxRadiiForGauss(sigma: number): readonly [number, number, number] {
  const n = 3
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl -= 1
  const wu = wl + 2
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)
  const m = Math.min(n, Math.max(0, Math.round(mIdeal)))
  const radius = (i: number): number => ((i < m ? wl : wu) - 1) / 2
  return [radius(0), radius(1), radius(2)]
}

/**
 * One box pass of radius r over one line of n pixels, RGB only, clamp-to-edge.
 * The line is read from `buf` (a copy) and written back into `data` at `start` with `step`.
 */
function boxLine(
  data: Uint8ClampedArray,
  buf: Uint8ClampedArray,
  start: number,
  step: number,
  n: number,
  r: number,
): void {
  for (let i = 0; i < n; i++) {
    const from = start + i * step
    buf[i * 4] = data[from] ?? 0
    buf[i * 4 + 1] = data[from + 1] ?? 0
    buf[i * 4 + 2] = data[from + 2] ?? 0
  }
  const d = 2 * r + 1
  const last = n - 1
  const at = (i: number, c: number): number => buf[(i < 0 ? 0 : i > last ? last : i) * 4 + c] ?? 0
  for (let c = 0; c < 3; c++) {
    let sum = 0
    for (let i = -r; i <= r; i++) sum += at(i, c)
    for (let x = 0; x < n; x++) {
      data[start + x * step + c] = Math.floor((sum + r) / d)
      sum += at(x + r + 1, c) - at(x - r, c)
    }
  }
}

/**
 * Gaussian blur in place (RGBA, alpha untouched): 3 horizontal then 3 vertical box passes.
 * O(w·h) time whatever σ; one line buffer of extra memory (M2-R10).
 */
export function gaussianBlurRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sigma: number,
): void {
  if (!(sigma >= MIN_SIGMA_PX) || w <= 0 || h <= 0) return
  const radii = boxRadiiForGauss(sigma)
  const buf = new Uint8ClampedArray(4 * Math.max(w, h))
  for (const r of radii) {
    if (r === 0) continue
    for (let y = 0; y < h; y++) boxLine(data, buf, y * w * 4, 4, w, r)
  }
  for (const r of radii) {
    if (r === 0) continue
    for (let x = 0; x < w; x++) boxLine(data, buf, x * 4, w * 4, h, r)
  }
}
```

Barrel, maths section: `export { blurSigmaPx, boxRadiiForGauss, gaussianBlurRGBA } from './blur'`.

Note on rounding: `floor((sum + r) / d)` is round-half-up for odd `d`; with clamped edges the per-pass rounding error averages to ~0, which is what the mean tests pin. `floor(sum / d)` (always down) loses ~0.5 levels per pass, 3 levels over six passes: the "keeps the average brightness" test catches it.

- [ ] **Step 6: Run: PASS; coverage ≥ 95% for `blur.ts`**

```bash
corepack pnpm vitest run --project unit src/features/studies/blur.test.ts
corepack pnpm test:coverage
```

- [ ] **Step 7: Verify, commit, PR**

```bash
corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test
git add -A && git commit -m "feat(studies): add a size-relative Gaussian blur

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/studies-blur
gh pr create --base master --title "feat(studies): add a size-relative Gaussian blur" --body "…"
```

---

### Task A4: Single-hue value ramp and posterisation

**Branch:** `feat/studies-values` · **PR title:** `feat(studies): add the single-hue value ramp and posterisation` · **Depends on:** A1, A2

**Files:**
- Create: `src/features/studies/ramp.ts`, `src/features/studies/ramp.test.ts`, `src/features/studies/posterize.ts`, `src/features/studies/posterize.test.ts`, `src/features/studies/test-support/lightness.ts`
- Modify: `src/features/studies/index.ts` (two lines in the maths section)

**Interfaces:**
- Consumes (A1): `StudyValues`, `MIN_VALUES`, `MAX_VALUES`. (A2): `Rgb8`, `oklchToRgb8`, `maxChroma`, `lightness8`, `linearRgbToOklab`, `srgb8ToLinear`.
- Produces: the `ramp.ts` and `posterize.ts` contracts; test helpers `lightnessRampImage`, `distinctColours`, `measuredLightness`.

- [ ] **Step 1: Create the worktree** (after A1 and A2 have merged)

```bash
git worktree add .worktrees/studies-values -b feat/studies-values origin/master
cd .worktrees/studies-values && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Test helpers**

`src/features/studies/test-support/lightness.ts`:

```ts
import { lightness8, oklchToRgb8, type Rgb8 } from '../../../shared/colour/oklch'

/**
 * A w × h neutral image whose OKLab lightness rises evenly from `lo` to `hi`, left to right.
 * Mid-range lightness keeps 8-bit quantisation (≈ 0.004 L per level) far finer than any value step.
 */
export function lightnessRampImage(w: number, h: number, lo = 0.3, hi = 0.9): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let x = 0; x < w; x++) {
    const { r, g, b } = oklchToRgb8(lo + ((hi - lo) * x) / Math.max(1, w - 1), 0, 0)
    for (let y = 0; y < h; y++) d.set([r, g, b, 255], (y * w + x) * 4)
  }
  return d
}

/** Distinct RGB triples, as 'r,g,b' strings. */
export function distinctColours(d: Uint8ClampedArray): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < d.length; i += 4) out.add(`${String(d[i])},${String(d[i + 1])},${String(d[i + 2])}`)
  return out
}

export const key = (c: Rgb8): string => `${String(c.r)},${String(c.g)},${String(c.b)}`

/** OKLab L re-measured from the 8-bit colour (what a printer actually gets). */
export const measuredLightness = (c: Rgb8): number => lightness8(c.r, c.g, c.b)
```

- [ ] **Step 3: Write the failing ramp tests**

`src/features/studies/ramp.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { inSrgbGamut, linearRgbToOklab, srgb8ToLinear } from '../../shared/colour/oklch'
import { MAX_VALUES, MIN_VALUES, type StudyValues } from '../../shared/model/study'
import { RAMP_L_DARK, RAMP_L_LIGHT, rampChroma, valueRamp } from './ramp'
import { measuredLightness } from './test-support/lightness'

const arbValues: fc.Arbitrary<StudyValues> = fc.record({
  count: fc.integer({ min: MIN_VALUES, max: MAX_VALUES }),
  hue: fc.integer({ min: 0, max: 359 }),
  neutral: fc.boolean(),
})
const lab = (c: { r: number; g: number; b: number }) =>
  linearRgbToOklab(srgb8ToLinear(c.r), srgb8ToLinear(c.g), srgb8ToLinear(c.b))

describe('rampChroma', () => {
  it('follows the approved mockup curve', () => {
    expect(rampChroma(0)).toBeCloseTo(0.045, 12)
    expect(rampChroma(0.5)).toBeCloseTo(0.045 + 0.05 - 0.01, 12)
    expect(rampChroma(1)).toBeCloseTo(0.025, 12)
  })
})

describe('valueRamp', () => {
  it('has exactly count colours', () => {
    for (let n = MIN_VALUES; n <= MAX_VALUES; n++) {
      expect(valueRamp({ count: n, hue: 55, neutral: false })).toHaveLength(n)
    }
  })

  it('runs from L 0.20 to L 0.95 (owner D9)', () => {
    fc.assert(
      fc.property(arbValues, (v) => {
        const ramp = valueRamp(v)
        expect(measuredLightness(ramp[0] ?? { r: 0, g: 0, b: 0 })).toBeCloseTo(RAMP_L_DARK, 1.7)
        expect(measuredLightness(ramp[ramp.length - 1] ?? { r: 0, g: 0, b: 0 })).toBeCloseTo(
          RAMP_L_LIGHT,
          1.7,
        )
      }),
    )
  })

  it('is strictly increasing in measured lightness (spec §7)', () => {
    fc.assert(
      fc.property(arbValues, (v) => {
        const Ls = valueRamp(v).map(measuredLightness)
        for (let k = 1; k < Ls.length; k++) expect(Ls[k]).toBeGreaterThan(Ls[k - 1] ?? 1)
      }),
    )
  })

  it('is never white, for every hue (R7: the lightest value is a tint, never paper)', () => {
    for (let hue = 0; hue < 360; hue++) {
      for (const neutral of [false, true]) {
        const last = valueRamp({ count: 20, hue, neutral }).at(-1)
        expect(last).toBeDefined()
        expect(last).not.toEqual({ r: 255, g: 255, b: 255 })
      }
    }
  })

  it('every colour is in gamut', () => {
    fc.assert(
      fc.property(arbValues, (v) => {
        for (const c of valueRamp(v)) {
          const { L, a, b } = lab(c)
          const C = Math.hypot(a, b)
          const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
          expect(inSrgbGamut(L, C, h)).toBe(true)
        }
      }),
    )
  })

  it('keeps the hue where the colour is clearly chromatic', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359 }), fc.integer({ min: 2, max: 20 }), (hue, count) => {
        for (const c of valueRamp({ count, hue, neutral: false })) {
          const { a, b } = lab(c)
          if (Math.hypot(a, b) < 0.04) continue
          const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
          const diff = Math.abs(((h - hue + 540) % 360) - 180)
          expect(diff).toBeLessThanOrEqual(5)
        }
      }),
    )
  })

  it('neutral is grey and ignores the hue', () => {
    const a = valueRamp({ count: 7, hue: 10, neutral: true })
    const b = valueRamp({ count: 7, hue: 250, neutral: true })
    expect(a).toEqual(b)
    for (const c of a) {
      expect(c.r).toBe(c.g)
      expect(c.g).toBe(c.b)
    }
  })

  it('pins the default sepia 5-value ramp', () => {
    // Regenerate only for an intended ramp change (it is what the owner prints at sign-off).
    expect(valueRamp({ count: 5, hue: 55, neutral: false })).toMatchSnapshot()
  })
})
```

`toBeCloseTo(x, 1.7)` means |Δ| < 10^−1.7 / 2 ≈ 0.01.

- [ ] **Step 4: Write the failing posterise tests**

`src/features/studies/posterize.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { lightness8, type Rgb8 } from '../../shared/colour/oklch'
import { LIGHTNESS_BINS, VALUE_CLIP, lightnessRange, posterizeRGBA, valueIndex } from './posterize'
import { valueRamp } from './ramp'
import { distinctColours, key, lightnessRampImage } from './test-support/lightness'
import { noise, rgba, solid } from './test-support/pixels'

const SEPIA = (count: number) => valueRamp({ count, hue: 55, neutral: false })

describe('valueIndex', () => {
  const range = { lo: 0.2, hi: 0.8 }
  it('puts each edge at lo + j(hi − lo)/N, an edge pixel going up', () => {
    for (const n of [2, 3, 5, 20]) {
      for (let j = 1; j < n; j++) {
        const edge = range.lo + (j * (range.hi - range.lo)) / n
        expect(valueIndex(edge - 1e-9, range, n)).toBe(j - 1)
        expect(valueIndex(edge + 1e-9, range, n)).toBe(j)
      }
    }
  })
  it('clamps below lo and above hi', () => {
    expect(valueIndex(0, range, 5)).toBe(0)
    expect(valueIndex(1, range, 5)).toBe(4)
    expect(valueIndex(range.hi, range, 5)).toBe(4)
  })
  it('maps a degenerate range to the middle value', () => {
    expect(valueIndex(0.5, { lo: 0.5, hi: 0.5 }, 5)).toBe(2)
    expect(valueIndex(0.5, { lo: 0.5, hi: 0.5 + 1e-7 }, 4)).toBe(2)
  })
})

describe('lightnessRange', () => {
  it('spans a full ramp image', () => {
    const r = lightnessRange(lightnessRampImage(1000, 2, 0.3, 0.9), 1000, 2)
    expect(r.lo).toBeCloseTo(0.3, 1.5)
    expect(r.hi).toBeCloseTo(0.9, 1.5)
  })
  it('clips the brightest and darkest 1% before splitting', () => {
    // 98% mid-grey ramp between 0.4 and 0.6, 1% black and 1% white specks.
    const w = 100
    const h = 100
    const base = lightnessRampImage(w, h, 0.4, 0.6)
    for (let i = 0; i < w * h; i++) {
      if (i % 100 === 0) base.set([0, 0, 0], i * 4)
      if (i % 100 === 50) base.set([255, 255, 255], i * 4)
    }
    const r = lightnessRange(base, w, h)
    expect(r.lo).toBeGreaterThan(0.39)
    expect(r.hi).toBeLessThan(0.61)
    expect(VALUE_CLIP).toBe(0.01)
  })
  it('a dark photo still uses every value (owner Q11, default)', () => {
    const dark = lightnessRampImage(500, 2, 0.15, 0.35)
    const ramp = SEPIA(5)
    posterizeRGBA(dark, 500, 2, ramp, lightnessRange(dark, 500, 2))
    expect(distinctColours(dark).size).toBe(5)
  })
  it('ends on 1/1024 bin edges', () => {
    expect(LIGHTNESS_BINS).toBe(1024)
    const r = lightnessRange(noise(32, 32, 5), 32, 32)
    expect(Number.isInteger(r.lo * 1024)).toBe(true)
    expect(Number.isInteger(r.hi * 1024)).toBe(true)
  })
  it('is degenerate when every kept pixel falls in one bin', () => {
    const r = lightnessRange(solid(4, 4, [119, 119, 119]), 4, 4)
    expect(r.hi).toBe(r.lo)
  })
  it('returns 0..1 for an empty image', () => {
    expect(lightnessRange(new Uint8ClampedArray(0), 0, 0)).toEqual({ lo: 0, hi: 1 })
  })
})

describe('posterizeRGBA', () => {
  it('outputs exactly N ramp colours on a full gradient (spec §7)', () => {
    for (let n = 2; n <= 20; n++) {
      const d = lightnessRampImage(2000, 1)
      const ramp = SEPIA(n)
      posterizeRGBA(d, 2000, 1, ramp, lightnessRange(d, 2000, 1))
      const colours = distinctColours(d)
      expect(colours.size).toBe(n)
      expect([...colours].sort()).toEqual(ramp.map(key).sort())
    }
  })

  it('two values split at the midpoint (notan)', () => {
    const d = lightnessRampImage(1000, 1, 0.3, 0.9)
    const range = lightnessRange(d, 1000, 1)
    const ramp = SEPIA(2)
    const src = d.slice()
    posterizeRGBA(d, 1000, 1, ramp, range)
    const mid = (range.lo + range.hi) / 2
    for (let i = 0; i < 1000; i++) {
      const L = lightness8(src[i * 4] ?? 0, src[i * 4 + 1] ?? 0, src[i * 4 + 2] ?? 0)
      const want: Rgb8 | undefined = L < mid ? ramp[0] : ramp[1]
      expect([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]).toEqual([want?.r, want?.g, want?.b])
    }
  })

  it('a flat image maps to one middle value', () => {
    const d = solid(10, 10, [90, 120, 60])
    const ramp = SEPIA(5)
    posterizeRGBA(d, 10, 10, ramp, lightnessRange(d, 10, 10))
    expect([...distinctColours(d)]).toEqual([key(ramp[2] ?? { r: 0, g: 0, b: 0 })])
  })

  it('keeps darker pixels on darker values (monotone, property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e6 }), fc.integer({ min: 2, max: 20 }), (seed, n) => {
        const d = noise(16, 16, seed)
        const src = d.slice()
        const ramp = SEPIA(n)
        const index = new Map(ramp.map((c, i) => [key(c), i]))
        posterizeRGBA(d, 16, 16, ramp, lightnessRange(d, 16, 16))
        const pairs = Array.from({ length: 256 }, (_, i) => ({
          L: lightness8(src[i * 4] ?? 0, src[i * 4 + 1] ?? 0, src[i * 4 + 2] ?? 0),
          k: index.get(`${String(d[i * 4])},${String(d[i * 4 + 1])},${String(d[i * 4 + 2])}`) ?? -1,
        })).sort((a, b) => a.L - b.L)
        for (let i = 1; i < pairs.length; i++) {
          expect(pairs[i]?.k ?? -1).toBeGreaterThanOrEqual(pairs[i - 1]?.k ?? 99)
        }
        expect(pairs.every((p) => p.k >= 0)).toBe(true) // every output is a ramp colour
      }),
    )
  })

  it('sets alpha to 255', () => {
    const d = rgba(3, 3, () => [200, 10, 10])
    d[3] = 0
    posterizeRGBA(d, 3, 3, SEPIA(3), { lo: 0, hi: 1 })
    expect(d[3]).toBe(255)
  })
})
```

- [ ] **Step 5: Run both and see them fail**

```bash
corepack pnpm vitest run --project unit src/features/studies/ramp.test.ts src/features/studies/posterize.test.ts
```

Expected: FAIL (modules missing). Paste into the PR.

- [ ] **Step 6: Implement**

`src/features/studies/ramp.ts`:

```ts
import { maxChroma, oklchToRgb8, type Rgb8 } from '../../shared/colour/oklch'
import type { StudyValues } from '../../shared/model/study'

/** Near-black of the hue → its lightest tint (owner D9; never paper white, R7). */
export const RAMP_L_DARK = 0.2
export const RAMP_L_LIGHT = 0.95
/** Chroma kept below the gamut edge, so 8-bit rounding never clips a channel. */
export const RAMP_GAMUT_MARGIN = 0.002

/** Chroma along the ramp (t = 0 darkest … 1 lightest): the curve of the approved mockup. */
export function rampChroma(t: number): number {
  return 0.045 + 0.05 * Math.sin(Math.PI * t) - 0.02 * t
}

/** N colours, darkest first, evenly spaced in OKLab lightness, one hue (M2-R8). */
export function valueRamp(values: StudyValues): readonly Rgb8[] {
  const n = values.count
  return Array.from({ length: n }, (_, k) => {
    const t = n === 1 ? 0 : k / (n - 1)
    const L = RAMP_L_DARK + (RAMP_L_LIGHT - RAMP_L_DARK) * t
    const C = values.neutral
      ? 0
      : Math.max(0, Math.min(rampChroma(t), maxChroma(L, values.hue) - RAMP_GAMUT_MARGIN))
    return oklchToRgb8(L, C, values.hue)
  })
}
```

`src/features/studies/posterize.ts`:

```ts
import { lightness8, type Rgb8 } from '../../shared/colour/oklch'

export interface LightnessRange {
  readonly lo: number
  readonly hi: number
}

export const LIGHTNESS_BINS = 1024
/** Share of pixels ignored at each end of the lightness range (owner Q11, default). */
export const VALUE_CLIP = 0.01

const binOf = (L: number): number =>
  Math.min(LIGHTNESS_BINS - 1, Math.max(0, Math.floor(L * LIGHTNESS_BINS)))

/** The tile's own lightness range, VALUE_CLIP of the pixels clipped at each end (4 KB histogram). */
export function lightnessRange(data: Uint8ClampedArray, w: number, h: number): LightnessRange {
  const n = w * h
  if (n <= 0) return { lo: 0, hi: 1 }
  const hist = new Uint32Array(LIGHTNESS_BINS)
  for (let i = 0; i < n * 4; i += 4) {
    const bin = binOf(lightness8(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0))
    hist[bin] = (hist[bin] ?? 0) + 1
  }
  const k = Math.floor(VALUE_CLIP * n)
  let cum = 0
  let loBin = -1
  let hiBin = LIGHTNESS_BINS - 1
  for (let b = 0; b < LIGHTNESS_BINS; b++) {
    cum += hist[b] ?? 0
    if (loBin < 0 && cum > k) loBin = b
    if (cum >= n - k) {
      hiBin = b
      break
    }
  }
  const lo = Math.max(0, loBin)
  // Everything kept sits in one bin: a flat tile. Report a zero-width range (→ the middle value).
  if (hiBin <= lo) return { lo: (lo + 0.5) / LIGHTNESS_BINS, hi: (lo + 0.5) / LIGHTNESS_BINS }
  return { lo: lo / LIGHTNESS_BINS, hi: (hiBin + 1) / LIGHTNESS_BINS }
}

/** N equal steps over the range; a value exactly on an edge goes up; a flat range → the middle. */
export function valueIndex(L: number, range: LightnessRange, count: number): number {
  const span = range.hi - range.lo
  if (!(span >= 1e-6)) return Math.floor(count / 2)
  const k = Math.floor(((L - range.lo) / span) * count)
  return k < 0 ? 0 : k > count - 1 ? count - 1 : k
}

/** In place: every pixel becomes the ramp colour of its value; alpha 255. */
export function posterizeRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  ramp: readonly Rgb8[],
  range: LightnessRange,
): void {
  const n = w * h * 4
  for (let i = 0; i < n; i += 4) {
    const L = lightness8(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)
    const c = ramp[valueIndex(L, range, ramp.length)]
    if (!c) continue // only for an empty ramp, which valueRamp never returns
    data[i] = c.r
    data[i + 1] = c.g
    data[i + 2] = c.b
    data[i + 3] = 255
  }
}
```

The `loBin < 0` check and the `cum >= n − k` break must run in the same iteration (a single bin can hold both ends: the solid-image test). Barrel lines:

```ts
export { RAMP_L_DARK, RAMP_L_LIGHT, rampChroma, valueRamp } from './ramp'
export { LIGHTNESS_BINS, VALUE_CLIP, lightnessRange, posterizeRGBA, valueIndex } from './posterize'
export type { LightnessRange } from './posterize'
```

- [ ] **Step 7: Run: PASS; review the ramp snapshot**

```bash
corepack pnpm vitest run --project unit src/features/studies/ramp.test.ts src/features/studies/posterize.test.ts
corepack pnpm test:coverage
```

Paste the generated default sepia ramp (5 hex colours) into the PR description, with a swatch row rendered in the description as inline colour codes, so the reviewer and the owner see the colours that will print.

- [ ] **Step 8: Verify, commit, PR**

```bash
corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test
git add -A && git commit -m "feat(studies): add the single-hue value ramp and posterisation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/studies-values
gh pr create --base master --title "feat(studies): add the single-hue value ramp and posterisation" --body "…"
```

---

### Task A5: `applyStudy`, the canvas step, golden images and performance

**Branch:** `feat/studies-apply` · **PR title:** `feat(studies): apply a study to tile pixels, with golden images` · **Depends on:** A3, A4

**Files:**
- Create: `src/features/studies/apply-study.ts`, `src/features/studies/apply-study.test.ts`, `src/features/studies/golden.test.ts`, `src/features/studies/perf.test.ts`
- Modify: `src/features/studies/index.ts` (one line in the maths section)

**Interfaces:**
- Consumes: A3 (`blurSigmaPx`, `gaussianBlurRGBA`), A4 (`valueRamp`, `lightnessRange`, `posterizeRGBA`), A1 (`TileStudy`, `tileStudyFor`, `STUDY_VERSIONS`), M1 types `PixelCtx` (`render/pixels/bleed.ts`) and `TilePixelPlan` (`render/pixels/tile-plan.ts`), **type-only**.
- Produces: `applyStudy`, `applyStudyToContext` (consumed by B5's `renderTile` and, through it, by the export worker and C2's studies worker).

- [ ] **Step 1: Create the worktree** (after A3 and A4 have merged)

```bash
git worktree add .worktrees/studies-apply -b feat/studies-apply origin/master
cd .worktrees/studies-apply && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Write the failing tests**

`src/features/studies/apply-study.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PixelCtx } from '../render/pixels/bleed'
import { DEFAULT_STUDY, tileStudyFor, type TileStudy } from '../../shared/model/study'
import { applyStudy, applyStudyToContext } from './apply-study'
import { blurSigmaPx, gaussianBlurRGBA } from './blur'
import { lightnessRange, posterizeRGBA } from './posterize'
import { valueRamp } from './ramp'
import { distinctColours, lightnessRampImage } from './test-support/lightness'
import { noise, rgba } from './test-support/pixels'

const VALUES = { count: 5, hue: 55, neutral: false }
const study = (blurPct: number | null, values: typeof VALUES | null): TileStudy => ({ blurPct, values })

/** Hard vertical stripes: lots of edges for a blur to soften. */
const stripes = (w: number, h: number) =>
  rgba(w, h, (x) => (Math.floor(x / Math.max(1, w / 8)) % 2 === 0 ? [30, 30, 30] : [220, 210, 190]))

describe('applyStudy', () => {
  it('blurred only blurs', () => {
    const a = stripes(80, 40)
    const b = a.slice()
    applyStudy(a, 80, 40, study(40, null))
    gaussianBlurRGBA(b, 80, 40, blurSigmaPx(40, 80, 40))
    expect(a).toEqual(b)
  })

  it('values only posterises', () => {
    const a = lightnessRampImage(300, 4)
    applyStudy(a, 300, 4, study(null, VALUES))
    expect(distinctColours(a).size).toBe(5)
  })

  it('blurs first, then posterises (spec §2.6)', () => {
    const w = 120
    const h = 40
    const a = stripes(w, h)
    applyStudy(a, w, h, study(60, VALUES))

    const expected = stripes(w, h)
    gaussianBlurRGBA(expected, w, h, blurSigmaPx(60, w, h))
    posterizeRGBA(expected, w, h, valueRamp(VALUES), lightnessRange(expected, w, h))
    expect(a).toEqual(expected)

    // The wrong order leaves blurred in-between colours: more than N distinct colours.
    const wrong = stripes(w, h)
    posterizeRGBA(wrong, w, h, valueRamp(VALUES), lightnessRange(wrong, w, h))
    gaussianBlurRGBA(wrong, w, h, blurSigmaPx(60, w, h))
    expect(distinctColours(wrong).size).toBeGreaterThan(5)
    expect(distinctColours(a).size).toBeLessThanOrEqual(5)
  })

  it('gives the same number of values at two resolutions (preview vs print)', () => {
    for (const s of [study(null, VALUES), study(40, VALUES)]) {
      const small = lightnessRampImage(150, 100)
      const large = lightnessRampImage(1500, 1000)
      applyStudy(small, 150, 100, s)
      applyStudy(large, 1500, 1000, s)
      expect(distinctColours(small).size).toBe(distinctColours(large).size)
    }
  })

  it('blurs in proportion to the tile size (preview vs print)', () => {
    // Share of pixels left within 8 levels of a stripe colour: equal at 10× the resolution.
    const flatShare = (w: number, h: number) => {
      const d = stripes(w, h)
      applyStudy(d, w, h, study(30, null))
      let flat = 0
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] ?? 0
        if (Math.abs(r - 30) <= 8 || Math.abs(r - 220) <= 8) flat++
      }
      return flat / (w * h)
    }
    expect(Math.abs(flatShare(160, 80) - flatShare(1600, 800))).toBeLessThan(0.03)
  })

  it('allocates nothing proportional to the pixels (M2-R10)', () => {
    const w = 1000
    const h = 1000
    const d = noise(w, h, 11)
    const sizes = trackTypedArrayAllocations(() => {
      applyStudy(d, w, h, study(40, VALUES))
    })
    expect(sizes.filter((bytes) => bytes >= 64 * 1024)).toEqual([])
  })
})

describe('applyStudyToContext', () => {
  it('processes only the image area inside the bleed', () => {
    const bleed = 3
    const outW = 40
    const outH = 20
    const ctx = fakeCtx(outW + 2 * bleed, outH + 2 * bleed)
    // Fill the whole canvas with a gradient, then mark the bleed ring with a sentinel.
    ctx.fill((x, y) => {
      const ring = x < bleed || y < bleed || x >= outW + bleed || y >= outH + bleed
      return ring ? [1, 2, 3] : [x * 6, x * 6, x * 6]
    })
    applyStudyToContext(ctx, { bleedPx: bleed, outW, outH }, study(null, VALUES))
    expect(ctx.reads).toEqual([[bleed, bleed, outW, outH]])
    expect(ctx.writes).toEqual([[bleed, bleed]])
    expect(ctx.pixel(0, 0)).toEqual([1, 2, 3])
    expect(ctx.pixel(outW + 2 * bleed - 1, outH + 2 * bleed - 1)).toEqual([1, 2, 3])
    const inner = new Set<string>()
    for (let y = bleed; y < bleed + outH; y++)
      for (let x = bleed; x < bleed + outW; x++) inner.add(ctx.pixel(x, y).join(','))
    const ramp = valueRamp(VALUES).map((c) => [c.r, c.g, c.b].join(','))
    expect([...inner].every((c) => ramp.includes(c))).toBe(true)
  })

  it('is what renderTile calls for every study version', () => {
    for (const v of ['blurred', 'values', 'blurValues'] as const) {
      const s = tileStudyFor(v, { ...DEFAULT_STUDY, versions: [v] })
      expect(s).not.toBeNull()
    }
  })
})

/** Records the byte size of every typed array constructed while `fn` runs. */
function trackTypedArrayAllocations(fn: () => void): number[] {
  const names = [
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float32Array',
    'Float64Array',
  ] as const
  const g = globalThis as unknown as Record<string, object>
  const saved = names.map((n) => [n, g[n]] as const)
  const sizes: number[] = []
  try {
    for (const [name, ctor] of saved) {
      if (!ctor) continue
      g[name] = new Proxy(ctor, {
        construct(target, args, newTarget) {
          const view = Reflect.construct(target as new (...a: unknown[]) => ArrayBufferView, args, newTarget) as ArrayBufferView
          sizes.push(view.byteLength)
          return view
        },
      })
    }
    fn()
  } finally {
    for (const [name, ctor] of saved) if (ctor) g[name] = ctor
  }
  return sizes
}

type Rgb = [number, number, number]
interface FakeCtx extends PixelCtx {
  readonly reads: number[][]
  readonly writes: number[][]
  fill(f: (x: number, y: number) => Rgb): void
  pixel(x: number, y: number): Rgb
}

/** A tiny RGBA canvas with the three PixelCtx methods (node has no ImageData; a plain object suffices). */
function fakeCtx(w: number, h: number): FakeCtx {
  const buf = new Uint8ClampedArray(w * h * 4)
  const reads: number[][] = []
  const writes: number[][] = []
  const image = (iw: number, ih: number, data = new Uint8ClampedArray(iw * ih * 4)) =>
    ({ width: iw, height: ih, data, colorSpace: 'srgb' }) as unknown as ImageData
  return {
    reads,
    writes,
    fill(f) {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) buf.set([...f(x, y), 255], (y * w + x) * 4)
    },
    pixel(x, y) {
      const i = (y * w + x) * 4
      return [buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0]
    },
    getImageData(sx, sy, sw, sh) {
      reads.push([sx, sy, sw, sh])
      const out = new Uint8ClampedArray(sw * sh * 4)
      for (let y = 0; y < sh; y++)
        out.set(buf.subarray(((sy + y) * w + sx) * 4, ((sy + y) * w + sx + sw) * 4), y * sw * 4)
      return image(sw, sh, out)
    },
    createImageData(sw, sh) {
      return image(sw, sh)
    },
    putImageData(img, dx, dy) {
      writes.push([dx, dy])
      for (let y = 0; y < img.height; y++)
        buf.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((dy + y) * w + dx) * 4)
    },
  }
}
```

The allocation spy replaces the typed-array constructors on `globalThis` with `Proxy`s (so `instanceof` still works) only while `fn` runs. Module-level tables (`SRGB_TO_LINEAR`) are built at import time, before the spy. Allowed allocations: the blur's line buffer (4 · 1000 B) and the 4 KB histogram.

`src/features/studies/golden.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STUDY_VERSIONS, tileStudyFor, type StudySettings } from '../../shared/model/study'
import { applyStudy } from './apply-study'
import { lightnessRampImage } from './test-support/lightness'
import { noise, rgba } from './test-support/pixels'

/** FNV-1a (32-bit) over bytes, as 8 hex digits. */
function fnv1a(bytes: Uint8ClampedArray): string {
  let h = 0x811c9dc5
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const W = 96
const H = 64
const IMAGES: Record<string, () => Uint8ClampedArray> = {
  lightness: () => lightnessRampImage(W, H, 0.1, 0.95),
  checker: () => rgba(W, H, (x, y) => ((x >> 3) + (y >> 3)) % 2 === 0 ? [20, 40, 160] : [240, 200, 120]),
  noise: () => noise(W, H, 42),
  radial: () =>
    rgba(W, H, (x, y) => {
      const d = Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2)
      return [Math.round(255 * (1 - d)), Math.round(180 * d), 90]
    }),
}
const STUDY: StudySettings = {
  versions: [...STUDY_VERSIONS],
  blurPct: 40,
  values: { count: 5, hue: 55, neutral: false },
}

/**
 * Output stability: exact pixels for fixed inputs. Any change to the blur, the ramp, the range or
 * the binning fails here. Update the snapshot only for an intended change, and say so in the PR.
 */
describe('study outputs', () => {
  it('match the golden hashes', () => {
    const out: Record<string, string> = {}
    for (const [name, make] of Object.entries(IMAGES)) {
      for (const version of STUDY_VERSIONS) {
        const d = make()
        const s = tileStudyFor(version, STUDY)
        if (s) applyStudy(d, W, H, s)
        out[`${name}/${version}`] = fnv1a(d)
      }
    }
    expect(out).toMatchSnapshot()
  })
})
```

`src/features/studies/perf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyStudy } from './apply-study'
import { noise } from './test-support/pixels'

/** Local desktop target 60 ms (overview, Performance budgets); CI runners are slower and shared. */
const BOUND_MS = process.env.CI ? 300 : 120

describe('performance', () => {
  it('blur + values on a 1 MP tile', () => {
    const times: number[] = []
    for (let run = 0; run < 3; run++) {
      const d = noise(1000, 1000, run)
      const t0 = performance.now()
      applyStudy(d, 1000, 1000, { blurPct: 40, values: { count: 5, hue: 55, neutral: false } })
      times.push(performance.now() - t0)
    }
    const median = [...times].sort((a, b) => a - b)[1] ?? Infinity
    console.log(`applyStudy 1 MP blur+values: ${median.toFixed(1)} ms (median of 3)`)
    expect(median).toBeLessThan(BOUND_MS)
  }, 20_000)
})
```

(`process.env.CI` is set on GitHub Actions; the `unit` project runs in node, so `process` exists. If ESLint's node globals are not enabled for `src/**`, read it as `globalThis.process?.env.CI` with a local type.)

- [ ] **Step 3: Run and see them fail**

```bash
corepack pnpm vitest run --project unit src/features/studies/apply-study.test.ts src/features/studies/golden.test.ts src/features/studies/perf.test.ts
```

Expected: FAIL (`Cannot find module './apply-study'`). Paste into the PR.

- [ ] **Step 4: Implement**

`src/features/studies/apply-study.ts`:

```ts
import type { TileStudy } from '../../shared/model/study'
import type { PixelCtx } from '../render/pixels/bleed'
import type { TilePixelPlan } from '../render/pixels/tile-plan'
import { blurSigmaPx, gaussianBlurRGBA } from './blur'
import { lightnessRange, posterizeRGBA } from './posterize'
import { valueRamp } from './ramp'

/**
 * Apply one tile's study in place: blur (if any) first, then values (if any), as spec §2.6 says
 * ("Blur + Values applies the blur first"). The range is measured after the blur.
 */
export function applyStudy(data: Uint8ClampedArray, w: number, h: number, study: TileStudy): void {
  if (study.blurPct !== null) gaussianBlurRGBA(data, w, h, blurSigmaPx(study.blurPct, w, h))
  if (study.values !== null) {
    posterizeRGBA(data, w, h, valueRamp(study.values), lightnessRange(data, w, h))
  }
}

/**
 * The canvas step renderTile runs after drawing the oriented image and before extending the bleed
 * (M2-R5): only the outW × outH image area is processed, so the bleed then repeats studied pixels.
 */
export function applyStudyToContext(
  ctx: PixelCtx,
  plan: Pick<TilePixelPlan, 'bleedPx' | 'outW' | 'outH'>,
  study: TileStudy,
): void {
  const image = ctx.getImageData(plan.bleedPx, plan.bleedPx, plan.outW, plan.outH)
  applyStudy(image.data, plan.outW, plan.outH, study)
  ctx.putImageData(image, plan.bleedPx, plan.bleedPx)
}
```

Barrel line: `export { applyStudy, applyStudyToContext } from './apply-study'`.

- [ ] **Step 5: Run: PASS; review the golden snapshot**

```bash
corepack pnpm vitest run --project unit src/features/studies
corepack pnpm test:coverage
```

`src/features/studies/__snapshots__/golden.test.ts.snap` is new: 16 hashes. Check by eye that the four `…/original` hashes differ from each other and from their study versions (a study that does nothing would repeat the original hash). Record the perf line from the console in the PR.

- [ ] **Step 6: Verify, commit, PR**

```bash
corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test
git add -A && git commit -m "feat(studies): apply a study to tile pixels, with golden images

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/studies-apply
gh pr create --base master --title "feat(studies): apply a study to tile pixels, with golden images" --body "…"
```

---

## E2E coverage

Sub-plan A has no E2E: its code is pure and runs inside the workers B5 and C2 build. Browser-level proof belongs to sub-plan D:

- **D3 X-S1** (exit criterion, chromium + firefox + webkit): a 5-value tile embedded as PNG with exactly 5 colours from the ramp; the blurred tile is a JPEG; the three tiles are side by side.
- **D3:** notan (2 colours), neutral (r = g = b), blur + values (≤ N colours) parsed from real PDFs; these re-check A4's guarantees through canvas resampling in three engines.
- **D4:** the phone memory budget with studies on (M2-R10 at scale) and the preview timing (A5's node budget is the lower bound).

## Self-review

**Spec coverage.**
- §2.6 blur 1–100% scaled to image size (100% ≈ 5% of the short side): `BLUR_SIGMA_AT_MAX`, `blurSigmaPx`, pinned in A3; the short side is the printed tile's (M2-R6, owner Q12 default).
- §2.6 values 2–20, notan at 2: `MIN_VALUES`/`MAX_VALUES`, `sanitizeStudy` (A1), posterise tests incl. notan (A4).
- §2.6 one hue → ramp from near-black to its lightest tint, never paper: `valueRamp` (A4), D9 end points and R7 never-white tests.
- §2.6 lightness measured perceptually, N equal steps: `lightness8` (A2), `lightnessRange` + `valueIndex` (A4); the range choice is owner Q11 (default: the tile's own range, 1% clipped).
- §2.6 Blur + Values blurs first: `applyStudy` order test (A5).
- §2.5 PNG for value studies: `tileFormat` (A1); used by B5.
- §7 studies: average brightness (A3), exactly N colours (A4), monotonic ramp (A4).
- §4 pure core: no DOM anywhere in A; `apply-study.ts` imports render types only.
- §3 memory: in-place maths, allocation spy (A5); performance: node bound (A5).

**Placeholder scan.** The only `…` are the PR bodies, which the implementer fills from the PR template with the RED outputs and the notes each step names.

**Type consistency.** `StudyValues`, `TileStudy`, `Rgb8`, `LightnessRange` are defined once and imported everywhere; the barrel re-exports exactly the overview's names plus `HuePresetId`. `descriptor()` in render fixtures gains an optional `study` parameter that B4 uses. `applyStudyToContext`'s `plan` parameter is a `Pick` so B5 can pass a full `TilePixelPlan` and tests a literal.

## Contract change requests

- **A-CR1 (A1, i18n config) — accepted (controller, 2026-10-07):** the overview says A1 creates `src/locales/en/studies.json`, but `src/shared/i18n/locales.test.ts` requires the file set to equal `NAMESPACES` in `src/shared/i18n/languages.ts`. A1 therefore also appends `'studies'` to `NAMESPACES`. This is a one-line change to an M1-owned config file, outside the overview's "only the coverage include" exception. Recommendation: accept.
- **A-CR2 (Testing strategy wording) — accepted (controller, 2026-10-07):** the overview's testing strategy says blur keeps the average brightness "within 2 levels for any image (property)". With clamp-to-edge, a random noise image's mean can drift by more than 2 levels purely through edge re-weighting (the error is random with a standard deviation of about 1–2 levels at the sizes tested), so a fixed 2-level property would be flaky. A3 pins the exact guarantee instead: within 0.5 levels when the border ring is constant (spec §7's intent), and a provable bound `255 · 2 · reach · (1/w + 1/h) + 3` for any image. Recommendation: accept and update the overview's sentence.
- **A-CR3 (note for D1, no change) — noted:** `HUE_PRESETS[k].hue` is `null` for the neutral swatch. Selecting it sets `values.neutral = true` and keeps the current hue; selecting any other swatch sets its hue and `neutral = false`; the custom-hue slider always sets `neutral = false`.

## Open questions for the owner

None new. A implements these overview defaults, marked "(owner Qn, default)" in code comments and tests:

- **Q2** default blur 40%, **Q3** default 5 values, **Q4** default Sepia 55° → `DEFAULT_STUDY` (A1).
- **Q1** new images are Original only → `DEFAULT_STUDY.versions` (A1).
- **Q11** lightness range = the tile's own range with 1% clipped at each end → `VALUE_CLIP`, `lightnessRange` (A4). If the owner picks the fixed black-to-white scale instead, `lightnessRange` returns `{ lo: 0, hi: 1 }` and the "dark photo uses every value" test inverts; nothing else changes.
- **Q12** blur relative to the printed (cropped) tile → `blurSigmaPx` is called with the tile's `outW × outH` (A5); nothing in A knows the uncropped photo.
- **Q13** the last version cannot be turned off → `withVersion` (A1).
- **D9** ramp L 0.20 → 0.95 is tuned on the owner's sign-off print; changing it is a two-constant edit (`RAMP_L_DARK`, `RAMP_L_LIGHT`) plus the ramp and golden snapshots.
