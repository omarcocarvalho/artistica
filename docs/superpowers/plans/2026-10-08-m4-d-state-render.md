# M4-D: State and Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember the edge detail (settings v4); keep what each photo's detections found, in memory, keyed by content and parameters, scheduled one at a time and never downloading without the user's click; and put the guides into the page model so the existing PDF and preview renderers draw them.

**Architecture:** `useDetections` (zustand, in memory) holds results and statuses by detection key (M4-R8). `createDetectionScheduler(ports)` turns "these images need these guides" into jobs over injected engines (B3's edge engine, C4's landmark engine, C3's loader), so D2 is tested with fakes and E2 wires the real ones. `guidesFor(state, img)` is a pure selector; `buildPageModels` takes it as an optional argument, and `tileLinesFor` appends guide paths to the solid batch (M4-R11, R12). The renderers don't change.

**Tech Stack:** TypeScript 6, zustand 5, Zod 4, Vitest 5, fast-check 4. No new dependencies.

**Spec:** `docs/spec.md` §2.8, §2.9 **and** the overview (M4-R7–R12, R17, R18; Shared contracts → Detections store and scheduler, Render and pipeline; Determinism; Memory budgets).

## Global Constraints

As in the overview. E2E ports 63xx. `store.ts` selectors and `schedule.ts` are covered by the 80% gate. The scheduler has no timers (D2 ruling): the detection timeouts belong to the engines (B3 10 s, C4 30 s), the landmark worker's idle release to C4, and the 80 ms detail debounce to E1.

## Review Focus

1. **No download without a click** (M4-R19): `sync` never calls `loadAiAsset` for an uncached model. Pinned in D2 with a loader spy.
2. **Keys** (M4-R8): style changes never change a key; rotation changes face/pose keys only; crop and detail change edge keys only. Pinned in D2 (table test).
3. **M3 output unchanged without guides:** `buildPageModels` with no `guides` argument and with `() => NO_GUIDES` both give byte-identical page models to master (D3 snapshot equality with the M3 snapshots).
4. **One stroke** (M4-R11): guides never add a third batch; dashed batch unchanged.
5. **Persisted data hold nothing derived from a photo, only settings values:** settings v4 adds only `edges.detailPct` (plus the off switches normalised away).

## File map

| File | Task | Purpose |
|---|---|---|
| `src/features/settings/schema.ts`, `store.ts` (+ tests) | D1 | v4: `lineDefaults` guide fields (types only), `normalizeLineDefaults` keeps the detail |
| `src/features/lines/detect/store.ts` (+ test) | D2 | `useDetections`, `detectionKey`, `guidesFor`, `guidesPending` |
| `src/features/lines/detect/schedule.ts` (+ test) | D2 | `createDetectionScheduler` |
| `src/features/render/page-model/tile-lines.ts`, `build-page-models.ts` (+ tests, snapshots) | D3 | guides in `TileLines` |
| `src/features/render/pdf/compose.lines.test.ts`, `src/features/render/preview/preview.test.ts` | D3 | guide cases (tests only) |
| `src/features/render/page-model/perf.test.ts` | D3 | timing with edges at the budget |
| `src/features/render/test-support/fixtures.ts` | D3 | `guidesFixture()` from A3/A4 fixtures and a synthetic outline |

---

### Task D1: Settings v4

**Branch:** `feat/settings-guide-defaults` · **PR title:** `feat(settings): remember the edge detail (schema v4)` · **Depends on:** A1

- [ ] **Step 1: Failing tests** (`schema.test.ts`, `store.test.ts`):
  - `SETTINGS_VERSION is 4`;
  - `a v3 envelope loads with every field and the default edge detail 50`; `v2 and v1 envelopes still load`;
  - `a stored detail is kept, clamped to 1–100 and rounded`, `a bad detail alone falls back to 50`;
  - `stored guide switches are turned off on load` (owner Q8 default: `normalizeLineDefaults` = `withoutLineTypes(sanitizeLines(...))`, which now covers guides);
  - `setLineDefaults keeps the detail and turns guides off`; `an equal value doesn't write storage` (write counter, ruling B2 of M3);
  - `partialize persists lineDefaults with the detail`.
- [ ] **Step 2: RED, implement, GREEN.** Zod: `edges: z.object({ on: z.boolean().catch(false), detailPct: z.number().catch(50) }).catch(...)`, `face`, `pose` `z.boolean().catch(false)`; ranges stay in `sanitizeLines` (M3-R16). `migrate` stays `parseSettings`.
- [ ] **Step 3:** E2E P2's expected version moves to 4 in E3; until then, D1 updates `e2e/privacy.spec.ts`'s `expect(envelope.version).toBe(3)` to 4 in this PR (one line) so master stays green. Pre-PR command (6301), PR.

---

### Task D2: Detections store and scheduler

**Branch:** `feat/lines-detections` · **PR title:** `feat(lines): keep detections per photo and schedule them` · **Depends on:** A1, A2

- [ ] **Step 1: Failing tests** `store.test.ts`:
  - `detectionKey` table: `face|hash|r90`, `pose|hash|r90`; edges `edges|hash|full|d50` and `edges|hash|10,1,100,50|d37` (kind prefix: overview, Contract change requests → Ruled, D2); style, flips, copies, studies and composition lines never change a key;
  - `guidesFor returns the stored results for the image's current keys, null where missing or not switched on`;
  - `twins (same content hash) share results`;
  - `guidesPending is true while a printed image's detection is downloading or running, false for done, failed and needs-download`;
  - `results hold plain arrays only` (structuredClone round trip; size bound: a 4-face, 4-pose, 4000-point result < 200 KB as JSON).
  `schedule.test.ts` (fake ports, fake clock):
  - `sync requests the detections that switched-on guides need, once per key`;
  - `sync never downloads: an uncached model sets needs-download with bytesToDownload`;
  - `download(model) loads the runtime and the model through the loader with progress, then runs the waiting detections`;
  - `landmark jobs run one at a time; edge jobs one at a time on their own queue`;
  - `face and pose bitmaps are the preview rotated by the user's rotation; edge bitmaps are the crop scaled to ≤ 1024 px` (the `bitmapFor` port is called with the kind; results are converted with `fromRotated` / `fromCrop`);
  - `a result arriving for a key no image needs any more is dropped`;
  - `removing an image drops results no remaining image needs; at most 4 edge entries per hash (LRU)`;
  - `a failed download sets every waiting key of that model to failed: download; retry re-runs it`;
  - `a timeout or engine error sets failed: error for that key only`;
  - `switching a guide off aborts its download if nothing else waits for that model` (H1 note);
  - `dispose disposes both engines`.
- [ ] **Step 2: RED, implement, GREEN.** The store is plain zustand without `persist`. The scheduler holds the loader's runtime and model bytes only while the landmark engine is alive (memory, M4-R6).
- [ ] **Step 3: Pre-PR command (6302), PR.**

---

### Task D3: Guides in the page model

**Branch:** `feat/render-guide-lines` · **PR title:** `feat(render): carry edge, face and pose lines in the page model` · **Depends on:** A2, A3, A4, D2

- [ ] **Step 1: Failing tests** `tile-lines.test.ts`, `build-page-models.test.ts`:
  - `without guides the page models equal master's` (existing snapshots unchanged; call with no argument and with `() => NO_GUIDES`);
  - `guide paths join the solid batch after the composition paths, in edges, face, pose order` (M4-R11);
  - `the dashed batch still holds only the centre lines`;
  - `types lists the guide types that drew something`;
  - `a pose joint is a circle of radius widthMm / 2` (4 arcs, in page mm, after the frame and page maps: radius measured on the page equals `widthMm / 2` for every turn, rotation and flip);
  - `guides follow the picture: a face on a picture rotated 90° by the user and turned by the engine lands on the face in the tile` (the A2 property tie, end to end, against `planTilePixels` + `orientMatrix`);
  - `a guide with nothing found adds no entry; with composition lines on, the entry has only the composition types`;
  - golden snapshot: one tile with every guide from the fixtures (op letters and the first/last commands of each kind; full numbers for the face only, to keep the snapshot readable);
  - `never more than MAX_GUIDE_CMDS_PER_TILE commands` (property; and the worst case: 4000 edge vertices + 4 faces + 4 poses);
  - `tileRenderKey is the same with and without guides`.
  `compose.lines.test.ts`: `a tile with guides is still one solid stroke and one dashed stroke`; `the PDF content of a tile with 4000 edge vertices is ≤ 120 KB after flate` (M4-R16; record the figure); round trip through the inspector within 0.001 mm.
  `preview.test.ts`: `the recorded calls replay the guide commands exactly; no drawImage and no canvas for guides`.
  `perf.test.ts`: `page models for 50 images × 4 versions with edges at the budget in < 100 ms` (CI bound 400 ms; record).
- [ ] **Step 2: RED, implement, GREEN.** `tileLinesFor(img, guides, trim, turned, tileIndex)`: composition paths as M3; then, if `img.lines.edges.on` and `guides.edges`, `edgePaths`; if `face`, `facePaths` for each face; if `pose`, `poseFigure` cmds and the joints as `circlePath`s in page mm (radius `widthMm / 2`); every source-px path goes through `sourceToFrame` then `frameToPage`. `buildPageModels` passes `guides(img)`.
- [ ] **Step 3: Pipeline.** `src/app/pipeline.ts`: `schedule(setup, images, guides)` and `buildModels(layout, setup, images, guides)`; the layout memo key is unchanged (test: `a detection result rebuilds page models without calling layout`). E2 subscribes it to the store.
- [ ] **Step 4: Pre-PR command (6303), PR.**

---

## Contract change requests

D2's are ruled in the overview (Contract change requests → Ruled, D2): the kind prefix in detection keys, the `assets` port, the engine and loader types declared in D2, `bitmapFor(img, kind)`, the re-prepare before every job, and the corrected memory figure.

## Open questions for the owner

Q8 (what is remembered), Q9 (crop and rotation), Q13 (export gate) in the overview.
