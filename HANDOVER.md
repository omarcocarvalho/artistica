# Handover: Artistica (state as of 2026-10-06)

This is for the next developer and their AI agent. Read it first, then [CLAUDE.md](CLAUDE.md) for conventions. The default branch is **`master`**. There is no `main` branch.

## Project overview

Artistica is a free, static web app for artists:

- Load reference photos (upload, paste, link, or HEIC from phones).
- Crop and rotate them.
- Pack them onto printable pages.
- Export a print-ready PDF with crop marks and bleed.

Later milestones add blur and value studies, composition lines (some AI, in the browser), polish, and translations.

- **Everything runs in the browser.** Photos are never uploaded or persisted.
- **Hosting:** GitHub Pages. The landing page is at `/artistica/` and the tool at `/artistica/app/`.
- **Product spec:** [docs/spec.md](docs/spec.md). It is the source of truth.
- **Milestones:** M0 → `v0.0.1` (released), M1 → `v0.1.0` (in progress), M2–M5 → `v0.2.0`–`v0.5.0`, M6 → `v1.0.0`.

## Current status

**M0 is done** and released as `v0.0.1`. It covered scaffolding, CI, the landing page and design mockups.

**M1 ("print-ready PDF from photos") is nearly finished.** The M1 plan has 5 sub-plans in [docs/superpowers/plans/](docs/superpowers/plans/), with the overview at `2026-10-03-m1-overview.md`:

| Sub-plan | What | Status |
|---|---|---|
| A foundation | deps, i18n, settings store, units, design-system primitives | ✅ all merged |
| B layout | pure layout engine (MaxRects packer, auto sizing, orientation search) + Comlink worker | ✅ all merged |
| C images | intake (upload/paste/URL/HEIC/EXIF), in-memory store, ImageList, CropEditor, edit sheet | ✅ all merged |
| D render | page model, canvas preview, pdf-lib PDF composer in a worker, ExportDialog | ✅ all merged |
| E shell | app shell, phone flow, wiring of B/C/D, E2E suites | E0–E10 ✅ merged. E11 and E12 are open PRs. E13 not started |

**In progress:**

- **E11: import E2E, PR [#64](https://github.com/omarcocarvalho/artistica/pull/64), branch `test/e2e-import`.**
  - The implementer finished and all 8 CI checks are green.
  - It has **not been reviewed yet**.
  - One test (I12) is marked `test.fixme` because it found a real app bug (see "Known issues").
  - Brief deviations I2, I3, I10 and I15b are explained in the PR and commits.
- **E12: layout/export E2E, PR [#63](https://github.com/omarcocarvalho/artistica/pull/63), branch `test/e2e-layout-export`.**
  - It was reviewed. The review fix round is **half done** and committed as `wip(e2e): …`. That commit message lists what is incomplete.
  - Done: an X14 content-box width assertion (new `imageWidthsPt`-style field in `e2e/support/pdf.ts`), the X2 callout and bleed check, X11 CPU throttling, and the X8 direction checks.
  - Still to do:
    1. Prove the X14 bound bites: mutate it, see the test fail, then revert.
    2. Let CI run firefox and webkit.
    3. Get a short re-review.
    4. Merge.

**Release:** the release-please PR [#18](https://github.com/omarcocarvalho/artistica/pull/18) (`chore(master): release 0.1.0`) is open. It must **not** be merged until the owner signs off on M1, including a check on a real phone.

**Test results** (run on this branch, 2026-10-06, macOS, Node 24.21.0, pnpm 12.8.1):

- `pnpm lint`: pass. This first needed the ESLint ignore fix in this branch (see "Known issues").
- `pnpm format:check`: pass.
- `pnpm typecheck`: pass.
- `pnpm test:coverage`: **94 files, 809 tests, all pass.** Coverage: 98.85% statements, 94.31% branches, 100% functions, 99.86% lines.
- `pnpm e2e --project=chromium`: see the "E2E result" line at the end of this file.

## Branch map

| Branch | Contents | vs `master` | Use |
|---|---|---|---|
| `master` | all merged work through E9 (`0e4f36c`) | n/a | base for new work |
| `handover/m1-paused-state` | this file, `CONTRIBUTORS.md`, ESLint ignore fix, M1 ledgers in `docs/superpowers/ledgers/` | +docs/chore commits | draft PR. Merge it first: docs-only plus the lint fix |
| `test/e2e-import` | E11 import E2E spec (PR #64) | ahead, unreviewed | review, then merge |
| `test/e2e-layout-export` | E12 layout/export E2E spec (PR #63) plus the WIP fix round | ahead, WIP on top | **continue here first** |
| `release-please--branches--master--components--artistica` | bot-managed release PR #18 for v0.1.0 | bot | don't touch; merge only after owner sign-off |
| `docs/m1-plans`, `feat/render-export` (local only, on the previous machine) | stale. Their PRs (#13, #55) were squash-merged, and their contents are on `master` | n/a | ignore |

## Next steps (in order)

1. **Merge this handover PR** (docs plus the ESLint ignore fix).
2. **Finish E12 (PR #63)** on `test/e2e-layout-export`:
   - Prove the X14 assertion in `e2e/layout-export.spec.ts` fails when the bound is loosened, then revert.
   - Wait for the 8 CI checks.
   - Re-review the fix commit against the review findings in `docs/superpowers/ledgers/m1-e-shell.md` (lines starting "E12:").
   - Merge with a squash.
3. **Review E11 (PR #64)** against its brief, which is "Task E11" in `docs/superpowers/plans/2026-10-03-m1-e-shell.md`. Fix any findings, then merge.
4. **Fix the drop-rename bug** (see "Known issues"). It is in `src/features/images/components/ImportDropzone.tsx` (`onZoneDrop` → `fromTransfer`) and `src/features/images/store.ts` (`addFromClipboard`).
   - Dropped files must keep their real names and must not be treated as pasted.
   - Then remove `test.fixme` from I12 in `e2e/import.spec.ts`.
5. **Do Task E13** (phone flow, axe on every screen, privacy network guard, `mobile-webkit` project, final bundle-size check). The brief is "Task E13" in the E plan. It runs last.
6. **Run the final M1-wide review** across all of M1. Ruling A-5 says this is one final review, not one per sub-plan.
   - Triage every "minor (deferred)" line in `docs/superpowers/ledgers/*.md`.
   - Fix what matters before release. The notable ones are listed under "Known issues".
7. **Owner sign-off for v0.1.0.** Show the owner the M1 sign-off checklist (in E13) and the "Owner notes" below.
   - After approval, refresh the release PR's merge ref: `gh pr view 18 --json mergeable`, and wait until it isn't `UNKNOWN`.
   - Close and reopen PR #18, wait for green, then run `gh pr merge 18 --squash`. This releases and deploys to Pages.
8. **Start M2.** Write the M2 implementation plan in `docs/superpowers/plans/` and get owner approval **before** coding.

## Key decisions & context

**Architecture**

- **One page model, two renderers.** Layout outputs a plain-data `PageModel` in mm. The canvas preview and the PDF exporter both draw from it, so the preview equals the PDF.
- **Pure core, thin UI.** Layout, page models and PDF composition are plain TypeScript with no DOM, and they run in workers through Comlink.
  - The layout worker is `src/features/layout/layout-client.ts`. `layoutAsync` follows a latest-call-wins rule: superseded calls reject with a DOMException `AbortError`.
  - The PDF worker is `src/features/render/export/export-pdf.ts`, and pdf-lib lives only in that worker's chunk.
- **Determinism.** The same input gives the same layout. A golden snapshot test (`src/features/layout/golden.test.ts`) pins 31 layouts. PDFs carry no CreationDate (ruling D-2).
- **Privacy.**
  - Images live in memory only, in the `useImages` store. Only settings are persisted, in `localStorage` under `artistica:settings`, validated with Zod.
  - E2E tests have a strict network guard (`e2e/support/network-guard.ts`). It flags any non-same-origin request and any WebSocket.
  - A leave-page warning appears while images exist.

**Gotchas**

- **Errors lose their class across Comlink.** A `RangeError` from the worker arrives as a plain `Error` with `name === 'RangeError'`, so always check `err.name`.
- **Crops are fractional source pixels.** The export worker crops with `integerCropBox` and renders with `forCroppedSource`. The cache key comes from the *original* plan (ruling D-1).
- **ExportDialog doesn't auto-start.** The user clicks "Create PDF", and "Download PDF" is an `<a download>`.
- **The default unit depends on locale.** It is inches for en-US and en-CA and mm elsewhere (owner answer Q8 in the overview). E2E tests switch to mm first.
- **CI release PRs don't trigger checks.** A release PR opened by `GITHUB_TOKEN` doesn't run CI. A person must close and reopen it.
- **Branch protection uses `strict: false`.** Run `gh pr update-branch <n>` before merging a PR when master has moved.
- **macOS has no `timeout` command.**

**Process**

Plans were executed with subagent-driven development: one worktree and PR per task, an independent review (often with mutation testing), fix rounds, then a squash merge.

- Every ruling made during execution is recorded in `docs/superpowers/ledgers/m1-*.md` (lines starting "Ruling").
- Contract changes are in the overview's "Ruled" section (CR-*/CCR-*).

**Rejected or overridden approaches**

- **C-1:** URL import counts streamed bytes and aborts at the size cap. The plan's original approach trusted `Content-Length`, which isn't reliable.
- **D-1:** the original approach rounded crops in the brief, which broke the canvas size cap.
- **A-5:** one M1-wide final review was chosen instead of five per-plan reviews.
- **Containers:** none are used (owner decision).

## Setup & run

There are no env vars, secrets or external services. It is a static app, so there is no `.env.example`.

```bash
# Node 24 (fnm/nvm: .node-version / .nvmrc), pnpm 12.8.1 via corepack
corepack enable
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:5173/artistica/   (app at /artistica/app/)
pnpm lint           # ESLint, zero warnings
pnpm format:check   # Prettier
pnpm typecheck      # tsc -b
pnpm test           # Vitest unit + property tests   (pnpm test:coverage: 80% gate on layout/render)
pnpm exec playwright install   # first time only, for E2E browsers
pnpm e2e --project=chromium    # Playwright; use E2E_PORT=<port> when running several in parallel
pnpm build && pnpm preview     # production build → http://localhost:4173/artistica/
```

**Access:**

- Push to `omarcocarvalho/artistica`.
- `gh` CLI, logged in.
- Merging the release PR needs maintainer rights.

**CI** has 8 required checks: `lint`, `typecheck`, `unit`, `build` (with a bundle budget), `e2e (chromium)`, `e2e (firefox)`, `e2e (webkit)` and `pr-title`. Merges are squash-only, with Conventional Commit PR titles.

## Open questions / known issues

**Bugs**

- **Drop-rename bug, found by E11 I12.** Files dropped on the dropzone go through `addFromClipboard(pasted=true)` and get renamed `pasted-image-N.ext`. Error messages then name the wrong file, e.g. "pasted-image-2.png can't be added" instead of `notes.pdf`.

**Flaky or slow tests**

- `src/features/layout/compute-layout.property.test.ts` hit the 5 s Vitest timeout once in CI under load. Fix: set explicit timeouts on heavy property tests.
- `src/features/layout/perf.test.ts` timings are load-sensitive. The CI bound is 2000 ms.
- E12's X11 (cancel export) is timing-based. It is hardened with CDP CPU throttling in the WIP commit.

**Fixed on this branch**

- ESLint ran out of heap locally when agent worktrees existed under `.worktrees/`. It now ignores them.

**Deferred minors to triage in the final review** (full list in the ledgers):

- **Form controls on phones:**
  - Inputs, selects, switches, tabs and chips are 32 px on phones. The design says 44 px (WCAG AA 24 px is met).
- **Focus after removing an image:**
  - On the phone, focus falls to `<body>` after removing the *last* image.
  - After removing an image inside the edit sheet, focus also falls to `<body>`.
- **Stale error notices after "Remove all".** These appear for imports that were cancelled by the removal. The images store doesn't expose a generation counter.
- **Decode memory:**
  - A full-size bitmap is decoded before downscaling, about 290 MB peak for a 12 MP PNG at concurrency 2.
  - Export peak memory is roughly 20 × 48 MB of decoded originals plus 80–180 MB in the worker at save.
- **Layout failure feedback.** Only a toast shows; there is no persistent error callout. `SettingsSlot`/`PipelineEffect` have no unit tests.
- **Settings patch.** A `setPageSetup` patch containing explicit `undefined` can overwrite valid values.
- **Visual check.** The export dialog hasn't had a pixel-level visual check against `design/export.html`. Structure and contrast were checked from screenshots.

**Owner notes to raise at M1 sign-off**

- The empty state uses the *compact* dropzone. The card variant repeated the EmptyState headline.
- The locale-based default unit (Q8) is recorded only in the plan overview. `docs/spec.md` could mention it.

## Related links

- Repo: https://github.com/omarcocarvalho/artistica
- Live site: https://omarcocarvalho.github.io/artistica/
- Open PRs: [#63 E12](https://github.com/omarcocarvalho/artistica/pull/63), [#64 E11](https://github.com/omarcocarvalho/artistica/pull/64), [#18 release 0.1.0](https://github.com/omarcocarvalho/artistica/pull/18)
- Spec: [docs/spec.md](docs/spec.md)
- M1 plans: [docs/superpowers/plans/](docs/superpowers/plans/), starting with `2026-10-03-m1-overview.md`
- Execution ledgers (progress, rulings, deferred minors per task): [docs/superpowers/ledgers/](docs/superpowers/ledgers/)
- Design mockups: [design/](design/) (open `design/index.html`)

E2E result (2026-10-06, this branch, chromium only, `--workers=2`): **38 passed, 0 failed.** E11 and E12 specs are not on master yet. Firefox and WebKit run in CI.
