# M2-B: Pipeline (study state, settings v2, layout groups, page model, PDF export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry per-image study settings from the image store through layout and the page model into the PDF. Each image keeps a `StudySettings`; "apply to all" copies it; the settings store remembers the study defaults (schema v2); the layout engine packs the selected versions of an image as one group; the page model assigns a version to every tile in reading order; the export renders each study tile from the same single full-resolution decode, applies the study before bleed, and embeds value studies as PNG.

**Architecture:** Five tasks, each a thin change to code M1 already structured for M2. `buildLayoutItems` sets `tiles` from the version count; the layout engine itself is untouched (it already packs groups). `buildPageModels` sorts each placement's tile rects into reading order and zips them with the image's versions, attaching `version` and `study: TileStudy | null` to every `DrawTile`. `tileRenderKey` gains the version and the study key, so the PDF composer, the export worker and the preview caches all distinguish versions without further changes. `renderTile` gains an optional study step between the oriented draw and the bleed. The export worker's `encodeTile` takes the study and the target format; `runExport`'s one-decode-per-image loop is unchanged.

**Tech Stack:** TypeScript 6 (strict, `noUncheckedIndexedAccess`), Zustand 5, Zod 4, Vitest 5 (`unit` node project), fast-check 4, `@pdfme/pdf-lib` (tests only via the composer and inspector), Comlink (unchanged wiring).

**Spec:** `docs/spec.md` §2.4 (study groups), §2.5 (PNG for value studies), §2.6, §2.9 (default study settings persisted), §3, §7. **Overview (binding):** `docs/superpowers/plans/2026-10-07-m2-overview.md` — rulings M2-R1…R5, R9, R10, R15, R17 and the Shared contracts "Layout (B3)", "Render (B4, B5)", "Images store (B1)", "Settings (B2)", "Preview studies" (the types-only `study-tiles.ts`, created here by B4). The M1 overview's contracts stay binding.

**Prerequisite:** Task **A1** is merged: `src/shared/model/study.ts` (all names in the overview contract, including `sanitizeStudy`, `studyEqual`, `withVersion`, `patchStudy`, `tileStudyFor`, `studyKey`, `tileFormat`, `DEFAULT_STUDY`, `STUDY_VERSIONS`), `ImageDescriptor.study`, `study: DEFAULT_STUDY` set in `loadOne` and in `selectImageDescriptors`, the test builders updated (`render/test-support/fixtures.ts` `descriptor()`, `layout/build-items.test.ts` `img()`, `images/store.test.ts`). **B5** additionally needs **A5** (`applyStudyToContext` in `src/features/studies/apply-study.ts`) and **B4**.

B adds **no** dependencies and edits no config. It does not touch `src/features/studies/**` (A, C, D), `PagePreview.tsx` / `render/preview/**` other than creating the types-only `study-tiles.ts` (C3 owns the rest), locale files, `src/app/**` or `e2e/**`.

## Global Constraints

Copied from the overview's "Global constraints for every M2 sub-plan":

- Follow `CLAUDE.md`: one worktree under `.worktrees/`, branch and PR per task; Conventional Commit PR titles (as listed per task); squash; the controller enables auto-merge after a clean review (ruling A-1). Implementers open PRs and never merge.
- Before every PR: `corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck && corepack pnpm test && corepack pnpm e2e --project=chromium` (E2E port range for B: 47xx, e.g. `E2E_PORT=4701` for B1). In this environment, `export ASDF_NODEJS_VERSION=24.14.0` first.
- TypeScript strict and `noUncheckedIndexedAccess`. No `any`. No non-null assertions without a comment.
- The pure core (`layout`, `render/page-model`, `render/pixels` plan maths, `render/pdf/compose`) has **no DOM access** and is tested in node.
- **Privacy:** images and anything derived from them are never persisted or sent. Only `studyDefaults` (numbers) joins the persisted settings.
- **i18n:** B adds no UI strings.
- **TDD:** every change is test-first; record the RED run (command + failing test names) in the PR description.
- **Mutation-checked reviews:** each task lists the mutations its reviewer applies; each must make at least one test fail.
- **No dependency or config changes** (M2-R17).
- Prettier: `semi: false`, `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`. ESLint `strictTypeChecked` + `stylisticTypeChecked`, zero warnings.

### Contract items this plan **consumes** (A1, verbatim from the overview)

```ts
// src/shared/model/study.ts
export const STUDY_VERSIONS = ['original', 'blurred', 'values', 'blurValues'] as const
export type StudyVersion = (typeof STUDY_VERSIONS)[number]
export interface StudyValues { readonly count: number; readonly hue: number; readonly neutral: boolean }
export interface StudySettings { readonly versions: readonly StudyVersion[]; readonly blurPct: number; readonly values: StudyValues }
export const MIN_BLUR_PCT = 1, MAX_BLUR_PCT = 100, MIN_VALUES = 2, MAX_VALUES = 20
export const DEFAULT_STUDY: StudySettings // { versions: ['original'], blurPct: 40, values: { count: 5, hue: 55, neutral: false } }
export function sanitizeStudy(study: StudySettings): StudySettings
export function studyEqual(a: StudySettings, b: StudySettings): boolean
export interface StudyPatch { readonly versions?: readonly StudyVersion[]; readonly blurPct?: number; readonly values?: Partial<StudyValues> }
export function patchStudy(study: StudySettings, patch: StudyPatch): StudySettings
export interface TileStudy { readonly blurPct: number | null; readonly values: StudyValues | null }
export function tileStudyFor(version: StudyVersion, study: StudySettings): TileStudy | null
export function studyKey(study: TileStudy | null): string
export function tileFormat(version: StudyVersion): 'jpeg' | 'png'
// src/shared/model/image.ts
export interface ImageDescriptor { id; contentHash; pxW; pxH; edits; readonly study: StudySettings }
// src/features/studies/apply-study.ts (A5, B5 only)
export function applyStudyToContext(ctx: PixelCtx, plan: Pick<TilePixelPlan, 'bleedPx' | 'outW' | 'outH'>, study: TileStudy): void
```

### Contract items this plan **produces** (verbatim from the overview)

```ts
// images store (B1)
updateStudy(id: ImageId, patch: StudyPatch): void
applyStudyToAll(fromId: ImageId): number
setDefaultStudy(study: StudySettings): void

// settings (B2)
export const SETTINGS_VERSION = 2
export type StudyDefaults = Omit<StudySettings, 'versions'>
// SettingsData.studyDefaults: StudyDefaults; SettingsState.setStudyDefaults(defaults: StudyDefaults): void

// layout (B3): buildLayoutItems sets tiles = image.study.versions.length

// render (B4)
export interface DrawTile { /* M1 fields */ readonly version: StudyVersion; readonly study: TileStudy | null }
export interface StudyGroupOutline { readonly imageId: ImageId; readonly block: RectMm }
export interface PageModel { /* M1 fields */ readonly groups: readonly StudyGroupOutline[] }
// tileRenderKey(tile, plan) appends `|${tile.version}|${studyKey(tile.study)}`
// src/features/render/preview/study-tiles.ts: StudyTileRequest, StudyTileProvider (types only)

// render (B5)
export function renderTile<C>(source, plan, createCanvas, study?: TileStudy | null): C
// ExportWorkerApi.encodeTile(key, plan, bitmap, study: TileStudy | null, format: 'jpeg' | 'png')
// WorkerEnv.encodePng(canvas): Promise<Uint8Array>
// PdfReport.images: readonly { filter: string; widthPx: number; heightPx: number; colours: number | null }[]  (object order)
// PdfReport.pages[i].draws: readonly { name: string; filter: string; widthPx: number; heightPx: number; colours: number | null }[]  (content-stream order, D-CR2)
```

## Review Focus

Five conditions real users will hit that the contract does not spell out. Each is pinned by a named test.

1. **Export memory with studies: one decode per image, whatever the versions and copies.** One photo with 4 versions and 2 copies has 8 tiles in 2 groups, possibly on 2 pages. Expected: `getSource(id).decode()` is called **once**, at most one full bitmap is alive, and every tile (4 distinct encodes: copies share keys) is encoded from it. Pinned in B5 (`run-export.test.ts` → `decodes each image once for 4 versions × 2 copies across two pages`).
2. **A study that throws inside the worker must not leak.** A throwing `applyStudyToContext` (e.g. a canvas that returns no ImageData on an old Safari) must release the tile canvas, close the transferred bitmap and reject the export as `failed`, not hang or keep 67 MB alive. Pinned in B5 (`render-tile.test.ts` → `releases the output canvas when the study step throws`; `run-export.test.ts` → `createExportWorkerApi closes the bitmap and releases the canvas when the study throws`).
3. **Stale layout racing a version toggle.** The user ticks "Values" while a layout computed for 1 tile is still in flight; the pipeline then builds page models from a layout whose placement has 1 tile while the image now has 2 versions. Expected: that placement is skipped (like a removed image) instead of drawing the wrong version or crashing on `versions[i] === undefined`; the next pipeline run fixes it. Pinned in B4 (`build-page-models.test.ts` → `skips a placement whose tile count no longer matches the versions`).
4. **Reading order for turned groups.** A turned column group places tile *i* i-th from the **right** (CR-B5). Without sorting, "Original" would print on the right. Expected: versions follow reading order — left→right, top→bottom — for row, column, turned row and turned column. Pinned in B4 (`assigns versions in reading order` — four hand-built placements; reviewer mutation: drop the sort → the turned-column case fails).
5. **Persisted settings from v0.1.0 users.** Every M1 user has a v1 envelope in `localStorage`. Expected: it loads with its page setup, unit, language and theme intact plus the default study defaults; a corrupt `studyDefaults` field never resets the page setup. Pinned in B2 (`store.test.ts` → `migrates a v1 envelope to v2 keeping every field`, `schema.test.ts` → `keeps the other fields when one study default is invalid`).

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `src/features/images/store.ts` (+ `store.test.ts`) | B1 | `updateStudy`, `applyStudyToAll`, `setDefaultStudy`; new imports take the default study |
| `src/features/settings/schema.ts` (+ `schema.test.ts`) | B2 | `StudyDefaults`, `studyDefaults` schema (total), `DEFAULT_SETTINGS.studyDefaults` |
| `src/features/settings/store.ts` (+ `store.test.ts`) | B2 | `SETTINGS_VERSION = 2`, `setStudyDefaults`, `partialize`, `reset` |
| `src/features/settings/index.ts` | B2 | export `StudyDefaults` |
| `src/features/layout/build-items.ts` (+ `build-items.test.ts`) | B3 | `tiles = study.versions.length` |
| `src/features/layout/types.ts` | B3 | comment on `tiles` |
| `src/features/layout/test-support/arbitraries.ts`, `compute-layout.property.test.ts`, `perf.test.ts` | B3 | groups up to 4 tiles; perf 50 × 4 |
| `src/features/render/types.ts` | B4 | `DrawTile.version`, `DrawTile.study`, `StudyGroupOutline`, `PageModel.groups` |
| `src/features/render/page-model/build-page-models.ts` (+ test, snapshot) | B4 | reading order, versions, groups, stale-count skip |
| `src/features/render/pixels/tile-plan.ts` (+ test) | B4 | `tileRenderKey` with version + study key |
| `src/features/render/preview/study-tiles.ts` | B4 | types only: `StudyTileRequest`, `StudyTileProvider` (C1 implements, C3 consumes) |
| `src/features/render/test-support/fixtures.ts` | B4 | `drawTile()` / `pageModel()` defaults for the new fields |
| `src/features/render/index.ts` | B4, B5 | barrel exports (page-model section, export section) |
| `src/features/render/pixels/render-tile.ts` (+ test) | B5 | optional study step before bleed |
| `src/features/render/export/run-export.ts`, `worker-api.ts`, `pdf.worker.ts` (+ `run-export.test.ts`) | B5 | study + format per job; `encodePng`; PNG encode |
| `src/features/render/pdf/inspect.ts` (+ `compose.test.ts`) | B5 | `images[]` (object order) and per-page `draws[]` (content-stream order, D-CR2) with filter, size, colour count |

Every file is inside a directory B owns per the overview, except `study-tiles.ts`, which the overview assigns to B4 as a types-only file so C1 and C3 can start in parallel.

## Parallelization

```
A1 ──┬─> B1 (images store)      ──────────────┐
     ├─> B2 (settings v2)       ──────────────┤  (D2 consumes B1, B2, B3)
     ├─> B3 (layout groups)     ──────────────┘
     └─> B4 (page model, keys, study-tiles.ts) ──┬─> C1, C3 (sub-plan C)
                                                 └─> B5 (with A5) ──> C2 (sub-plan C)
```

- **B1, B2, B3 and B4 run in parallel** right after A1 merges, in four worktrees (`.worktrees/m2-b1` … `m2-b4`). They touch disjoint files.
- **B4 is on the critical path** for sub-plan C: C1 and C3 import `study-tiles.ts` and the new `DrawTile` fields. Merge B4 as soon as it is clean.
- **B5** waits for **A5** (`applyStudyToContext`) and **B4** (new `DrawTile` fields, `tileRenderKey`). It is on the overview's critical path (A1 → A3 → A5 → B5 → C2 → D2).
- `src/features/render/index.ts` is edited by B4 then B5 (then C3), each appending in its existing section (`// --- Page model ---`, `// --- Export ---`); rebase before merging.
- `src/features/render/test-support/fixtures.ts`: A1 adds `study` to `descriptor()`; B4 adds the `drawTile()` / `pageModel()` defaults. B4 rebases on A1 (it already depends on it).

---

### Task B1: Study settings per image, "apply to all" and the import default

**Branch:** `feat/images-study-state` · **PR title:** `feat(images): keep study settings per image, with apply to all` · **Depends on:** A1

**Files:**
- Modify: `src/features/images/store.ts`
- Test: `src/features/images/store.test.ts`

**Interfaces:**
- Consumes (A1): `StudySettings`, `StudyPatch`, `DEFAULT_STUDY`, `patchStudy`, `sanitizeStudy`, `studyEqual` from `shared/model/study`; `ImageDescriptor.study` (A1 already sets `study: DEFAULT_STUDY` in `loadOne` and copies it in `selectImageDescriptors`).
- Produces: `ImagesState.updateStudy(id, patch)`, `ImagesState.applyStudyToAll(fromId): number`, `ImagesState.setDefaultStudy(study)`.

Design notes:
- The default study is a closure variable of `createImagesStore`, not store state: nothing renders from it, and it must not trigger a re-render or a pipeline run. It is read when an image is **created** (inside the `set` that inserts it), so an import that finishes after the user changed the defaults gets the new defaults.
- `updateStudy` and `applyStudyToAll` return the **same state object** when nothing changes (so `selectImageDescriptors` stays memoised and the pipeline does not re-run).
- `applyStudyToAll` copies the **whole** `StudySettings`, versions included (overview contract, owner Q6, default). It never touches `edits`. It returns the number of images whose study changed (the source image is never counted), which D1 announces.
- The images feature never imports the settings store (overview: Images store).

- [ ] **Step 1: Create the worktree** (after A1 has merged)

```bash
git fetch && git worktree add .worktrees/m2-b1 -b feat/images-study-state origin/master
cd .worktrees/m2-b1 && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Write the failing tests.** Append to `src/features/images/store.test.ts` (reuse its `setup()` and `file()` helpers):

```ts
import { DEFAULT_STUDY, type StudySettings } from '../../shared/model/study'

const BLUR_VALUES: StudySettings = {
  versions: ['original', 'blurred', 'values'],
  blurPct: 70,
  values: { count: 3, hue: 200, neutral: false },
}

/** Narrow `T | undefined` without a non-null assertion. */
function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a value')
  return v
}

describe('study settings', () => {
  it('starts every imported image with DEFAULT_STUDY', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    expect(store.getState().images[0]?.study).toEqual(DEFAULT_STUDY)
  })

  it('updateStudy patches one image and leaves its edits and the others alone', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    const [a, b] = store.getState().images
    store.getState().updateStudy(must(a).id, { versions: ['original', 'blurred'], values: { count: 7 } })
    const [a2, b2] = store.getState().images
    expect(a2?.study).toEqual({
      versions: ['original', 'blurred'],
      blurPct: DEFAULT_STUDY.blurPct,
      values: { ...DEFAULT_STUDY.values, count: 7 },
    })
    expect(a2?.edits).toBe(a?.edits)
    expect(b2).toBe(b)
  })

  it('updateStudy sanitizes (canonical order, clamps) through patchStudy', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const id = store.getState().images[0]?.id as ImageId
    store.getState().updateStudy(id, { versions: ['values', 'original'], blurPct: 400 })
    expect(store.getState().images[0]?.study.versions).toEqual(['original', 'values'])
    expect(store.getState().images[0]?.study.blurPct).toBe(100)
  })

  it('updateStudy keeps the same state object when nothing changes (descriptors stay memoised)', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const id = store.getState().images[0]?.id as ImageId
    const before = store.getState().images
    const descriptors = selectImageDescriptors(store.getState())
    store.getState().updateStudy(id, { blurPct: DEFAULT_STUDY.blurPct })
    expect(store.getState().images).toBe(before)
    expect(selectImageDescriptors(store.getState())).toBe(descriptors)
  })

  it('updateStudy ignores an unknown id', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const before = store.getState().images
    store.getState().updateStudy('nope' as ImageId, { blurPct: 10 })
    expect(store.getState().images).toBe(before)
  })

  it('descriptors carry the new study after updateStudy', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const id = store.getState().images[0]?.id as ImageId
    store.getState().updateStudy(id, { versions: ['original', 'values'] })
    expect(selectImageDescriptors(store.getState())[0]?.study.versions).toEqual([
      'original',
      'values',
    ])
  })
})

describe('applyStudyToAll (owner Q6, default: versions included)', () => {
  it('copies the whole study, versions included, to every image and returns how many changed', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')])
    const [a, , c] = store.getState().images
    store.getState().updateStudy(must(a).id, BLUR_VALUES)
    store.getState().updateStudy(must(c).id, BLUR_VALUES) // already matches: not counted
    const changed = store.getState().applyStudyToAll(must(a).id)
    expect(changed).toBe(1)
    for (const img of store.getState().images) expect(img.study).toEqual(BLUR_VALUES)
  })

  it('never touches edits', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    const [a, b] = store.getState().images
    store.getState().updateEdits(must(b).id, { copies: 3, rotation: 90 })
    store.getState().updateStudy(must(a).id, BLUR_VALUES)
    store.getState().applyStudyToAll(must(a).id)
    const b2 = store.getState().images[1]
    expect(b2?.edits.copies).toBe(3)
    expect(b2?.edits.rotation).toBe(90)
  })

  it('returns 0 and keeps the state object when nothing changes or the source is unknown', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    const before = store.getState().images
    expect(store.getState().applyStudyToAll(must(before[0]).id)).toBe(0) // all DEFAULT_STUDY already
    expect(store.getState().applyStudyToAll('nope' as ImageId)).toBe(0)
    expect(store.getState().images).toBe(before)
  })
})

describe('setDefaultStudy', () => {
  it('gives the default to images imported afterwards, not to existing ones', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    store.getState().setDefaultStudy(BLUR_VALUES)
    await store.getState().addFiles([file('b.jpg')])
    const [a, b] = store.getState().images
    expect(a?.study).toEqual(DEFAULT_STUDY)
    expect(b?.study).toEqual(BLUR_VALUES)
  })

  it('applies to an import that was already decoding when the default changed', async () => {
    let release!: (d: DecodedImage) => void
    const { store } = setup({
      decode: () =>
        new Promise<DecodedImage>((r) => {
          release = r
        }),
    })
    const p = store.getState().addFiles([file('slow.jpg')])
    await Promise.resolve()
    store.getState().setDefaultStudy(BLUR_VALUES)
    release(decoded())
    await p
    expect(store.getState().images[0]?.study).toEqual(BLUR_VALUES)
  })

  it('sanitizes the default', async () => {
    const { store } = setup()
    store.getState().setDefaultStudy({ ...BLUR_VALUES, versions: [], blurPct: 0 })
    await store.getState().addFiles([file('a.jpg')])
    expect(store.getState().images[0]?.study.versions).toEqual(['original'])
    expect(store.getState().images[0]?.study.blurPct).toBe(1)
  })
})
```

Note for the implementer: the "already decoding" test needs the decode gate to resolve **inside** `limit(...)`; if the deferred resolves before `hash`, add `await Promise.resolve()` ticks exactly as the existing "keeps input order" test does.

- [ ] **Step 3: Run the tests — RED**

```bash
corepack pnpm vitest run src/features/images/store.test.ts
```

Expected: the new tests fail with `updateStudy is not a function` (and the `setDefaultStudy` ones likewise). Record the failing names in the PR.

- [ ] **Step 4: Implement.** In `src/features/images/store.ts`:

```ts
import {
  DEFAULT_STUDY,
  patchStudy,
  sanitizeStudy,
  studyEqual,
  type StudyPatch,
  type StudySettings,
} from '../../shared/model/study'

export interface ImagesState {
  // …existing members…
  /** Patch one image's study settings (sanitized). No-op (same state) when nothing changes. */
  updateStudy(id: ImageId, patch: StudyPatch): void
  /** Copy `fromId`'s whole StudySettings (versions included) to every image. Returns how many changed. */
  applyStudyToAll(fromId: ImageId): number
  /** Study settings for images created from now on. Not persisted here; the app syncs it from settings. */
  setDefaultStudy(study: StudySettings): void
}
```

Inside `createImagesStore`, next to `let generation = 0`:

```ts
  let defaultStudy: StudySettings = DEFAULT_STUDY
```

In `loadOne`, the `LoadedImage` literal is built **inside** the `set((s) => …)` callback's closure time, so it reads the latest default. Change A1's `study: DEFAULT_STUDY` to:

```ts
          study: defaultStudy,
```

and move the `const image: LoadedImage = { … }` construction to immediately before `order.set(id, seq)` if A1 placed it earlier (it must read `defaultStudy` after the decode has finished).

New actions in the returned object:

```ts
      updateStudy: (id, patch) => {
        set((s) => {
          let changed = false as boolean
          const images = s.images.map((img) => {
            if (img.id !== id) return img
            const study = patchStudy(img.study, patch)
            if (studyEqual(study, img.study)) return img
            changed = true
            return { ...img, study }
          })
          return changed ? { images } : s
        })
      },

      applyStudyToAll: (fromId) => {
        const source = get().images.find((i) => i.id === fromId)
        if (!source) return 0
        const study = source.study
        let count = 0
        const images = get().images.map((img) => {
          if (studyEqual(img.study, study)) return img
          count += 1
          return { ...img, study }
        })
        if (count > 0) set({ images })
        return count
      },

      setDefaultStudy: (study) => {
        defaultStudy = sanitizeStudy(study)
      },
```

`selectImageDescriptors` already copies `study` (A1). The `descriptorCache` is keyed by `LoadedImage` object identity, and both actions create new objects for changed images only, so unchanged descriptors keep their identity.

- [ ] **Step 5: Run the tests — GREEN**, then the full gate:

```bash
corepack pnpm vitest run src/features/images
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

- [ ] **Step 6: Commit and open the PR**

```bash
git add src/features/images/store.ts src/features/images/store.test.ts
git commit -m "feat(images): keep study settings per image, with apply to all

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/images-study-state
gh pr create --base master --title "feat(images): keep study settings per image, with apply to all" --body "<summary, RED run, owner Q6 default noted>"
```

**Reviewer mutations (each must fail a test):**
1. `applyStudyToAll` copies `{ ...img.study, blurPct, values }` but not `versions` → "copies the whole study, versions included" fails.
2. `updateStudy` always returns `{ images }` → "keeps the same state object" fails.
3. `loadOne` captures `defaultStudy` at job planning time (in `run`) instead of at creation → "already decoding" fails.
4. `setDefaultStudy` stores the raw value → "sanitizes the default" fails.
5. `applyStudyToAll` counts the source image → the `toBe(1)` assertion fails.

---

### Task B2: Persist study defaults (settings schema v2)

**Branch:** `feat/settings-study-defaults` · **PR title:** `feat(settings): persist study defaults (schema v2)` · **Depends on:** A1

**Files:**
- Modify: `src/features/settings/schema.ts`, `src/features/settings/store.ts`, `src/features/settings/index.ts`
- Test: `src/features/settings/schema.test.ts`, `src/features/settings/store.test.ts`

**Interfaces:**
- Consumes (A1): `StudySettings`, `DEFAULT_STUDY`, `MIN_BLUR_PCT`, `MAX_BLUR_PCT`, `MIN_VALUES`, `MAX_VALUES`, `sanitizeStudy`.
- Produces: `StudyDefaults`, `SettingsData.studyDefaults`, `DEFAULT_SETTINGS.studyDefaults`, `SETTINGS_VERSION = 2`, `SettingsState.setStudyDefaults`.

Design notes:
- **Owner Q5, default:** blur %, value count, hue and neutral persist; versions do not (`StudyDefaults = Omit<StudySettings, 'versions'>`). If the owner answers "remember versions too", this task adds `versions` to the type and the schema (`z.array(z.enum(STUDY_VERSIONS)).catch(['original'])` followed by `sanitizeStudy`) — nothing else changes.
- The schema stays **total**: every study field has its own `.catch`, so one bad value never discards the rest (M1 rule).
- `migrate` stays `parseSettings`: the v1 → v2 migration is "parse the v1 object; missing `studyDefaults` takes the default". No special v1 branch is needed, and none is added (a test pins the behaviour instead).
- Values are sanitized through `sanitizeStudy` after parsing, so a hue of 360 becomes 0 and a fractional count is rounded exactly as the image store does.

- [ ] **Step 1: Create the worktree** (after A1 has merged)

```bash
git fetch && git worktree add .worktrees/m2-b2 -b feat/settings-study-defaults origin/master
cd .worktrees/m2-b2 && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Write the failing schema tests.** Append to `src/features/settings/schema.test.ts`:

```ts
import { DEFAULT_STUDY } from '../../shared/model/study'

describe('studyDefaults', () => {
  const D = { blurPct: DEFAULT_STUDY.blurPct, values: DEFAULT_STUDY.values }

  it('defaults to DEFAULT_STUDY without versions (owner Q5, default)', () => {
    expect(DEFAULT_SETTINGS.studyDefaults).toEqual(D)
    expect('versions' in DEFAULT_SETTINGS.studyDefaults).toBe(false)
  })

  it('fills in the defaults when the field is missing (a v1 object)', () => {
    const v1 = { pageSetup: DEFAULT_SETTINGS.pageSetup, unit: 'in', language: 'en', theme: 'dark' }
    expect(parseSettings(v1)).toEqual({ ...v1, studyDefaults: D })
  })

  it('accepts valid study defaults unchanged', () => {
    const studyDefaults = { blurPct: 12, values: { count: 9, hue: 265, neutral: true } }
    expect(parseSettings({ ...DEFAULT_SETTINGS, studyDefaults }).studyDefaults).toEqual(
      studyDefaults,
    )
  })

  it('keeps the other fields when one study default is invalid', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      unit: 'in',
      studyDefaults: { blurPct: 'lots', values: { count: 9, hue: 265, neutral: false } },
    })
    expect(parsed.unit).toBe('in')
    expect(parsed.studyDefaults).toEqual({
      blurPct: DEFAULT_STUDY.blurPct,
      values: { count: 9, hue: 265, neutral: false },
    })
  })

  it('falls back field by field inside values', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      studyDefaults: { blurPct: 30, values: { count: 99, hue: 'teal', neutral: 'yes' } },
    })
    expect(parsed.studyDefaults).toEqual({ blurPct: 30, values: DEFAULT_STUDY.values })
  })

  it('normalises like the image store (hue mod 360, rounding)', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      studyDefaults: { blurPct: 33.6, values: { count: 4.4, hue: 360, neutral: false } },
    })
    expect(parsed.studyDefaults).toEqual({ blurPct: 34, values: { count: 4, hue: 0, neutral: false } })
  })

  it('drops a stored versions field (not persisted, owner Q5)', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      studyDefaults: { ...D, versions: ['original', 'values'] },
    })
    expect(parsed.studyDefaults).toEqual(D)
  })

  it('never throws on any study defaults value (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (studyDefaults) => {
        const parsed = parseSettings({ ...DEFAULT_SETTINGS, studyDefaults })
        expect(parsed.studyDefaults.values.count).toBeGreaterThanOrEqual(2)
        expect(parsed.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
      }),
    )
  })
})
```

The existing test `accepts valid settings unchanged` builds a v1-shaped object; update its `valid` literal to include `studyDefaults: { blurPct: 20, values: { count: 6, hue: 135, neutral: false } }` so it still asserts "unchanged".

- [ ] **Step 3: Write the failing store tests.** Append to `src/features/settings/store.test.ts` (reuse `memoryStorage` and `saved`):

```ts
import { DEFAULT_STUDY } from '../../shared/model/study'

describe('study defaults (schema v2)', () => {
  it('is version 2', () => {
    expect(SETTINGS_VERSION).toBe(2)
  })

  it('migrates a v1 envelope to v2 keeping every field', () => {
    const v1 = {
      pageSetup: { ...DEFAULT_SETTINGS.pageSetup, paper: 'Letter', safeAreaMm: 7 },
      unit: 'in',
      language: 'en',
      theme: 'dark',
    }
    const storage = memoryStorage(JSON.stringify({ version: 1, state: v1 }))
    const s = createSettingsStore(storage).getState()
    expect(s.pageSetup).toEqual(v1.pageSetup)
    expect(s.unit).toBe('in')
    expect(s.language).toBe('en')
    expect(s.theme).toBe('dark')
    expect(s.studyDefaults).toEqual({ blurPct: DEFAULT_STUDY.blurPct, values: DEFAULT_STUDY.values })
  })

  it('setStudyDefaults persists blur and values, sanitized, under version 2', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setStudyDefaults({ blurPct: 250, values: { count: 7, hue: 420, neutral: false } })
    expect(store.getState().studyDefaults).toEqual({
      blurPct: 100,
      values: { count: 7, hue: 60, neutral: false },
    })
    const env = saved(storage)
    expect(env.version).toBe(2)
    expect(env.state.studyDefaults).toEqual(store.getState().studyDefaults)
  })

  it('persists nothing but the four M1 fields and studyDefaults', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setStudyDefaults({ blurPct: 10, values: DEFAULT_STUDY.values })
    expect(Object.keys(saved(storage).state).sort()).toEqual(
      ['language', 'pageSetup', 'studyDefaults', 'theme', 'unit'],
    )
  })

  it('reloads the saved study defaults', () => {
    const storage = memoryStorage()
    createSettingsStore(storage)
      .getState()
      .setStudyDefaults({ blurPct: 15, values: { count: 3, hue: 195, neutral: true } })
    expect(createSettingsStore(storage).getState().studyDefaults).toEqual({
      blurPct: 15,
      values: { count: 3, hue: 195, neutral: true },
    })
  })

  it('reset restores the default study defaults', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setStudyDefaults({ blurPct: 15, values: DEFAULT_STUDY.values })
    store.getState().reset()
    expect(store.getState().studyDefaults).toEqual(DEFAULT_SETTINGS.studyDefaults)
  })

  it('keeps the same state when setStudyDefaults gets equal values (no storage write churn)', () => {
    const store = createSettingsStore(memoryStorage())
    const before = store.getState().studyDefaults
    store.getState().setStudyDefaults({ ...before, values: { ...before.values } })
    expect(store.getState().studyDefaults).toBe(before)
  })
})
```

Existing store tests that save `{ version: 1, state: … }` keep working (that is the migration path); do not rewrite them to version 2.

- [ ] **Step 4: Run — RED**

```bash
corepack pnpm vitest run src/features/settings
```

Expected failures: `studyDefaults` undefined, `SETTINGS_VERSION` is 1, `setStudyDefaults is not a function`.

- [ ] **Step 5: Implement the schema.** In `src/features/settings/schema.ts`:

```ts
import {
  DEFAULT_STUDY,
  MAX_BLUR_PCT,
  MAX_VALUES,
  MIN_BLUR_PCT,
  MIN_VALUES,
  sanitizeStudy,
  type StudySettings,
} from '../../shared/model/study'

/** Owner Q5 (default): blur %, value count and hue are remembered; versions are not. */
export type StudyDefaults = Omit<StudySettings, 'versions'>

export interface SettingsData {
  readonly pageSetup: PageSetup
  readonly unit: Unit
  readonly language: LanguageCode | null
  readonly theme: Theme
  readonly studyDefaults: StudyDefaults
}

const DS: StudyDefaults = { blurPct: DEFAULT_STUDY.blurPct, values: DEFAULT_STUDY.values }

export const DEFAULT_SETTINGS: SettingsData = {
  pageSetup: DEFAULT_PAGE_SETUP,
  unit: 'mm',
  language: null,
  theme: 'auto',
  studyDefaults: DS,
}

/** Total, like pageSetupSchema: every field falls back on its own. Unknown keys (e.g. versions) are stripped. */
const studyDefaultsSchema = z.object({
  blurPct: z.number().min(MIN_BLUR_PCT).max(MAX_BLUR_PCT).catch(DS.blurPct),
  values: z
    .object({
      count: z.number().min(MIN_VALUES).max(MAX_VALUES).catch(DS.values.count),
      hue: z.number().min(0).max(360).catch(DS.values.hue),
      neutral: z.boolean().catch(DS.values.neutral),
    })
    .catch(DS.values),
})

/** Round/normalise exactly like the image store (sanitizeStudy), dropping versions again. */
export function normalizeStudyDefaults(d: StudyDefaults): StudyDefaults {
  const s = sanitizeStudy({ ...d, versions: DEFAULT_STUDY.versions })
  return { blurPct: s.blurPct, values: s.values }
}
```

Add `studyDefaults: studyDefaultsSchema.catch(DS)` to `settingsSchema`, and in `parseSettings` return `{ ...parsed, pageSetup, studyDefaults: normalizeStudyDefaults(parsed.studyDefaults) }`.

Check (and pin with the "normalises" test) that Zod's `z.object` strips the unknown `versions` key; if Zod 4's default is not stripping in this config, build the result explicitly as `{ blurPct, values }`.

- [ ] **Step 6: Implement the store.** In `src/features/settings/store.ts`:

```ts
export const SETTINGS_VERSION = 2

export interface SettingsState extends SettingsData {
  // …existing…
  /** Remember the last-used study settings (owner Q5, default). Sanitized; same state when equal. */
  setStudyDefaults(defaults: StudyDefaults): void
}
```

In the store body:

```ts
        setStudyDefaults: (defaults) => {
          set((state) => {
            const next = normalizeStudyDefaults(defaults)
            const cur = state.studyDefaults
            const equal =
              next.blurPct === cur.blurPct &&
              next.values.count === cur.values.count &&
              next.values.hue === cur.values.hue &&
              next.values.neutral === cur.values.neutral
            return equal ? state : { studyDefaults: next }
          })
        },
```

`partialize` adds `studyDefaults`. Update the `migrate` comment: "Runs for v1 (M1) and any other version: `parseSettings` keeps every v1 field and fills `studyDefaults` with the default; there is no other format to convert." `reset` already spreads `DEFAULT_SETTINGS`. Export `StudyDefaults` and `normalizeStudyDefaults` from `src/features/settings/index.ts`.

- [ ] **Step 7: GREEN, then the full gate** (the E2E `privacy.spec.ts` P2 checks storage size and keys; run it):

```bash
corepack pnpm vitest run src/features/settings
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
E2E_PORT=4702 corepack pnpm e2e --project=chromium e2e/privacy.spec.ts e2e/app-shell.spec.ts
```

If P2 asserts an exact list of persisted keys, it fails here: that spec is D-owned, so do not edit it; note it in the PR and the controller forwards it to D3 (which extends P2 anyway). If it asserts only a size bound, it passes.

- [ ] **Step 8: Commit and PR** (`feat(settings): persist study defaults (schema v2)`), body noting owner Q5's default and that the v1 → v2 migration is pinned by test.

**Reviewer mutations:**
1. `studyDefaults: studyDefaultsSchema` without `.catch(DS)` and a non-object stored value → the property test throws.
2. Remove `.catch` on `blurPct` → "keeps the other fields when one study default is invalid" fails.
3. Keep `SETTINGS_VERSION = 1` → "is version 2" and the persisted version assertion fail.
4. Drop `studyDefaults` from `partialize` → "reloads the saved study defaults" fails.
5. Skip `normalizeStudyDefaults` → "normalises like the image store" fails.

---

### Task B3: Pack the study versions of an image as one group

**Branch:** `feat/layout-study-groups` · **PR title:** `feat(layout): pack the study versions of an image as one group` · **Depends on:** A1

**Files:**
- Modify: `src/features/layout/build-items.ts`, `src/features/layout/types.ts` (comment only), `src/features/layout/test-support/arbitraries.ts`, `src/features/layout/perf.test.ts`
- Test: `src/features/layout/build-items.test.ts`, `src/features/layout/compute-layout.property.test.ts`, `src/features/layout/compute-layout.test.ts`
- Must **not** change: `src/features/layout/__snapshots__/golden.test.ts.snap` (proves M2-R2: Original-only layouts are byte-identical to M1)

**Interfaces:**
- Consumes (A1): `ImageDescriptor.study`, `DEFAULT_STUDY`, `StudySettings`.
- Produces: `buildLayoutItems` with `tiles = image.study.versions.length` (overview "Layout (B3)").

Design notes (rulings M2-R2, M2-R3):
- The engine already packs groups (`tiles ≥ 1`, row for tile aspect ≤ 1, column otherwise, gutter between tiles, one page per group). B3 changes one line of production code and widens the tests to the M2 range (1–4 tiles).
- Keys stay `${contentHash}~${occurrence}#${copy}`. A version toggle changes `tiles`, not the key, so sort order and tie-breaks are unchanged.
- Copies × versions: each copy is its own group of `versions.length` tiles (M2-R2, owner Q16, default).
- Sizes are per tile: `maxPrintWidthMm` and a fixed `size` apply to each tile; a group too large for the content box is scaled down as a whole and flagged `scaled-to-fit` (M2-R3, owner Q15, default). This is existing engine behaviour; B3 pins it with examples.

- [ ] **Step 1: Create the worktree** (after A1 has merged)

```bash
git fetch && git worktree add .worktrees/m2-b3 -b feat/layout-study-groups origin/master
cd .worktrees/m2-b3 && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Write the failing `buildLayoutItems` tests.** In `src/features/layout/build-items.test.ts`, extend the `img()` builder (A1 gave it `study: DEFAULT_STUDY`) with an optional `versions` argument via a second builder, and add:

```ts
import { DEFAULT_STUDY, type StudyVersion } from '../../shared/model/study'

const withVersions = (d: ImageDescriptor, versions: readonly StudyVersion[]): ImageDescriptor => ({
  ...d,
  study: { ...DEFAULT_STUDY, versions },
})

describe('buildLayoutItems study groups (M2-R2)', () => {
  it('makes one tile per selected version', () => {
    const items = buildLayoutItems([
      withVersions(img('a', 3000, 2000), ['original']),
      withVersions(img('b', 3000, 2000), ['original', 'blurred', 'values']),
      withVersions(img('c', 3000, 2000), ['original', 'blurred', 'values', 'blurValues']),
    ])
    expect(items.map((i) => i.tiles)).toEqual([1, 3, 4])
  })

  it('keeps the key, aspect and cap of a one-tile item (versions change only tiles)', () => {
    const [one] = buildLayoutItems([img('a', 3000, 2000)])
    const [three] = buildLayoutItems([withVersions(img('a', 3000, 2000), ['original', 'blurred', 'values'])])
    expect(three).toEqual({ ...one, tiles: 3 })
  })

  it('repeats the whole group per copy (owner Q16, default)', () => {
    const items = buildLayoutItems([
      withVersions(img('a', 3000, 2000, { copies: 2 }), ['original', 'values']),
    ])
    expect(items.map((i) => [i.key, i.tiles])).toEqual([
      ['h-a~0#0', 2],
      ['h-a~0#1', 2],
    ])
  })

  it('a version that is not the original still counts (values only → 1 tile)', () => {
    const [item] = buildLayoutItems([withVersions(img('a', 3000, 2000), ['values'])])
    expect(item?.tiles).toBe(1)
  })
})
```

- [ ] **Step 3: Write the failing engine examples.** Append to `src/features/layout/compute-layout.test.ts` (use `item()` from `test-support/fixtures` — its 5th argument is `tiles`):

```ts
describe('study groups (M2-R3, owner Q15 default)', () => {
  it('prints a fixed width per tile: three 60 mm tiles side by side', () => {
    const r = computeLayout(DEFAULT_PAGE_SETUP, [
      item('a', 2 / 3, 1000, { kind: 'fixed', axis: 'width', mm: 60 }, 3),
    ])
    const [p] = r.pages[0]?.placements ?? []
    expect(p?.tiles).toHaveLength(3)
    for (const t of p?.tiles ?? []) expect(p?.turned ? t.h : t.w).toBeCloseTo(60, 9)
    expect(p?.warnings).not.toContain('scaled-to-fit')
  })

  it('scales a group that does not fit as a whole, every tile the same size, and flags it', () => {
    const r = computeLayout(DEFAULT_PAGE_SETUP, [
      item('a', 2 / 3, 1000, { kind: 'fixed', axis: 'width', mm: 150 }, 4),
    ])
    const [p] = r.pages[0]?.placements ?? []
    expect(p?.warnings).toContain('scaled-to-fit')
    const widths = (p?.tiles ?? []).map((t) => (p?.turned ? t.h : t.w))
    expect(new Set(widths.map((w) => w.toFixed(9))).size).toBe(1)
    expect(widths[0]).toBeLessThan(150)
  })

  it('keeps a 4-tile group on one page with exactly the gutter between its tiles', () => {
    const g = DEFAULT_PAGE_SETUP.gutter.mm
    const r = computeLayout(DEFAULT_PAGE_SETUP, [item('a', 2 / 3, 1000, { kind: 'auto' }, 4)])
    const tiles = r.pages[0]?.placements[0]?.tiles ?? []
    expect(tiles).toHaveLength(4)
    const sorted = [...tiles].sort((s, t) => s.y - t.y || s.x - t.x)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const cur = sorted[i]
      if (!prev || !cur) continue
      const gap = Math.abs(cur.y - prev.y) < 1e-6 ? cur.x - (prev.x + prev.w) : cur.y - (prev.y + prev.h)
      expect(gap).toBeCloseTo(g, 9)
    }
  })
})
```

- [ ] **Step 4: Widen the property tests to 4 tiles.** In `test-support/arbitraries.ts`, the items arbitrary takes `maxTiles` (currently called with 3 for "M2 groups"); change its default and the doc comment to 4 (`tiles up to 4: the M2 versions`). In `compute-layout.property.test.ts`, make sure at least one property runs `expectLayoutInvariants` with `maxTiles = 4` (if the arbitrary is called with an explicit 3 there, change it to 4). `expectLayoutInvariants` already checks "groups on one page", the gutter and containment for every tile.

- [ ] **Step 5: Add the perf case.** In `src/features/layout/perf.test.ts`, add after `denseGroupItems`:

```ts
/** M2: 50 photos, each with all four study versions (the largest groups the UI can make). */
function fourVersionItems(seed: number): LayoutItemInput[] {
  const rnd = mulberry32(seed)
  const aspects = [1.5, 2 / 3, 1, 4 / 3, 3 / 4]
  return Array.from({ length: 50 }, (_, i) =>
    item(key(i), aspects[Math.floor(rnd() * aspects.length)] ?? 1, 300 + rnd() * 700, { kind: 'auto' }, 4),
  )
}
```

and two cases in the table: `['A4 auto, 50 photos × 4 versions', DEFAULT_PAGE_SETUP, fourVersionItems(7)]` and `['A3 auto, 50 photos × 4 versions', { ...DEFAULT_PAGE_SETUP, paper: 'A3' }, fourVersionItems(8)]`. The CI bound stays `CI_BOUND_MS = 2000` (spec budget 500 ms on a desktop); record the local times in the PR.

- [ ] **Step 6: Run — RED** for Step 2 (tiles are all 1):

```bash
corepack pnpm vitest run src/features/layout/build-items.test.ts
```

Steps 3–5 test existing engine behaviour and are expected to pass before the change (they pin it); if one fails, stop and report — that is an engine bug the overview did not plan for, not something to "fix" in B3.

- [ ] **Step 7: Implement.** In `src/features/layout/build-items.ts`:

```ts
    const copies = clampCopies(image.edits.copies)
    // One tile per selected study version (M2-R2); versions are sanitized non-empty, the max() is a guard.
    const tiles = Math.max(1, image.study.versions.length)
    for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
      items.push({
        key: `${image.contentHash}~${String(occurrence)}#${String(copyIndex)}`,
        imageId: image.id,
        aspect: pxW / pxH,
        maxPrintWidthMm: maxPrintMm(pxW),
        size: image.edits.size,
        tiles,
      })
    }
```

In `src/features/layout/types.ts`, the `LayoutItemInput` doc becomes `/** One layout unit: one copy of an image, with one tile per selected study version (M2). */` and the `tiles` comment `// ≥ 1: the image's selected study versions; tiles of a group are placed side by side (row or column), separated by the gutter`.

- [ ] **Step 8: GREEN and the golden check**

```bash
corepack pnpm vitest run src/features/layout
```

`golden.test.ts` must pass **without** `-u`. If it fails, the change altered a 1-tile layout — revert and investigate; never update the snapshot in this task.

- [ ] **Step 9: Full gate, commit, PR** (`feat(layout): pack the study versions of an image as one group`). In the PR body: the perf numbers, "golden snapshot unchanged", owner Q15/Q16 defaults.

**Reviewer mutations:**
1. `tiles: 1` (revert) → "makes one tile per selected version" fails.
2. `tiles: image.study.versions.length * copies` with one item → "repeats the whole group per copy" fails.
3. In `geometry.ts` `blockSize`, drop `gaps` → the 4-tile gutter example and the property suite fail (proves the widened properties bite on 4 tiles).
4. Change the key to include `versions.length` → the "keeps the key" example fails (and the golden test stays green, which is why the example exists).

---

### Task B4: Carry study versions in the page model

**Branch:** `feat/render-study-tiles` · **PR title:** `feat(render): carry study versions in the page model` · **Depends on:** A1

**Files:**
- Modify: `src/features/render/types.ts`, `src/features/render/page-model/build-page-models.ts`, `src/features/render/pixels/tile-plan.ts`, `src/features/render/test-support/fixtures.ts`, `src/features/render/index.ts`
- Create: `src/features/render/preview/study-tiles.ts` (types only)
- Test: `src/features/render/page-model/build-page-models.test.ts` (+ its snapshot), `src/features/render/pixels/tile-plan.test.ts`
- Test-only literal updates (new required fields): every test that writes a `PageModel` or `DrawTile` literal instead of using the fixtures. Find them with `git grep -n "cropMarks: \[" -- 'src/**/*.test.ts' 'src/**/*.test.tsx'` (2026-10-07: `src/app/describe-page.test.ts`, `src/app/slots/PreviewSlot.test.tsx`, `src/features/render/pdf/compose.test.ts`, `src/features/render/preview/preview.test.ts`, `src/features/render/export/export-state.test.ts`, `src/features/render/components/ExportDialog.test.tsx`). Prefer switching a literal to `pageModel()` / `drawTile()`; otherwise add `groups: []` / `version: 'original', study: null`. The two `src/app` files are D-owned: B4 only adds the missing fields, nothing else, and says so in the PR.

**Interfaces:**
- Consumes (A1): `StudyVersion`, `TileStudy`, `tileStudyFor`, `studyKey`, `ImageDescriptor.study`.
- Produces (overview "Render (B4)"): `DrawTile.version`, `DrawTile.study`, `StudyGroupOutline`, `PageModel.groups`, the extended `tileRenderKey`, `readingOrder` (exported for C3's tests), and the types-only `study-tiles.ts`.

Design notes (rulings M2-R4, M2-R13, M2-R14):
- **Reading order.** `drawTilesFor` sorts the placement's tile rects by `y`, then `x` (with a 1e-6 mm tolerance on `y`, CR-B3 says coordinates are not rounded) and assigns `versions[i]` to the *i*-th. Tiles of one group never overlap and share an edge coordinate exactly (the engine computes them from the same expressions), so the order is well defined.
- **Stale count.** If `placement.tiles.length !== image.study.versions.length` the placement is skipped (returns `[]`), exactly like a placement whose image was removed. Pages left empty are dropped and re-indexed (existing behaviour).
- **Consecutive tiles (CR-M2-5).** A placement's tiles are emitted consecutively, in reading order, in placement order on the page; C3 finds the first tile of a group this way. Never sort tiles across placements.
- **Groups.** `groups` lists `{ imageId, block }` for every placement with ≥ 2 tiles that was not skipped, in placement order. Screen-only: the PDF composer ignores it.
- **Warnings.** `lowDpi` / `scaledToFit` stay on every tile of the placement (data); C3 decides to show the chips on the first tile only.
- **Keys.** `tileRenderKey` appends `|${tile.version}|${studyKey(tile.study)}`. The composer, `runExport` and `PagePreview` all call `tileRenderKey`, so no other call site changes. Two copies of the same version at the same size still share a key (one embedded image).

- [ ] **Step 1: Create the worktree** (after A1 has merged)

```bash
git fetch && git worktree add .worktrees/m2-b4 -b feat/render-study-tiles origin/master
cd .worktrees/m2-b4 && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Types.** In `src/features/render/types.ts`:

```ts
import type { StudyVersion, TileStudy } from '../../shared/model/study'

export interface DrawTile {
  // …all M1 fields unchanged…
  /** Which study version this tile prints (M2). 'original' for photos without studies. */
  readonly version: StudyVersion
  /** tileStudyFor(version, image.study): null for 'original'. */
  readonly study: TileStudy | null
}

/** A study group's outline on screen (never printed, M2-R14). */
export interface StudyGroupOutline {
  readonly imageId: ImageId
  readonly block: RectMm
}

export interface PageModel {
  // …all M1 fields unchanged…
  /** Placements with ≥ 2 tiles, in placement order. Screen-only. */
  readonly groups: readonly StudyGroupOutline[]
}
```

Fixtures (`render/test-support/fixtures.ts`): `drawTile()` defaults gain `version: 'original', study: null`; `pageModel()` defaults gain `groups: []`. Add a builder:

```ts
/** A descriptor whose study selects `versions` (other study fields default). */
export function studyDescriptor(
  name: string,
  versions: readonly StudyVersion[],
  pxW = 3000,
  pxH = 2000,
): ImageDescriptor {
  return { ...descriptor(name, pxW, pxH), study: { ...DEFAULT_STUDY, versions } }
}
```

- [ ] **Step 3: Create `src/features/render/preview/study-tiles.ts`** (types only; verbatim from the overview so C1 and C3 compile against it):

```ts
import type { ImageId } from '../../../shared/model/image'
import type { TileStudy } from '../../../shared/model/study'
import type { TilePixelPlan } from '../pixels/tile-plan'

/** One study tile the preview needs (C3 builds these; C1's provider renders them). */
export interface StudyTileRequest {
  /** tileRenderKey(tile, plan at preview dpi): includes version + studyKey. */
  readonly key: string
  /** `${imageId}|${version}|${pageIndex}:${tileIndex}`: "the same tile" for stale display (M2-R12). */
  readonly slot: string
  /** Planned against the image's pxW × pxH (not yet scaled to the preview bitmap). */
  readonly plan: TilePixelPlan
  readonly study: TileStudy
  readonly imageId: ImageId
}

export interface StudyTileProvider {
  /** Fresh image for `key`, else the newest stale image held for `slot`, else null. Never blocks. */
  get(key: string, slot: string): CanvasImageSource | null
  /** Replace a consumer's wanted set; queues missing keys in the given order, drops queued keys nobody wants. */
  want(consumer: string, requests: readonly StudyTileRequest[]): void
  /** Called (batched per animation frame) when a wanted key becomes ready. Returns unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Number of `consumer`'s wanted keys not ready yet (drives aria-busy). */
  pending(consumer: string): number
  release(consumer: string): void
  /** M2-R16: stop starting jobs and close retained (unwanted) images; resume restarts the queue. */
  pause(): void
  resume(): void
}
```

`tsc` checks it; it has no runtime code, so coverage ignores it (v8 reports no statements). Export both types from `render/index.ts` in the `// --- Preview ---` section.

- [ ] **Step 4: Write the failing page-model tests.** Append to `build-page-models.test.ts` (import `studyDescriptor`, `placement`, `layoutOf`, `setupWith`, `id`):

```ts
import { readingOrder } from './build-page-models'

const R = (x: number, y: number, w = 40, h = 60) => ({ x, y, w, h })
const versionsOf = (pages: ReturnType<typeof buildPageModels>) =>
  pages.flatMap((p) => p.tiles.map((t) => [t.trim.x, t.trim.y, t.version]))

describe('study versions (M2-R4)', () => {
  const three = studyDescriptor('a', ['original', 'blurred', 'values'])

  it('assigns versions in reading order: row, column, turned row, turned column', () => {
    // Engine order (CR-B5) given as the placement's tile order; the page model must not trust it.
    const row = placement('a', [R(20, 20), R(66, 20), R(112, 20)])
    const column = placement('a', [R(20, 20, 60, 40), R(20, 66, 60, 40), R(20, 112, 60, 40)])
    const turnedRow = placement('a', [R(20, 20, 60, 40), R(20, 66, 60, 40), R(20, 112, 60, 40)], {
      turned: true,
    })
    // Turned column: tile i is i-th from the RIGHT.
    const turnedColumn = placement('a', [R(112, 20), R(66, 20), R(20, 20)], { turned: true })
    for (const p of [row, column, turnedRow, turnedColumn]) {
      const [page] = buildPageModels(layoutOf([[p]]), setupWith({ cropMarks: false }), [three])
      const tiles = page?.tiles ?? []
      expect(tiles.map((t) => t.version)).toEqual(['original', 'blurred', 'values'])
      // First version top-left: reading order of the trims.
      const trims = tiles.map((t) => t.trim)
      expect(trims).toEqual(readingOrder(trims))
    }
  })

  it('emits each placement\'s tiles consecutively, in reading order (CR-M2-5)', () => {
    // Two groups interleaved in reading order on the page: a's row above and below b's row.
    const a = placement('a', [R(112, 20), R(20, 20), R(66, 20)])
    const b = { ...placement('b', [R(66, 100), R(20, 100)]), key: 'b#0' }
    const [page] = buildPageModels(layoutOf([[a, b]]), setupWith({ cropMarks: false }), [
      three,
      studyDescriptor('b', ['original', 'values']),
    ])
    const ids = (page?.tiles ?? []).map((t) => t.imageId)
    expect(ids).toEqual([id('a'), id('a'), id('a'), id('b'), id('b')])
    // The first tile of each group is its top-left one, carrying the first version.
    expect(page?.tiles[0]?.trim).toEqual(R(20, 20))
    expect(page?.tiles[3]?.trim).toEqual(R(20, 100))
    expect(page?.tiles[3]?.version).toBe('original')
  })

  it('attaches tileStudyFor(version, study) and keeps the M1 fields of every tile', () => {
    const p = placement('a', [R(20, 20), R(66, 20), R(112, 20)], { warnings: ['low-dpi'] })
    const [page] = buildPageModels(layoutOf([[p]]), setupWith(), [three])
    const [o, b, v] = page?.tiles ?? []
    expect(o?.study).toBeNull()
    expect(b?.study).toEqual({ blurPct: DEFAULT_STUDY.blurPct, values: null })
    expect(v?.study).toEqual({ blurPct: null, values: DEFAULT_STUDY.values })
    expect(page?.tiles.every((t) => t.lowDpi)).toBe(true) // data on every tile; the chip is C3's
    expect(new Set(page?.tiles.map((t) => JSON.stringify(t.crop))).size).toBe(1)
  })

  it('lists placements with ≥ 2 tiles as groups, in placement order', () => {
    const group = placement('a', [R(20, 20), R(66, 20)])
    const single = { ...placement('b', [R(20, 100)]), key: 'b#0' }
    const two = studyDescriptor('a', ['original', 'values'])
    const [page] = buildPageModels(layoutOf([[group, single]]), setupWith(), [two, descriptor('b')])
    expect(page?.groups).toEqual([{ imageId: id('a'), block: group.block }])
  })

  it('skips a placement whose tile count no longer matches the versions (stale layout)', () => {
    const stale = placement('a', [R(20, 20)]) // laid out for 1 tile
    const other = { ...placement('b', [R(20, 100)]), key: 'b#0' }
    const pages = buildPageModels(
      layoutOf([[stale, other]]),
      setupWith(),
      [studyDescriptor('a', ['original', 'values']), descriptor('b')],
    )
    expect(pages[0]?.tiles.map((t) => t.imageId)).toEqual([id('b')])
    expect(pages[0]?.groups).toEqual([])
  })

  it('drops a page left empty by a stale placement and re-indexes', () => {
    const pages = buildPageModels(
      layoutOf([[placement('a', [R(20, 20)])], [{ ...placement('b', [R(20, 20)]), key: 'b#0' }]]),
      setupWith(),
      [studyDescriptor('a', ['original', 'values']), descriptor('b')],
    )
    expect(pages.map((p) => p.index)).toEqual([0])
  })

  it('Original-only images give the M1 model plus version/study/groups defaults', () => {
    const p = placement('a', [R(20, 20)])
    const [page] = buildPageModels(layoutOf([[p]]), setupWith(), [descriptor('a')])
    expect(page?.tiles[0]?.version).toBe('original')
    expect(page?.tiles[0]?.study).toBeNull()
    expect(page?.groups).toEqual([])
  })
})

describe('readingOrder', () => {
  it('sorts by y then x, treating y within 1e-6 mm as one row', () => {
    const a = R(50, 20 + 1e-9)
    const b = R(10, 20)
    const c = R(10, 90)
    expect(readingOrder([c, a, b])).toEqual([b, a, c])
  })
})
```

Extend the existing snapshot test (if `build-page-models.test.ts` has a `toMatchSnapshot` over a fixture layout) with one 3-version group; regenerate the snapshot **only** for that new case and the added `version`/`study`/`groups` fields, and say so in the PR.

- [ ] **Step 5: Write the failing key tests.** Append to `tile-plan.test.ts`:

```ts
describe('tileRenderKey with studies (M2)', () => {
  const base = drawTile()
  const blurred = drawTile({ version: 'blurred', study: { blurPct: 40, values: null } })
  const blurred70 = drawTile({ version: 'blurred', study: { blurPct: 70, values: null } })
  const values = drawTile({
    version: 'values',
    study: { blurPct: null, values: { count: 5, hue: 55, neutral: false } },
  })

  it('differs per version and per study parameter', () => {
    const keys = [base, blurred, blurred70, values].map((t) => tileRenderKey(t))
    expect(new Set(keys).size).toBe(4)
  })

  it('is equal for identical copies of the same version (one embedded image)', () => {
    const copy = { ...blurred, trim: { ...blurred.trim, y: 200 } }
    expect(tileRenderKey(copy)).toBe(tileRenderKey(blurred))
  })

  it('ends with the version and the study key', () => {
    expect(tileRenderKey(values).endsWith(`|values|${studyKey(values.study)}`)).toBe(true)
    expect(tileRenderKey(base).endsWith('|original|-')).toBe(true)
  })
})
```

- [ ] **Step 6: Run — RED**

```bash
corepack pnpm vitest run src/features/render/page-model src/features/render/pixels/tile-plan.test.ts
```

- [ ] **Step 7: Implement the page model.** In `build-page-models.ts`:

```ts
import { tileStudyFor } from '../../../shared/model/study'
import type { DrawTile, PageModel, StudyGroupOutline } from '../types'

const ROW_EPS_MM = 1e-6

/** Trim rects in reading order: top to bottom, then left to right (M2-R4). */
export function readingOrder(rects: readonly RectMm[]): RectMm[] {
  return [...rects].sort((a, b) => (Math.abs(a.y - b.y) > ROW_EPS_MM ? a.y - b.y : a.x - b.x))
}

/**
 * One DrawTile per trim rect of a placement, versions assigned in reading order (M2-R4).
 * Flips are defined in the user's view (after edits.rotation). When the engine turns the item a further
 * 90° clockwise, a horizontal flip in the user's view becomes a vertical flip on the page
 * (R90·FH = FV·R90), so the two flags swap.
 * Returns [] when the placement was laid out for a different number of versions (a stale layout
 * racing a version toggle): it is skipped like a removed image, and the next layout replaces it.
 */
export function drawTilesFor(img: ImageDescriptor, placement: Placement, bleedMm: Mm): DrawTile[] {
  const versions = img.study.versions
  if (placement.tiles.length !== versions.length) return []
  const crop = resolveCrop(img)
  const rotation = combineRotation(img.edits.rotation, placement.turned)
  const flipH = placement.turned ? img.edits.flipV : img.edits.flipH
  const flipV = placement.turned ? img.edits.flipH : img.edits.flipV
  const lowDpi = placement.warnings.includes('low-dpi')
  const scaledToFit = placement.warnings.includes('scaled-to-fit')
  return readingOrder(placement.tiles).map((trim, i) => {
    const version = versions[i] ?? 'original' // i < versions.length (checked above)
    return {
      imageId: img.id,
      trim,
      bleedMm,
      crop,
      rotation,
      flipH,
      flipV,
      lowDpi,
      scaledToFit,
      version,
      study: tileStudyFor(version, img.study),
    }
  })
}
```

In `buildPageModels`, collect groups alongside tiles:

```ts
  for (const page of layout.pages) {
    const tiles: DrawTile[] = []
    const groups: StudyGroupOutline[] = []
    for (const placement of page.placements) {
      const img = byId.get(placement.imageId)
      const drawn = img ? drawTilesFor(img, placement, bleedMm) : []
      if (drawn.length === 0) continue
      tiles.push(...drawn)
      if (drawn.length >= 2) groups.push({ imageId: placement.imageId, block: placement.block })
    }
    if (tiles.length === 0) continue
    pages.push({
      index: pages.length,
      size: layout.pageSize,
      safeArea,
      tiles,
      cropMarks: setup.cropMarks ? cropMarksForTiles(tiles, safeArea) : [],
      groups,
    })
  }
```

Crop marks are computed from all tiles as in M1; a group's inner marks are shortened against neighbouring tiles by the existing obstacle logic (HANDOVER Q9 / overview H4 is an owner question, not changed here).

- [ ] **Step 8: Implement the key.** In `tile-plan.ts`:

```ts
import { studyKey } from '../../../shared/model/study'

/**
 * Identity of a tile's encoded pixels: equal keys ⇒ byte-identical images, so copies at the same
 * size share one embedded image in the PDF. Includes the study version and its parameters (M2).
 */
export function tileRenderKey(tile: DrawTile, plan: TilePixelPlan = planTilePixels(tile)): string {
  const { x, y, w, h } = plan.src
  return [
    tile.imageId,
    `${String(x)},${String(y)},${String(w)},${String(h)}`,
    `${String(plan.outW)}x${String(plan.outH)}`,
    `r${String(tile.rotation)}`,
    tile.flipH ? 'h' : '-',
    tile.flipV ? 'v' : '-',
    `b${String(plan.bleedPx)}`,
    tile.version,
    studyKey(tile.study),
  ].join('|')
}
```

Barrel (`render/index.ts`, page-model section): `export type { StudyGroupOutline } from './types'` and `export { readingOrder } from './page-model/build-page-models'`.

- [ ] **Step 9: GREEN, full gate** (the test-literal updates listed under Files make `typecheck` pass):

```bash
corepack pnpm vitest run src/features/render
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:coverage
E2E_PORT=4704 corepack pnpm e2e --project=chromium e2e/layout-export.spec.ts
```

The E2E run proves Original-only exports are unchanged (keys only grew a suffix; no golden PDF bytes are compared).

- [ ] **Step 10: Commit and PR** (`feat(render): carry study versions in the page model`). Merge promptly after review: C1 and C3 wait on it.

**Reviewer mutations:**
1. Remove `readingOrder(...)` in `drawTilesFor` (zip in engine order) → the turned-column case fails.
2. Sort by `x` then `y` → the column case fails.
3. Remove the count check → "skips a placement whose tile count…" fails (the stale 1-tile placement is drawn as Original instead of skipped).
4. Push groups for 1-tile placements → "lists placements with ≥ 2 tiles" fails.
4b. Sort all of a page's tiles by reading order across placements (instead of per placement) → "emits each placement's tiles consecutively" fails (CR-M2-5).
5. Drop `studyKey(tile.study)` from the key → "differs per … study parameter" fails.
6. Add `trim.y` to the key → "is equal for identical copies" fails.

---

### Task B5: Render studies in the PDF, value studies as PNG

**Branch:** `feat/render-study-export` · **PR title:** `feat(render): render studies in the PDF, value studies as PNG` · **Depends on:** A5, B4

**Files:**
- Modify: `src/features/render/pixels/render-tile.ts`, `src/features/render/export/run-export.ts`, `src/features/render/export/worker-api.ts`, `src/features/render/export/pdf.worker.ts`, `src/features/render/pdf/inspect.ts`, `src/features/render/test-support/image-bytes.ts`, `src/features/render/index.ts` (export section, only if new public names)
- Create: `src/features/render/pixels/render-tile.study.test.ts`, `src/features/render/export/worker-api.study.test.ts` (both mock the study step, so they are separate files)
- Test: `src/features/render/export/run-export.test.ts`, `src/features/render/pdf/compose.test.ts`

**Interfaces:**
- Consumes: (A5) `applyStudyToContext(ctx, plan, study)`; (A1) `TileStudy`, `tileFormat`, `tileStudyFor`, `DEFAULT_STUDY`, `STUDY_VERSIONS`; (B4) `DrawTile.version`, `DrawTile.study`, extended `tileRenderKey`.
- Produces (overview "Render (B4, B5)"):
  - `renderTile(source, plan, createCanvas, study: TileStudy | null = null)`
  - `ExportWorkerApi.encodeTile(key, plan, bitmap, study: TileStudy | null, format: 'jpeg' | 'png')`
  - `WorkerEnv.encodePng(canvas): Promise<Uint8Array>`
  - `PdfReport.images: readonly { filter: string; widthPx: number; heightPx: number; colours: number | null }[]` (object order)
  - `PdfReport.pages[i].draws: readonly { name: string; filter: string; widthPx: number; heightPx: number; colours: number | null }[]` (content-stream order; `name` = the XObject resource name used by `Do`; ruled D-CR2, owned by B5)
  - test helper `stripePng(colours, stripeW?, h?)` in `render/test-support/image-bytes.ts`

Design notes (rulings M2-R5, M2-R9, M2-R10; overview "Memory budgets"):
- **Study before bleed (M2-R5).** `renderTile` steps: 1 step-down resample, 2 white + oriented draw, **2b `applyStudyToContext(ctx, plan, study)` when `study !== null`**, 3 `extendEdges`. The bleed ring therefore replicates the *studied* edge pixels, and the blur only ever sees the tile's own pixels.
- **One code path for preview and PDF.** The studies worker (C2) calls the same `renderTile(…, study)`, so a value tile in the preview and in the PDF come from identical code at different resolutions.
- **Format (M2-R9).** `runExport` decides `format = tileFormat(tile.version)` per job and passes it with the study; the worker encodes PNG (`convertToBlob({ type: 'image/png' })`) or JPEG (q 0.92 as M1). `composePdf`/`createPdfComposer` already embed PNG (`embedPng`) — no change.
- **Memory.** `runExport`'s structure is unchanged: `jobsByImage` groups every distinct tile (every version, every page) under its image; the first tile of an image triggers **one** `decode()`, all its jobs are encoded from that bitmap, then it is closed. The worker holds one tile canvas at a time plus the `ImageData` copy made inside `applyStudyToContext` (≤ one tile, GC'd when the call returns). `encodeTile` closes the bitmap and releases the canvas in `finally`, including when the study throws.
- **Inspector.** `images[]` lists every drawn image XObject (soft masks excluded, as `imageCount` already does), in object order, with its `/Filter` name without the slash (`'DCTDecode'`, `'FlateDecode'`), pixel size, and for `FlateDecode` streams up to 4 MP the number of distinct RGB triples (`colours`), else `null`. It is test-only (unit tests here and D3's E2E).

- [ ] **Step 1: Create the worktree** (after A5 and B4 have merged)

```bash
git fetch && git worktree add .worktrees/m2-b5 -b feat/render-study-export origin/master
cd .worktrees/m2-b5 && corepack pnpm install --frozen-lockfile
```

- [ ] **Step 2: Add the PNG test helper.** In `src/features/render/test-support/image-bytes.ts` (node-only test support; `node:zlib` is available in the `unit` project):

```ts
import { crc32, deflateSync } from 'node:zlib'

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length)
  body.set(new TextEncoder().encode(type), 0)
  body.set(data, 4)
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(body, 4)
  view.setUint32(8 + data.length, crc32(body))
  return out
}

/** Test-only RGB PNG of vertical stripes, one per colour (exactly colours.length distinct colours). */
export function stripePng(
  colours: readonly (readonly [number, number, number])[],
  stripeW = 2,
  h = 2,
): Uint8Array {
  const w = colours.length * stripeW
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, w)
  v.setUint32(4, h)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB
  const raw = new Uint8Array((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1) // filter byte 0 (none) at row start
    for (let x = 0; x < w; x++) {
      const c = colours[Math.floor(x / stripeW)] ?? [0, 0, 0]
      raw.set(c, row + 1 + x * 3)
    }
  }
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
```

(Returns a standalone `Uint8Array`, never a pooled `Buffer` view — pdf-lib's PNG decoder ignores `byteOffset`; see `e2e/support/png.ts`.)

- [ ] **Step 3: Failing inspector + composer round-trip tests.** Append to `src/features/render/pdf/compose.test.ts`:

```ts
import { stripePng, TINY_JPEG } from '../test-support/image-bytes'

const FIVE: [number, number, number][] = [
  [40, 30, 20],
  [90, 70, 50],
  [140, 115, 90],
  [190, 170, 145],
  [240, 232, 220],
]

describe('studies in the PDF (M2-R9)', () => {
  const study = DEFAULT_STUDY
  const at = (x: number) => ({ x, y: 20, w: 40, h: 60 })
  const original = drawTile({ trim: at(20) })
  const blurred = drawTile({ trim: at(66), version: 'blurred', study: tileStudyFor('blurred', study) })
  const values = drawTile({ trim: at(112), version: 'values', study: tileStudyFor('values', study) })

  it('embeds the photo and the blur as JPEG and the 5-value study as a 5-colour PNG', async () => {
    const encoded = new Map([
      [tileRenderKey(original), { format: 'jpeg' as const, bytes: TINY_JPEG, pxW: 2, pxH: 2 }],
      [tileRenderKey(blurred), { format: 'jpeg' as const, bytes: TINY_JPEG, pxW: 2, pxH: 2 }],
      [tileRenderKey(values), { format: 'png' as const, bytes: stripePng(FIVE), pxW: 10, pxH: 2 }],
    ])
    const report = await inspectPdf(await composePdf([pageModel([original, blurred, values])], encoded))
    expect(report.imageCount).toBe(3)
    expect(report.images.map((i) => i.filter).sort()).toEqual(['DCTDecode', 'DCTDecode', 'FlateDecode'])
    const png = report.images.find((i) => i.filter === 'FlateDecode')
    expect(png).toMatchObject({ widthPx: 10, heightPx: 2, colours: 5 })
    expect(report.images.filter((i) => i.filter === 'DCTDecode').every((i) => i.colours === null)).toBe(true)
    expect(countImageDraws(report.pages[0]?.content ?? '')).toBe(3)
  })

  it('lists each page\'s draws in content-stream order with their filters (D-CR2)', async () => {
    const encoded = new Map([
      [tileRenderKey(original), { format: 'jpeg' as const, bytes: TINY_JPEG, pxW: 2, pxH: 2 }],
      [tileRenderKey(blurred), { format: 'jpeg' as const, bytes: TINY_JPEG, pxW: 2, pxH: 2 }],
      [tileRenderKey(values), { format: 'png' as const, bytes: stripePng(FIVE), pxW: 10, pxH: 2 }],
    ])
    const report = await inspectPdf(await composePdf([pageModel([original, blurred, values])], encoded))
    const draws = report.pages[0]?.draws ?? []
    expect(draws.map((d) => d.filter)).toEqual(['DCTDecode', 'DCTDecode', 'FlateDecode'])
    expect(draws[2]).toMatchObject({ widthPx: 10, heightPx: 2, colours: 5 })
    // Names are the resource names the content stream uses with `Do`, one distinct XObject per key.
    for (const d of draws) expect(report.pages[0]?.content).toContain(`/${d.name} Do`)
    expect(new Set(draws.map((d) => d.name)).size).toBe(3)
  })

  it('repeats a draw entry when one embedded image is drawn twice (copies)', async () => {
    const copy = { ...original, trim: { ...original.trim, y: 150 } }
    const encoded = new Map([[tileRenderKey(original), { format: 'jpeg' as const, bytes: TINY_JPEG, pxW: 2, pxH: 2 }]])
    const report = await inspectPdf(await composePdf([pageModel([original, copy])], encoded))
    const draws = report.pages[0]?.draws ?? []
    expect(draws).toHaveLength(2)
    expect(draws[0]?.name).toBe(draws[1]?.name)
    expect(report.images).toHaveLength(1)
  })

  it('counts distinct colours per pixel, RGB and grey, and caps counting at 4 MP', () => {
    // Exercised through the exported helpers so the test needs no 4 MP fixture.
    expect(distinctRgbColours(new Uint8Array(3 * 4), 4, 3)).toBe(1)
    expect(distinctRgbColours(new Uint8Array([1, 2, 3, 1, 2, 4]), 2, 3)).toBe(2)
    expect(distinctRgbColours(new Uint8Array([7, 7, 9]), 3, 1)).toBe(2)
    expect(colourCountLimitPx()).toBe(4_000_000)
  })

  it('does not count an alpha PNG soft mask in images[] (as imageCount)', async () => {
    const t = drawTile()
    const report = await inspectPdf(
      await composePdf([pageModel([t])], new Map([[tileRenderKey(t), { format: 'png', bytes: TINY_PNG_ALPHA, pxW: 2, pxH: 2 }]])),
    )
    expect(report.images).toHaveLength(1)
  })
})
```

(`distinctRgbColours` and `colourCountLimitPx` are small exports of `inspect.ts` added in Step 7; if the reviewer prefers, replace the guard test with a direct 4 MP case — it costs ~200 ms.)

- [ ] **Step 4: Failing `renderTile` study tests.** New file `src/features/render/pixels/render-tile.study.test.ts` (separate file because it mocks the study step):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TileStudy } from '../../../shared/model/study'
import { drawTile } from '../test-support/fixtures'
import { FakeCanvas, fakeFactory } from '../test-support/fake-canvas'
import { renderTile } from './render-tile'
import { planTilePixels } from './tile-plan'

const step = vi.hoisted(() => ({ calls: [] as string[], impl: undefined as undefined | (() => void) }))

vi.mock('../../studies/apply-study', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../studies/apply-study')>()
  return {
    ...actual,
    applyStudyToContext: vi.fn((ctx: Parameters<typeof actual.applyStudyToContext>[0], plan: Parameters<typeof actual.applyStudyToContext>[1], study: TileStudy) => {
      step.calls.push('study')
      if (step.impl) {
        step.impl()
        return
      }
      // Marker: paint the image area pure magenta so the bleed shows what ran first.
      const img = ctx.createImageData(plan.outW, plan.outH)
      for (let i = 0; i < img.data.length; i += 4) img.data.set([255, 0, 255, 255], i)
      ctx.putImageData(img, plan.bleedPx, plan.bleedPx)
      void study
    }),
  }
})

const VALUES: TileStudy = { blurPct: null, values: { count: 5, hue: 55, neutral: false } }
const small = drawTile({ trim: { x: 0, y: 0, w: 10, h: 5 }, crop: { x: 0, y: 0, w: 300, h: 150 }, bleedMm: 1 })

beforeEach(() => {
  step.calls = []
  step.impl = undefined
})

describe('renderTile with a study (M2-R5)', () => {
  it('runs the study once, on the image area, before the bleed is extended', () => {
    const plan = planTilePixels(small)
    const out = renderTile({} as CanvasImageSource, plan, fakeFactory(), VALUES)
    expect(step.calls).toEqual(['study'])
    // Bleed ring replicates the studied edge (magenta), not the white/drawn pixels.
    expect(out.pixel(0, 0)).toEqual([255, 0, 255, 255])
    expect(out.pixel(plan.canvasW - 1, plan.canvasH - 1)).toEqual([255, 0, 255, 255])
  })

  it('does not run a study step for the original (study null or omitted)', () => {
    const plan = planTilePixels(small)
    renderTile({} as CanvasImageSource, plan, fakeFactory())
    renderTile({} as CanvasImageSource, plan, fakeFactory(), null)
    expect(step.calls).toEqual([])
  })

  it('releases the output canvas when the study step throws', () => {
    step.impl = () => {
      throw new Error('no ImageData')
    }
    const made: FakeCanvas[] = []
    expect(() => renderTile({} as CanvasImageSource, planTilePixels(small), fakeFactory(made), VALUES)).toThrow('no ImageData')
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })
})
```

Check `FakeCanvas` exposes `pixel(x, y)` (used by the existing tests) and real `createImageData`/`putImageData`; it does (see `fake-canvas.ts`). If `fakeFactory`'s return type lacks `pixel`, use the `DrawableFake` cast the existing tests use.

- [ ] **Step 5: Failing export tests.** Append to `src/features/render/export/run-export.test.ts`. Extend `realWorkerDeps` to accept an `encodePng` spy and to record formats:

```ts
function studyWorkerDeps(env: Partial<Parameters<typeof createExportWorkerApi>[0]> = {}) {
  const formats: string[] = []
  const api = createExportWorkerApi({
    supported: () => true,
    createCanvas: fakeFactory(),
    encodeJpeg: () => {
      formats.push('jpeg')
      return Promise.resolve(TINY_JPEG)
    },
    encodePng: () => {
      formats.push('png')
      return Promise.resolve(stripePng(FIVE))
    },
    ...env,
  })
  const clones: (ImageBitmap & { closed: boolean })[] = []
  const deps: ExportDeps = {
    api,
    cropBitmap: (_b, r: PxRect) => {
      const c = fakeBitmap(r.w, r.h)
      clones.push(c)
      return Promise.resolve(c)
    },
    transfer: (v) => v,
  }
  return { deps, clones, formats }
}

/** Every version of image `a` as small tiles (fast in node), at x offset `dx`. */
function versionTiles(dx: number, y: number): DrawTile[] {
  return STUDY_VERSIONS.map((version, i) =>
    drawTile({
      imageId: id('a'),
      trim: { x: dx + i * 12, y, w: 10, h: 5 },
      version,
      study: tileStudyFor(version, { ...DEFAULT_STUDY, versions: STUDY_VERSIONS }),
    }),
  )
}

describe('runExport with studies', () => {
  it('decodes each image once for 4 versions × 2 copies across two pages', async () => {
    const src = fakeSources({ a: [3000, 1500] })
    const { deps, clones } = studyWorkerDeps()
    const encode = vi.spyOn(deps.api, 'encodeTile')
    const pages = [pageModel(versionTiles(20, 20)), pageModel(versionTiles(20, 20), { index: 1 })]
    await runExport(pages, src.get, {}, deps)
    expect(src.decodes).toEqual(['a'])
    expect(src.maxAlive()).toBe(1)
    expect(src.decoded.every((b) => b.closed)).toBe(true)
    expect(encode).toHaveBeenCalledTimes(4) // the second copy shares all four keys
    expect(clones.every((c) => c.closed)).toBe(true)
  })

  it('passes each tile its study and format: PNG for values and blur + values, JPEG otherwise', async () => {
    const { deps, formats } = studyWorkerDeps()
    const encode = vi.spyOn(deps.api, 'encodeTile')
    await runExport([pageModel(versionTiles(20, 20))], fakeSources({ a: [3000, 1500] }).get, {}, deps)
    expect(encode.mock.calls.map((c) => [c[3], c[4]])).toEqual(
      STUDY_VERSIONS.map((v) => [tileStudyFor(v, { ...DEFAULT_STUDY, versions: STUDY_VERSIONS }), tileFormat(v)]),
    )
    expect(formats).toEqual(['jpeg', 'jpeg', 'png', 'png'])
  })

  it('produces a PDF whose value tiles are FlateDecode images', async () => {
    const { deps } = studyWorkerDeps()
    const bytes = await runExport([pageModel(versionTiles(20, 20))], fakeSources({ a: [3000, 1500] }).get, {}, deps)
    const report = await inspectPdf(bytes)
    expect(report.images.map((i) => i.filter)).toEqual(['DCTDecode', 'DCTDecode', 'FlateDecode', 'FlateDecode'])
  })
})

```

These tests also import `DEFAULT_STUDY`, `STUDY_VERSIONS`, `tileStudyFor`, `tileFormat` (`shared/model/study`), `DrawTile` (`../types`), `FakeCanvas` and `stripePng`, plus a `FIVE` colour list like Step 3's. Update the existing `createExportWorkerApi` tests' env objects to include `encodePng: vi.fn()`.

The release-on-throw case needs a study step that throws deterministically, so it lives in a new file `src/features/render/export/worker-api.study.test.ts` with the same mock pattern as Step 4:

```ts
import { describe, expect, it, vi } from 'vitest'
import { drawTile } from '../test-support/fixtures'
import { fakeFactory, type FakeCanvas } from '../test-support/fake-canvas'
import { planTilePixels } from '../pixels/tile-plan'
import { createExportWorkerApi } from './worker-api'

vi.mock('../../studies/apply-study', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../studies/apply-study')>()),
  applyStudyToContext: vi.fn(() => {
    throw new Error('no ImageData')
  }),
}))

describe('createExportWorkerApi with studies', () => {
  it('closes the bitmap and releases the canvas when the study throws', async () => {
    const made: FakeCanvas[] = []
    const encodeJpeg = vi.fn()
    const api = createExportWorkerApi({
      supported: () => true,
      createCanvas: fakeFactory(made),
      encodeJpeg,
      encodePng: vi.fn(),
    })
    await api.init()
    let closed = false
    const bitmap = { width: 300, height: 150, close: () => (closed = true) } as unknown as ImageBitmap
    const plan = planTilePixels(
      drawTile({ trim: { x: 0, y: 0, w: 10, h: 5 }, crop: { x: 0, y: 0, w: 300, h: 150 } }),
    )
    const study = { blurPct: 40, values: null }
    await expect(api.encodeTile('k', plan, bitmap, study, 'jpeg')).rejects.toThrow('no ImageData')
    expect(closed).toBe(true)
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
    expect(encodeJpeg).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run — RED**

```bash
corepack pnpm vitest run src/features/render
```

Expected: the round-trip and inspector tests fail on `report.images` undefined; the renderTile tests fail (no study step); the export tests fail (`encodePng` unknown, `encodeTile` receives 3 arguments).

- [ ] **Step 7: Implement.**

`render-tile.ts`:

```ts
import type { TileStudy } from '../../../shared/model/study'
import { applyStudyToContext } from '../../studies/apply-study'

/**
 * Render one tile (crop → resample → rotate/flip → study → bleed by edge extension) into a new
 * canvas of plan.canvasW × plan.canvasH. Shared by the preview (main thread and studies worker) and
 * the PDF export (worker), so all produce the same pixels. `source` must contain plan.src.
 * The study (blur, then posterise) runs on the image area before the bleed (M2-R5).
 */
export function renderTile<C extends TileCanvas & CanvasImageSource>(
  source: CanvasImageSource,
  plan: TilePixelPlan,
  createCanvas: CanvasFactory<C>,
  study: TileStudy | null = null,
): C {
  // …steps 1 and 2 unchanged…
    ctx.resetTransform()

    // 2b. Study on the printed image area (never the bleed ring).
    if (study !== null) applyStudyToContext(ctx, plan, study)

    // 3. Bleed.
    extendEdges(ctx, plan.bleedPx, plan.outW, plan.outH)
  // …catch/finally unchanged (out released on throw, temps always released)…
}
```

`TileCtx` already extends `PixelCtx` (getImageData/createImageData/putImageData), which is what `applyStudyToContext` needs.

`run-export.ts`:

```ts
import { tileFormat, type TileStudy } from '../../../shared/model/study'

export interface ExportWorkerApi {
  init(): Promise<void>
  /** Render (+ study) + encode + embed one tile image. The worker closes `bitmap` when done. */
  encodeTile(
    key: string,
    plan: TilePixelPlan,
    bitmap: ImageBitmap,
    study: TileStudy | null,
    format: 'jpeg' | 'png',
  ): Promise<void>
  addPage(page: PageModel): Promise<void>
  finish(): Promise<Uint8Array>
}

interface TileJob {
  readonly key: string
  readonly plan: TilePixelPlan
  readonly study: TileStudy | null
  readonly format: 'jpeg' | 'png'
}
```

In `jobsByImage`: `jobs.push({ key, plan, study: tile.study, format: tileFormat(tile.version) })`. In `encodeImage`: destructure `{ key, plan, study, format }` and call `deps.api.encodeTile(key, forCroppedSource(scaled), deps.transfer(clone, [clone]), study, format)`. Update the doc comment of `runExport` to say "all of its tiles, every study version, on every page".

`worker-api.ts`:

```ts
export interface WorkerEnv<C extends TileCanvas & CanvasImageSource> {
  readonly supported: () => boolean
  readonly createCanvas: (w: number, h: number) => C
  /** `canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })` → bytes. */
  readonly encodeJpeg: (canvas: C) => Promise<Uint8Array>
  /** `canvas.convertToBlob({ type: 'image/png' })` → bytes (value studies, M2-R9). */
  readonly encodePng: (canvas: C) => Promise<Uint8Array>
}

    async encodeTile(key, plan, bitmap, study, format) {
      let canvas: C | undefined
      try {
        const c = need()
        canvas = renderTile(bitmap, plan, env.createCanvas, study)
        const bytes = format === 'png' ? await env.encodePng(canvas) : await env.encodeJpeg(canvas)
        await c.embed(key, { format, bytes, pxW: plan.canvasW, pxH: plan.canvasH })
      } finally {
        bitmap.close()
        if (canvas) releaseCanvas(canvas)
      }
    },
```

`pdf.worker.ts`: add

```ts
  encodePng: async (canvas) => {
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return new Uint8Array(await blob.arrayBuffer())
  },
```

`inspect.ts`:

```ts
export interface PdfImageInfo {
  /** /Filter name without the slash, e.g. 'DCTDecode' (JPEG) or 'FlateDecode' (PNG). */
  readonly filter: string
  readonly widthPx: number
  readonly heightPx: number
  /** Distinct RGB triples, for FlateDecode streams up to COLOUR_COUNT_LIMIT_PX; otherwise null. */
  readonly colours: number | null
}
// PdfReport gains: readonly images: readonly PdfImageInfo[]

const COLOUR_COUNT_LIMIT_PX = 4_000_000
export const colourCountLimitPx = (): number => COLOUR_COUNT_LIMIT_PX

/** Distinct colours in packed 8-bit samples with `channels` per pixel (3 = RGB, 1 = grey). */
export function distinctRgbColours(samples: Uint8Array, pixels: number, channels: number): number {
  const seen = new Set<number>()
  for (let i = 0; i < pixels; i++) {
    const o = i * channels
    seen.add(channels >= 3 ? ((samples[o] ?? 0) << 16) | ((samples[o + 1] ?? 0) << 8) | (samples[o + 2] ?? 0) : (samples[o] ?? 0))
  }
  return seen.size
}

function imageInfo(img: PDFRawStream): PdfImageInfo {
  const num = (k: string): number => {
    const v = img.dict.get(PDFName.of(k))
    return v instanceof PDFNumber ? v.asNumber() : 0
  }
  const f = img.dict.get(PDFName.of('Filter'))
  const first = f instanceof PDFArray ? f.get(0) : f
  const filter = first instanceof PDFName ? first.decodeText() : ''
  const w = num('Width')
  const h = num('Height')
  let colours: number | null = null
  if (filter === 'FlateDecode' && w * h <= COLOUR_COUNT_LIMIT_PX) {
    const cs = img.dict.get(PDFName.of('ColorSpace'))
    const channels = cs === PDFName.of('DeviceGray') ? 1 : 3
    colours = distinctRgbColours(decodePDFRawStream(img).decode(), w * h, channels)
  }
  return { filter, widthPx: w, heightPx: h, colours }
}
```

and in `inspectPdf`: `images: images.filter((img) => !softMasks.has(img)).map(imageInfo)` (the same filter as `imageCount`).

Per-page draws (ruled D-CR2): each page entry gains `draws`, in content-stream order. Parse the decoded content (already computed as `content`) for `/Name Do` operators in order (the same regex as `countImageDraws`, capturing the name), resolve each name through the page's `/Resources /XObject` dictionary (`p.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)` or the 6.x equivalent — check the typings), and map the resolved stream through `imageInfo`, cached per stream so an image drawn twice is decoded once:

```ts
export interface PdfDrawInfo extends PdfImageInfo {
  /** The XObject resource name used by `Do` on this page (e.g. 'Image-12-0'). */
  readonly name: string
}
// PdfReport.pages[i] gains: readonly draws: readonly PdfDrawInfo[]

function pageDraws(doc: PDFDocument, page: PDFPage, content: string, info: (s: PDFRawStream) => PdfImageInfo): PdfDrawInfo[] {
  const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  return [...content.matchAll(/\/(\S+) Do\b/g)].flatMap((m) => {
    const name = m[1] ?? ''
    const ref = xobjects?.get(PDFName.of(name))
    const obj = ref ? doc.context.lookup(ref) : undefined
    return obj instanceof PDFRawStream ? [{ name, ...info(obj) }] : []
  })
}
```

A `Do` of a non-image XObject (none today) is skipped. `e2e/support/pdf.ts` is D-owned: D3 maps `draws` into its summary. Verify with the round-trip test that pdf-lib writes `/Filter /FlateDecode` without a `/DecodeParms` predictor for embedded PNGs; if it writes a predictor, undo it in `imageInfo` (strip the per-row filter byte) and pin that with the 5-colour assertion. Use `PDFName.decodeText()` or the equivalent in `@pdfme/pdf-lib` 6.x — check the installed typings (`node_modules/@pdfme/pdf-lib/cjs/core/objects/PDFName.d.ts`) before writing the call.

- [ ] **Step 8: GREEN, coverage, full gate, and a real-browser export**

```bash
corepack pnpm vitest run src/features/render
corepack pnpm test:coverage
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
E2E_PORT=4705 corepack pnpm e2e --project=chromium e2e/layout-export.spec.ts e2e/mobile-flow.spec.ts
E2E_PORT=4705 corepack pnpm e2e --project=webkit e2e/layout-export.spec.ts
```

The app has no study UI yet (D1/D2), so the E2E runs prove the Original path is unchanged in a real worker on Chromium and WebKit (`convertToBlob` JPEG still used). The PNG path in a real browser is covered by D3's exit-criterion test; as a manual check, the implementer may temporarily set `DEFAULT_STUDY.versions` locally to all four, export once in `pnpm dev`, and open the PDF — do not commit that.

- [ ] **Step 9: Commit and PR** (`feat(render): render studies in the PDF, value studies as PNG`). PR body: the before-bleed ruling, the PNG/JPEG rule, the memory argument (one decode per image, one canvas in the worker), the RED run.

**Reviewer mutations:**
1. Move the study step after `extendEdges` → "runs the study … before the bleed" fails (bleed corner is not magenta).
2. `format: 'jpeg'` always in `jobsByImage` → "PNG for values and blur + values" and the FlateDecode PDF test fail.
3. Drop `bitmap.close()` from `finally` (keep it only on success) → "closes the bitmap … when the study throws" fails.
4. In `encodeImage`, decode per job instead of per image → "decodes each image once for 4 versions × 2 copies" fails (`decodes` = `['a','a','a','a']`).
5. `distinctRgbColours` returns `pixels` instead of the set size → the 5-colour assertion fails (20 pixels), as does the helper test.
6. `inspectPdf.images` without the soft-mask filter → "does not count an alpha PNG soft mask" fails.
7. Build `draws` from `images` (object order) instead of the content stream → swap the order of the encoded map so the PNG embeds first; "lists each page's draws in content-stream order" fails. (The test builds the map in draw order; the reviewer reorders `encoded` to `[values, original, blurred]` to prove it.)
8. Deduplicate draws by name → "repeats a draw entry when one embedded image is drawn twice" fails.

---

## Browser-level checks handed to D (D owns `e2e/`)

Unit tests cannot cover these; D3/D4 add them (overview "Testing strategy → E2E"):

1. **Exit criterion (D3 X-S1, chromium + firefox + webkit):** one image with Original + Blurred + Values, 5 values, A4. Parse the PDF with `inspectPdf` (by path, as `e2e/support/pdf.ts` does): 3 image draws of equal size in one group; `report.pages[0].draws` (content-stream order, D-CR2) is `[DCTDecode, DCTDecode, FlateDecode]` with `colours === 5` on the PNG, so D3 can tie each draw to its position in the group; `report.images` (object order) has 2 `DCTDecode` and 1 `FlateDecode`. D3 extends its D-owned `e2e/support/pdf.ts` summary with `draws`.
2. **Blur + Values and notan (D3):** `FlateDecode` with `colours ≤ N`, and `colours === 2` for N = 2.
3. **Preview equals PDF for groups (D3):** tile boxes in the preview (C3's hit areas) vs the PDF draw matrices within 0.5%, for a row group and a turned group (reading order check from both sides).
4. **Settings v2 in a real browser (D3, privacy P2 extended):** after a study change and reload, `localStorage['artistica:settings']` is `version: 2` with `studyDefaults` and nothing image-derived; a hand-written v1 envelope set before load keeps the page setup.
5. **Memory (D4, M3 extended):** 22 × 24 MP × 3 versions exports within the M1 budgets; the PDF has 66 draws and 22 PNG images. B5's unit test pins the decode-once rule that makes this possible.
6. **Real worker PNG on WebKit (D3/D4):** `convertToBlob({ type: 'image/png' })` in the export worker on `webkit` and `mobile-webkit`.

## Self-review

**Spec / overview coverage.**
- §2.4 study groups packed together: B3 (`tiles = versions.length`; engine invariants on 1–4 tiles; copies × versions; per-tile fixed size and group scale-to-fit).
- §2.5 PNG for value studies: B5 (`tileFormat`, `encodePng`, inspector `FlateDecode` + colour count).
- §2.6 versions per image, any combination, "apply to all": B1 (`updateStudy`, `applyStudyToAll` with versions, owner Q6 default); the pixel maths is A's; "blur first, then posterise" is A5's, placed before bleed by B5 (M2-R5).
- §2.6 "PDF processed at full print resolution": B5 (study applied in the export worker at 300 DPI, from the one full decode per image).
- §2.9 default study settings persisted: B2 (schema v2, `studyDefaults`, owner Q5 default), with the v1 → v2 migration pinned.
- §3 memory: B5 decode-once and release-on-throw tests; B3 perf case 50 × 4 tiles.
- §7: layout property tests now include 4-tile groups; render page-model tests pin reading order.
- Rulings: M2-R1 (study on the descriptor, B1), R2 (keys unchanged, golden unchanged, B3), R3 (B3), R4 (B4), R5 (B5), R9 (B5), R10 (no allocation in B's code; A5 owns the in-place maths), R13/R14 data for C3 (B4 keeps warnings on every tile and emits `groups`), R17 (no dependency changes).

**Placeholder scan.** Every step that pins a contract carries the code. Two deliberate "verify against the installed library" instructions remain (Zod 4 key stripping in B2 Step 5; `PDFName` text accessor and PNG predictor in B5 Step 7), because the exact call depends on the installed version and must be read, not guessed (CLAUDE rule: read the installed dependency before using it). Both are pinned by tests whatever the outcome.

**Type consistency.** `StudyDefaults`/`normalizeStudyDefaults` (B2) are what D2's `StudyDefaultsEffect` imports. `DrawTile.version`/`study`, `PageModel.groups`, `readingOrder` and `study-tiles.ts` (B4) are what C1/C3 import. `renderTile(…, study)` (B5) is what C2's worker calls. `encodeTile`'s 5-argument signature is used only by `runExport` and the worker.

**Ordering hazards.** B4 changes required fields of `PageModel`/`DrawTile`; any PR that constructs them and merges after B4 without rebasing fails `typecheck` (M1 ruling A-4: update the branch before merging). C1/C3 start from B4's merge commit.

## Contract change requests

### Ruled (controller)

1. **`study-tiles.ts` ownership:** B4 creates it (types only); C3 changes it only through a CCR.
2. **D-CR2 (accepted, owned by B5):** `inspectPdf` adds per-page `draws` in content-stream order (`name`, `filter`, `widthPx`, `heightPx`, `colours`); the file-level `images[]` stays in object order.
3. **Field-only edits by B4 to D-owned test literals in `src/app/**`:** accepted.
4. **Privacy P2 (`e2e/privacy.spec.ts`):** if B2 breaks an exact-keys assertion, it is forwarded to D3, not edited by B.
5. **CR-M2-5:** `drawTilesFor` emits a placement's tiles consecutively and in reading order; C3 relies on it to find the first tile of a group. Pinned by B4 (`emits each placement's tiles consecutively, in reading order`).
6. **Import-default timing:** B1 reads the default study when the image is created (not when the job is planned). Accepted.

### Pending

None.

## Open questions for the owner

B decides no product question. Its defaults come from the overview's "Questions for the owner" and are marked in the steps:

- **Q5** (what is remembered): implemented default — blur %, number of values, hue and neutral persist; versions do not (B2). A different answer adds `versions` to `StudyDefaults` and its schema (B2 Step 5 note).
- **Q6** ("Apply to all" copies versions): implemented default — yes, the whole `StudySettings` (B1).
- **Q8** (order within a group): implemented default — canonical order in reading order (B4). A different order changes only `STUDY_VERSIONS` order in A1 or the zip in `drawTilesFor`.
- **Q15** (fixed size with versions): implemented default — per tile, group scaled to fit as a whole (B3 pins existing behaviour).
- **Q16** (copies with versions): implemented default — one full group per copy (B3).
- **H4** (crop marks between the tiles of a group when bleed is at the minimum gutter): unchanged; B4 computes marks exactly as M1 does.
