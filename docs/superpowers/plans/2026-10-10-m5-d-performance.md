# M5-D: Performance and Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meet **and measure** every performance and memory target in spec §3 (the M5 exit criterion), and close the memory and robustness items deferred to M5: study tiles only for pages near the view, a stalled study worker, finished downloads waiting for a decode slot, the CORS probe after "Remove all", cancelling imports (HANDOVER Q5), and the full-size decode before the downscale (HANDOVER Q7).

**Architecture:** No new subsystem. The preview gains an `IntersectionObserver` per page (D1). The study client gains a job timeout with a fresh-worker retry (D2). The images store's limiters hold a download slot until a decode slot is free, and imports get their own abort controller (D3). Decoding asks the browser for the downscaled size directly where it can (D5). Measurement uses `performance.mark`/`measure` around the pipeline and the preview draw, read by E2E (D6, M5-R27), and two new memory tests (D7). Every number goes into the M5 ledger's "§3 evidence" table.

**Tech Stack:** TypeScript 6, React 19, Comlink, `IntersectionObserver`, `AbortSignal.any` (with a fallback), Vitest 5, Playwright 1.63, CDP (`SystemInfo.getProcessInfo`, `Emulation.setCPUThrottlingRate`). No new dependencies.

**Spec:** `docs/spec.md` §3 (performance: 50 images laid out in < 500 ms in the worker; preview updates < 200 ms after a setting change for ≤ 20 images; memory: 20 × 12 MP photos → PDF on a recent phone without crashing; bundle < 250 KB gzip), §2.5 (pages processed one at a time on phones), §8 M5 exit **and** the overview (M5-R20–R23, R27; Performance budgets; Memory budgets). Ledgers: `m2.md` "Deferred" (silent worker stall, pages near the viewport, preview memory bound), `m1-c-images.md` C6 (full-size decode before the downscale), `m4.md` "Final review" triage (merge the worker probes), `HANDOVER.md` "Known issues → Memory (M5)".

## Global Constraints

As in the overview. E2E ports 68xx. **CI Linux is the memory gate** (HANDOVER, M4 gotchas): a local macOS failure of a memory test alone is not a regression. Timing tests assert generous CI bounds and **record** the measured value as a Playwright annotation; the ledger gets the CI figures.

## Review Focus

1. **Preview = PDF stays true** when far pages drop their study tiles: export never reads the preview's tiles (it renders its own), and the export gate never opens while a visible page is still rendering.
2. **No false fallback on slow phones** (D2): the timeout restarts a worker; it does not drop to the main thread on the first timeout.
3. **Cancelling an import keeps the photos already loaded** (D3), and "Remove all" still removes everything.
4. **Every §3 target has a number** recorded on CI, with the command that produced it (D6, D7).

## File map

| File | Task | Purpose |
|---|---|---|
| `src/features/render/components/PagePreview.tsx`, `src/features/render/preview/use-near-viewport.ts` (+ tests) | D1 | observer; want or release study tiles; drop the sheet canvas and tile cache far away |
| `src/features/studies/preview/provider.ts`, `study-client.ts` (+ tests) | D2 | `STUDY_JOB_TIMEOUT_MS`, retry on a fresh worker |
| `src/features/images/store.ts`, `limiter.ts`, `url.ts`, `components/ImportDropzone.tsx`, `src/locales/en/images.json` (+ tests) | D3 | slot handover, import abort, probe signal, Cancel button, drop wording (HANDOVER Q10) |
| `e2e/support/guides.ts` → `e2e/support/workers.ts`, the specs that use the probes | D4 | one worker probe |
| `src/features/images/decode.ts`, `browser-deps.ts` (+ tests) | D5 | `createImageBitmap` with `resizeWidth`/`resizeHeight` where supported |
| `src/app/perf-marks.ts`, `src/app/pipeline.ts`, `PagePreview.tsx` (+ tests) | D6 | `artistica:*` performance marks |
| `e2e/performance.spec.ts`, `e2e/support/synthetic.ts` | D6 | timing tests |
| `e2e/mobile-flow.spec.ts` (new tests M5a, M5b, M5c), `e2e/support/memory.ts` | D7 | memory tests |

---

### Task D1: Study tiles only for pages near the view

**Branch:** `perf/preview-near-viewport` · **PR title:** `perf(render): render study tiles only for pages near the view` · **Depends on:** C2 (both edit `PreviewSlot.tsx`; merge after it)

- [ ] **Step 1: Failing tests** (`PagePreview.test.tsx`, `use-near-viewport.test.ts`, with a fake `IntersectionObserver`):
  - `a page within NEAR_VIEWPORT_MARGIN of the scroller's viewport wants its study tiles; a page further away calls want(consumer, [])` (M5-R21: `rootMargin` one viewport on each side along the scroll axis: vertical on desktop, horizontal in the phone carousel);
  - `a far page keeps its size and its tile buttons (selection and the sr-only page list work), but releases its sheet canvas (width and height 0) and its tile canvas cache`; coming back near redraws it from the page model;
  - `without IntersectionObserver every page counts as near` (M1–M4 behaviour);
  - `the first page and the page holding the selected image are always near` (so selecting from the list shows the right tiles at once);
  - `aria-busy` of a far page is false (nothing pending), and of a near page true while its tiles render.
  `provider.test.ts`: `requests for near pages run before older requests for pages that went far` (the queue drops unwanted keys before picking the next job, as it does today, and a re-wanted key keeps its place).
- [ ] **Step 2: RED, implement, GREEN.**
- [ ] **Step 3: E2E check:** `expectPreviewSettled` and `armRedrawTimer` (`e2e/layout-export.spec.ts`) still hold for the pages a test looks at; any test that read a far page's canvas scrolls it into view first (list them in the PR).
- [ ] **Step 4: Pre-PR command (6801), PR.**

---

### Task D2: Recover from a stalled study worker

**Branch:** `fix/studies-worker-timeout` · **PR title:** `fix(studies): recover the preview when the study worker stalls` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`study-client.test.ts`, `provider.test.ts`, fake timers, a fake worker that never answers):
  - `a job with no answer after STUDY_JOB_TIMEOUT_MS (20 s) rejects with name StudyTimeout and terminates the worker` (M5-R22);
  - `the provider retries that job once on a fresh worker; a second timeout of the same job falls back to the main thread for the rest of the session`, as `RENDERER_RESTARTED` does today;
  - `after a timeout the queue moves on` (`running` is cleared; the next job starts), so `pending()` reaches 0 and `aria-busy` clears;
  - `the timer covers the worker's start-up` (as `EDGE_TIMEOUT_MS`);
  - `a slow job that answers before the timeout is never retried` (19.9 s);
  - `export is unaffected` (the PDF worker has its own path; no change).
- [ ] **Step 2: RED, implement, GREEN.** 20 s is 15× the slowest preview tile measured on a 4× CPU throttle (record the figure in the PR; preview tiles are ≤ 4 MP at about 80 ms per MP, `m2.md`).
- [ ] **Step 3: Pre-PR command (6802), PR.**

---

### Task D3: Bound waiting downloads, cancel imports, and drop wording

**Branch:** `fix/images-intake-bounds` · **PR title:** `fix(images): bound waiting downloads and let imports be cancelled` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`store.test.ts`, `limiter.test.ts`, `url.test.ts`, `ImportDropzone.test.tsx`):
  - `a finished download keeps its download slot until it gets a decode slot` (M5-R23), so at most `FETCH_CONCURRENCY + DECODE_CONCURRENCY` (4) fetched blobs are alive at once: 20 pasted links with a slow decoder hold ≤ 4 blobs (count through a fake);
  - `the CORS probe uses the import's signal as well as its timeout` (`AbortSignal.any([signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)])`, with a manual combiner when `AbortSignal.any` is missing); `Remove all` aborts a probe in flight and frees its slot at once;
  - `cancelImports()` aborts every pending import (fetches, probes, decodes waiting for a slot) and resolves their batches as `null`; photos already loaded stay, and the generation used by `clear()` is not bumped (owner HANDOVER Q5 default);
  - the dropzone shows "Cancel" next to "Adding 3 photos…" while `importing > 0`; it calls `cancelImports()` and announces "Stopped adding photos."; focus moves to "Upload";
  - `Remove all` is shown while photos are importing even when none has loaded yet, and cancels them (HANDOVER Q5);
  - a drop with no image says "No image in what you dropped" / "Drop a photo file, or an image from another page." (keys `dropzone.noImageDrop.*`); a paste keeps "No image on the clipboard" (HANDOVER Q10 default).
- [ ] **Step 2: RED, implement, GREEN.**
- [ ] **Step 3: Pre-PR command (6803), PR.**

---

### Task D4: One worker probe for E2E

**Branch:** `test/e2e-worker-probe` · **PR title:** `test(e2e): merge the two worker probes` · **Depends on:** —

- [ ] **Step 1:** Move `installWorkerPostCounter` and `installWorkerProbe` (`e2e/support/guides.ts`) into one `installWorkerProbe` in `e2e/support/workers.ts` that records, per worker script name, `new`, `terminate`, every `postMessage` and the Comlink `prepare(model)` calls, with timestamps; readers `workerPosts`, `maxLiveWorkers`, `workerLog`, `summarizeLandmarkWorkers` keep their names and results.
- [ ] **Step 2:** G-X2, G-D3, G-D8 (`e2e/guides.spec.ts`) and M3 (`e2e/mobile-flow.spec.ts`) use it; `e2e/support-selfcheck.spec.ts` gains a test that a probe-installed page counts one post and one terminate of a test worker on every engine.
- [ ] **Step 3:** A mutation check in the PR: break the post counter; G-D3 fails. Pre-PR command (6804; run the four specs on chromium, firefox and webkit), PR.

---

### Task D5: Decode straight to the needed size

**Branch:** `perf/images-decode-resize` · **PR title:** `perf(images): decode large photos straight to their downscaled size` · **Depends on:** —

- [ ] **Step 1: Spike inside the task (time-boxed to half a day), recorded in the PR:** in chromium, firefox and webkit, does `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality: 'high' })` decode a 50 MP JPEG without a full-size intermediate? Measure the renderer's peak RSS (`e2e/support/memory.ts`) for one 50 MP and one 100 MP JPEG, with and without the options, and compare the pixels with the current two-step path (mean absolute difference per channel).
- [ ] **Step 2: Failing tests** (`decode.test.ts`): `when resize options are supported and the plan downscales, decodeImage asks for the planned size in one call`; `EXIF orientation is applied before the resize` (the planned width and height are the upright ones; `imageOrientation: 'from-image'`); `a browser without the options keeps the two-step path` (feature probe cached once, as `orientation-probe.ts`); the preview bitmap and the export decode both use it.
- [ ] **Step 3: RED, implement, GREEN** only for engines where Step 1 shows a lower peak and pixels within the M1 decode tolerance; else the PR records the result and changes nothing for that engine.
- [ ] **Step 4: Pre-PR command (6805), PR.**

---

### Task D6: Measure the performance targets

**Branch:** `test/e2e-performance` · **PR title:** `test(e2e): measure the spec's performance targets` · **Depends on:** D1, D4

- [ ] **Step 1: Failing tests** (`perf-marks.test.ts`, `pipeline.test.ts`): the pipeline marks `artistica:layout:start`/`end` around `deps.layout` and `artistica:models:end` after `buildModels`; `PagePreview` marks `artistica:draw:end` after a page's sheet is drawn; each measure is named `artistica:<what>`, uses `performance.mark` only (local to the page, never sent anywhere, M5-R27), and the marks are cleared after 200 entries.
- [ ] **Step 2: E2E** (`e2e/performance.spec.ts`, chromium for the asserts; mobile-chromium with `Emulation.setCPUThrottlingRate(4)` recorded only):
  - **T1 layout, 50 images, in the worker** (spec §3): 50 synthetic photos (mixed aspects, `e2e/support/synthetic.ts`, small files so the import is fast), A4; change the paper 5 times; the median `artistica:layout` measure (worker round trip, Comlink included) is < 500 ms (assert on CI chromium; record the phone-throttled figure);
  - **T2 preview update, 20 images** (M5-R27 definition): for each of paper, orientation, gutter, crop marks, a study version on one photo, a line type, and the line width, the median of 5 changes from the input event to the last `artistica:draw:end` of the visible pages is < 200 ms; study tiles that render afterwards are recorded separately (`studies-settled-ms`) with the existing CI bound (1000 ms);
  - **T3 large set:** 100 synthetic 12 MP photos (generated once per run): import time, layout time, preview update time and pages; recorded; asserts the layout median < 2000 ms and no long task over 1000 ms during a scroll through all pages;
  - **T4 bundle:** reads `scripts/check-bundle-budget.ts`'s output in the `build` job (already required); the ledger records the figure.
- [ ] **Step 3:** record each median and its CI run id in the PR body; the controller copies them to the ledger's "§3 evidence" table. If a target misses, the PR says so and the fix becomes a task before F (not a budget change; owner Q11 default).
- [ ] **Step 4: Pre-PR command (6806), PR.**

---

### Task D7: Measure the memory targets

**Branch:** `test/e2e-memory-targets` · **PR title:** `test(e2e): phone memory for 20 × 12 MP photos and large sets` · **Depends on:** D1, D3, D4, D5

All on mobile-chromium (the memory sampler needs CDP), `@slow`, with the strict network guard.

- [ ] **M5a, the spec's own case:** 20 synthetic 12 MP JPEGs (4000 × 3000), default settings, A4; import, preview (scroll through every page), export; peaks < 1500 MB (import, preview) and < 1700 MB (export); the PDF parses with 20 images.
- [ ] **M5b, memory does not grow with pages** (D1): 60 photos at 12 MP on A6 (about 60 pages), Original + Blurred; the settled memory after scrolling through every page is within 150 MB of the settled memory with the first 10 pages only (record both); before D1 the same run is recorded for comparison in the PR.
- [ ] **M5c, one very large photo** (HANDOVER Q7): one 100 MP and one 200 MP JPEG, imported one at a time; record the import peak. If either exceeds 1500 MB on CI, the PR proposes the largest passing size as the coarse-pointer limit (owner Q-H7, default) and the controller decides before F.
- [ ] The existing memory test M3 still passes within its budgets (run it on the PR).
- [ ] Pre-PR command (6807), PR.

---

## Contract change requests

None yet.

## Open questions for the owner

Q11 (what counts as a "preview update"), Q12 (the large-set target), Q-H5, Q-H7 in the overview.
