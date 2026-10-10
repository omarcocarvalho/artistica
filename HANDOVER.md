# Handover: Artistica (state as of 2026-10-11)

This is for the next developer and their AI agent. Read it first, then [CLAUDE.md](CLAUDE.md) for conventions. The default branch is **`master`**. There is no `main` branch.

## Project overview

Artistica is a free, static web app for artists:

- Load reference photos (upload, paste, drop, link, or HEIC from phones).
- Crop and rotate them.
- Pack them onto printable pages.
- Export a print-ready PDF with crop marks and bleed.

- Print study versions of each photo: blurred (a squint study), values (2–20 tones of one hue), or blur + values, next to the original.
- Draw composition lines on each photo (grid, rule of thirds, diagonals and armature, golden ratio lines, golden spiral, centre lines), as vector paths in the PDF.
- Draw guides from the photo (an edge outline, face construction lines, a body pose figure), found in the browser; face and pose use MediaPipe models downloaded once on request.

- Save named presets of the settings (with a JSON file to move them between devices), and arrange photos by hand on the page (drag, swap, resize, move to another page), with keyboard and tap-only paths.

The last milestone adds translations.

- **Everything runs in the browser.** Photos are never uploaded or persisted.
- **Hosting:** GitHub Pages. The landing page is at `/artistica/` and the tool at `/artistica/app/`.
- **Product spec:** [docs/spec.md](docs/spec.md). It is the source of truth.
- **Milestones:** M0 → `v0.0.1` (released), M1 → `v0.1.0` (released), M2 → `v0.2.0` (released), M3 → `v0.3.0` (released), M4 → `v0.4.0` (released), M5 → `v0.5.0` (signed off by the controller; release PR #164 being merged), M6 → `v1.0.0` (next).

## Current status

**M0 is done** and released as `v0.0.1`.

**M1 ("print-ready PDF from photos") is done** and released as [`v0.1.0`](https://github.com/omarcocarvalho/artistica/releases/tag/v0.1.0). Its plans are `docs/superpowers/plans/2026-10-03-m1-*.md` and its ledgers `docs/superpowers/ledgers/m1-*.md`. The owner's real-phone check found an export crash on an iPhone (22 × 24 MP HEIC); #75 fixed it by keeping compressed sources and 2048 px preview bitmaps, and decoding full resolution one image at a time at export.

**M2 ("image studies") is built, reviewed and merged, and the owner signed it off after the real-iPhone run.** The owner's answers to the M2 questions (#101) merged after that run. Plan: [`2026-10-07-m2-overview.md`](docs/superpowers/plans/2026-10-07-m2-overview.md) and sub-plans A–D, approved by the owner on 2026-10-07 with every recommended default (PR #77). All 18 tasks are merged (#78, #79, #81–#95 and #97), then the milestone-wide final review in three parts and its fixes (#96, #98, #99). The full record — per-task review findings, rulings, deferred items and the owner questions — is in [`docs/superpowers/ledgers/m2.md`](docs/superpowers/ledgers/m2.md).

- **Exit criterion** ("an image next to its blurred version and its 5-value version prints correctly"): pinned by E2E test S-X1 in `e2e/studies.spec.ts` on chromium, firefox and webkit — three equal tiles, two JPEGs and one PNG with exactly 5 colours, the Blurred tile measurably blurred.
- **Phone memory** (M3 in `e2e/mobile-flow.spec.ts`, 22 × 24 MP photos × 3 versions, CI): import 1169 MB, studies 1327 MB, settled 1150 MB, export 1285 MB, against budgets of 1500 / 1500 / 1700 MB.
- **Phone controls** are 44 px on touch screens, and phone inputs use 16 px text so iOS doesn't zoom on focus (#97, owner answer H1).

**Release:** M2 is released as [`v0.2.0`](https://github.com/omarcocarvalho/artistica/releases/tag/v0.2.0): release PR [#80](https://github.com/omarcocarvalho/artistica/pull/80) merged as `296f15d` on 2026-10-07. The M2 sign-off and the owner's answers are recorded on #80 and in the M2 ledger.

**M3 ("composition lines") is done, signed off by the owner on the iPhone, and released as [`v0.3.0`](https://github.com/omarcocarvalho/artistica/releases/tag/v0.3.0)** (release PR #104 merged as `a9ba6da` on 2026-10-08). Plan: [`2026-10-07-m3-overview.md`](docs/superpowers/plans/2026-10-07-m3-overview.md) and sub-plans A–D, approved by the owner on 2026-10-07 with every recommended default (PR #102). All 13 tasks are merged (#103, #105–#117), then the milestone-wide final review in three parts; its fixes are in #118 (keyboard access to the line colour in WebKit, drafts kept with their image, apply-to-all guarded in the store while importing), merged as `bd3b0b2`. The always-open phone Lines section (owner ruling D1-R1) is #120. The full record — per-task review findings, rulings, deferred items and the owner questions — is in [`docs/superpowers/ledgers/m3.md`](docs/superpowers/ledgers/m3.md).

- **Exit criterion** ("the lines in the PDF match the preview exactly and stay sharp when zoomed"): pinned by E2E test L-X1 in `e2e/lines.spec.ts` on chromium, firefox and webkit — every line a stroked vector path whose geometry equals the pure geometry within 0.01 mm, image XObjects byte-identical with lines on and off, and the preview showing the line colour along every PDF path.
- **Phone memory** (M3 in `e2e/mobile-flow.spec.ts`, every line on, CI): import 1013 MB, studies 1296 MB, settled 1158 MB, export 1292 MB, against the unchanged budgets of 1500 / 1500 / 1700 MB.
- **Release:** [#104](https://github.com/omarcocarvalho/artistica/pull/104) (`chore(master): release 0.3.0`) merged as `a9ba6da`, which created the release and deployed it to Pages.

**M4 ("AI-assisted lines" → `v0.4.0`) is released.** The owner signed it off on the iPhone on 2026-10-10 and accepted Q17–Q19. Plan: [`2026-10-08-m4-overview.md`](docs/superpowers/plans/2026-10-08-m4-overview.md) and sub-plans A–E (guides core, edge outline, AI runtime and offline, state and render, UI and E2E), PR #121, approved by the owner on 2026-10-08 with every recommended default. All 19 tasks are merged (#122, #123, #125–#135 and #137–#144, with the owner's answers to Q15 and Q16 in #136), plus the memory fix, PR #145. The milestone-wide final review ran in three parts (geometry and edges; runtime, privacy and offline; UI and accessibility) and found no blockers; its fixes are PRs #146, #147, #148 and #149. The full record — per-task review findings, rulings, the final review with its mutation results, memory evidence and triage of deferred items, and the owner questions — is in [`docs/superpowers/ledgers/m4.md`](docs/superpowers/ledgers/m4.md).

- **Guides from the photo:** an edge outline (our own integer Canny, in a worker, with a Detail slider), face construction lines and a body pose figure (MediaPipe `@mediapipe/tasks-vision` 0.10.35, in a worker on the CPU delegate). Off by default, per image, in the image's line style; vector paths in the same page model as the M3 lines, so preview = PDF. The runtime and models are self-hosted under `/artistica/`, downloaded only after a tap on "Download & turn on", and kept in Cache Storage (`artistica-ai-v1`).
- **Exit criterion 1, offline once the models are cached:** E2E G-X1 in `e2e/offline.spec.ts` (chromium and firefox). WebKit offline is checked only on the owner's iPhone (see Gotchas).
- **Exit criterion 2, nothing is uploaded:** E2E G-X2 in `e2e/guides.spec.ts` (every engine), the host audit at build and deploy, and the landmark worker's fetch guard. The final review's privacy probe through a logging proxy saw 178 requests across four browser setups, all same-origin GETs with no body and nothing off-origin.
- **Phone memory** (M3 in `e2e/mobile-flow.spec.ts`, every line and guide on, CI mobile-chromium, master `8202465`): studies 1354, guides 1368, preview with guides 1270, settled after guides −46 against settled after studies, export 1328 MB, against budgets of 1500 / 1500 / 1500 / +100 / 1700 MB. The figures of the five master runs after #145 are in the ledger.
- **Release:** [#124](https://github.com/omarcocarvalho/artistica/pull/124) (`chore(master): release 0.4.0`) merged as `2f0054f`, which created the [`v0.4.0`](https://github.com/omarcocarvalho/artistica/releases/tag/v0.4.0) release and deployed it to Pages.

**M5 ("Polish" → `v0.5.0`) is built and signed off by the controller under the owner's delegation.** The owner delegated M5 on 2026-10-10: "draft the M5 plan, and you can auto approve the changes and keep implementing, only waiting for the 1.0.0 sign off". So the controller approved the plan (PR #152), accepted every recommended default and signed off M5 on 2026-10-11; the owner reviews it all at the v1.0.0 sign-off. Plan: [`2026-10-10-m5-overview.md`](docs/superpowers/plans/2026-10-10-m5-overview.md) and sub-plans A–E (presets, manual layout, accessibility, performance and memory, mockups and polish). Every task is merged: A1–A4, B1–B7, C1–C4, D1–D8 and E1–E4 (#153–#162, #166–#182). The milestone-wide final review ran in three parts (layout and render; state, privacy and performance; UI and accessibility) and found no blockers; its fixes are PRs #183 (CI job timeouts), #184 (presets across tabs, failed-save warning) and #185 (full undo and focus in Arrange). The full record — per-task reviews, rulings, the final review with its mutation results, the §3 evidence table, the triage of deferred items, the controller sign-off and every delegated question — is in [`docs/superpowers/ledgers/m5.md`](docs/superpowers/ledgers/m5.md).

- **Presets:** up to 20 named presets (page setup, studies, lines; never anything from a photo, never a guide switched on), kept in settings v5, shared live between open tabs, exported and imported as one JSON file.
- **Arrange mode:** drag, swap, resize and move photos between pages on the preview, with Undo (50 steps), Re-run auto layout, keyboard paths (arrows, Shift + arrows, Enter, Page Up/Down) and tap-only buttons (Position, Width, Swap with…, Move to page). Arrangements live in memory only and are never persisted; the automatic engine and its golden snapshot are unchanged.
- **Exit criterion** (spec §3 met and measured): on master `5d4dd67` (CI run 38071760003) layout of 50 photos in the worker 47 ms (< 500), preview update for 20 photos 14–68 ms per setting kind (< 200), 100 × 12 MP layout 129 ms, initial app JS 229.0 KB (< 250), the spec's 20 × 12 MP case 1023 / 1128 / 1050 MB at import / preview / export (< 1500 / 1500 / 1700), and phone memory that doesn't grow with page count (+9 MB over 60 pages). The full table is in the ledger, "F" → "§3 evidence".
- **Accessibility:** a WCAG 2.2 AA audit over every screen (C3, `e2e/a11y-audit.spec.ts`), single-pointer alternatives for every drag including the crop (C4), and a stricter axe helper that also gates reviewed `incomplete` results. VoiceOver is still to be run by a person (v1.0.0 checklist).
- **No new dependency** (M5-R1).
- **Release:** [#164](https://github.com/omarcocarvalho/artistica/pull/164) (`chore(master): release 0.5.0`) is being merged by the controller (close and reopen, green checks, squash merge), which creates `v0.5.0` and deploys it to Pages.

## Branch map

| Branch | Use |
|---|---|
| `master` | all M1–M5 work; base for new work |
| `release-please--branches--master--components--artistica` | bot-managed; release-please opens the next release PR here. Don't touch it; merge only after a milestone is signed off (M5: the controller, under the owner's delegation; v1.0.0: the owner) |

## Next steps (in order)

1. **Release v0.5.0:** the controller merges release PR #164 (close and reopen it, wait for green checks, `gh pr merge 164 --squash`), then records the merge commit in the M5 ledger and runs the one deferred release step: `curl -sI` on a deployed `.task` model to record the Content-Type GitHub Pages sends.
2. **Plan M6, "Translations & 1.0"** (spec §8): write `docs/superpowers/plans/` for M6 first; under the owner's delegation the controller approves it, then it is built like M5. Start from the M5 ledger's triage (items deferred to M6) and the "i18n (M6)" list below; lazy-load the locale resources (bundle headroom).
3. **The v1.0.0 sign-off, the only owner gate left:** the owner runs the checklist in the M5 overview, ["Phone checklist for the v1.0.0 sign-off"](docs/superpowers/plans/2026-10-10-m5-overview.md) (iPhone items, the macOS Safari VoiceOver pass, WebKit offline, the M4 timings, the final logo), reviews every delegated default in the M5 ledger's "Questions", and signs off before the v1.0.0 release PR merges.

## Owner answers from M2 (2026-10-07)

The owner answered the questions raised in M2 (details in the M2 ledger). Three changed the app, in PR #101:

- **M2-1, yes:** "Apply to all" counts as "last used". The applied study's blur %, value count, hue and neutral become the remembered defaults; versions still don't (new photos start Original only).
- **M2-2, wait for imports:** while any photo is importing, the Studies controls and "Apply to all images" are disabled, with a visible "Waiting for photos to finish importing…" hint (desktop tab and phone step). So "Apply to all" can't run while a photo is still importing.
- **M2-4, yes:** removing the selected image selects the next one, or the previous one if it was last; nothing only when the list is empty.

Kept as built: **M2-3** the one-photo hint copy; **M2-5** the mockup differences; **M2-6** no minimum lightness span for value studies. **M2-7** and **M2-8** were not answered, so their defaults stand: ship v0.2.0 with phone memory growing with page count (gated by the real-phone run) and defer "visible pages only" to M5; keep plan labels in code comments.

## Owner answers from M3 (2026-10-08)

The owner tested M3 on the iPhone and accepted all four recommendations for the questions raised in M3 (details in the [M3 ledger](docs/superpowers/ledgers/m3.md)):

- **M3-1 Spiral wording, answered: keep the spiral and correct the plan wording.** The stretched spiral passes near, not through, the golden-ratio lines' crossing: its eye sits at about 72% of each side (0.724, 0.724), against 61.8% for the crossing. The code is the classic construction and matches the mockup; the M3 overview's Q2 now says so.
- **M3-2 Thick centre-line dashes, answered: M5 polish.** At 2 mm the centre dash is [12, 8] mm, so on tiles under about 12 mm the centre lines look solid; scaling the dash with tile size is M5 work.
- **PQ1 Editable hex field, answered: kept.** The line colour's hex stays an editable text field (#118), because keyboard-only users in WebKit can't reach the colour swatch.
- **PQ2 Up/Down arrows on segmented controls, answered: M5** accessibility polish (app-wide since M1; ours move only on Left/Right).

The owner also ruled, from the same iPhone run, that **the phone Lines section is always open** (ruling D1-R1 in the M3 overview, "Contract change requests → Ruled"): a normal card below the Studies panel with an h3 "Lines" and the "N on" badge, no expand or collapse. The desktop Lines tab is unchanged.

## Owner answers from M4 (2026-10-08 and 2026-10-09)

The owner accepted every recommended default of the M4 plan (Q1–Q14 and the budget question), then Q15 (a browser without WebGL shows a note and offers no download) and Q16 (copy the plan didn't give). Q12 changed on 2026-10-09: the face and body test photos are public-domain photos (credits in `src/features/images/__fixtures__/README.md`), not the owner's. Details in the [M4 overview](docs/superpowers/plans/2026-10-08-m4-overview.md), "Questions for the owner". Q1 is the one to remember: MediaPipe stays on 0.10.35 because 1.x sends usage metrics to Google (see Gotchas).

## Owner questions (open)

**Answered from M4 (2026-10-10):** Q17 (small faces in full-body photos may not be found), Q18 (no running progress announcement) and Q19 (only the result is announced after a Detail change), each with its recommended default, already built. Details in the M4 overview.

**M5, accepted under the delegation:** every M5 question has a default that was built: the plan's Q1–Q12, the M1 questions 2–12 that were still open (Q-H2–Q-H12: inline phone export, a tooltip for the disabled Export reason, the file name as built, Cancel for pending imports, duplicates kept, a 100 MP limit on touch screens, the 5100 px cap kept, crop marks at the minimum gutter as built, drop wording, the compact dropzone, the default unit in spec §2.3), and Q13–Q25 raised during execution and the final review. They are listed in one place, the M5 ledger's ["Questions"](docs/superpowers/ledgers/m5.md) section. Each was accepted by the controller under the delegation; the owner may override any of them at the v1.0.0 sign-off. No M1 question is left open.

## Key decisions & context

**Architecture**

- **One page model, two renderers.** Layout outputs a plain-data `PageModel` in mm. The canvas preview and the PDF exporter both draw from it, so the preview equals the PDF.
- **Pure core, thin UI.** Layout, page models and PDF composition are plain TypeScript with no DOM, and they run in workers through Comlink.
  - The layout worker is `src/features/layout/layout-client.ts`. `layoutAsync` follows a latest-call-wins rule: superseded calls reject with a DOMException `AbortError`.
  - The PDF worker is `src/features/render/export/export-pdf.ts`, and pdf-lib lives only in that worker's chunk.
- **Determinism.** The same photos give the same layout, in any order and in any session.
  - Layout item keys are `${sha256(bytes)}~${occurrence}#${copy}` (`src/features/layout/build-items.ts`).
  - `image.id` is a random UUID, used only for identity.
  - A golden snapshot test (`src/features/layout/golden.test.ts`) pins the layouts.
  - PDFs carry no CreationDate (ruling D-2).
- **Privacy.**
  - Images live in memory only, in the `useImages` store. Only settings are persisted, in `localStorage` under `artistica:settings`, validated with Zod.
  - Every E2E spec installs a strict network guard (`e2e/support/network-guard.ts`). It flags any non-same-origin request and any WebSocket.
  - `e2e/privacy.spec.ts` also checks that storage holds only the settings.
  - A leave-page warning appears while images exist.
  - Guides (M4): photos are analysed on the device only. The AI runtime and models come from our own site, are downloaded only after a tap ("Download & turn on"), and are verified by size and SHA-256 against the build's manifest; loads without a tap read the cache only and show the download box again if a copy is missing or corrupt (M4-R19). The landmark worker's fetch guard (`installFetchGuard`, M4-R4) allows only the worker's own `blob:` URLs, locked on every prototype that has the API. The build and every deploy run the host audit (`scripts/audit-hosts.ts`), which fails if a shipped file names another host. Guide switches are never persisted; only the edge Detail is, with the line style (settings v4).

**Gotchas**

- **Errors lose their class across Comlink.** A `RangeError` from the worker arrives as a plain `Error` with `name === 'RangeError'`, so always check `err.name`.
- **Crops are fractional source pixels.** The export worker crops with `integerCropBox` and renders with `forCroppedSource`. The cache key comes from the *original* plan (ruling D-1).
- **ExportDialog doesn't auto-start.** The user clicks "Create PDF", and "Download PDF" is an `<a download>`.
- **The default unit depends on locale.** It is inches for en-US and en-CA and mm elsewhere. E2E tests switch to mm first.
- **Import batches resolve to `null` when "Remove all" interrupts them.** Callers show nothing for `null`.
- **The app needs a secure context.** It uses `crypto.subtle` and `crypto.randomUUID`.
- **Dialogs return focus to whatever opened them.** If the opener is gone, they use the `returnFocus` fallback (`src/shared/ui/use-return-focus.ts`). WebKit doesn't focus buttons on mouse click, so with the mouse in Safari focus can return to the nearest focusable ancestor. The keyboard path is correct.
- **CI release PRs don't trigger checks.** A release PR opened by `GITHUB_TOKEN` doesn't run CI. A person must close and reopen it.
- **Branch protection uses `strict: false`.** Two green PRs can still conflict, so check `master` CI after merges. `gh pr update-branch <n>` can't resolve conflicts; merge `origin/master` into the branch instead.
- **PDF resource names must not come from pdf-lib's seeded generator for anything optional.** Line opacity uses `setExtGState` with `GS0`, `GS1`, … per page; a seeded name would shift the image names on later pages (#113).
- **E2E specs import pure `src` modules through `tsconfig.e2e.json`** (bundler resolution, `.ts` extensions allowed in `e2e/` only). `src` imports stay extensionless.
- **zustand `persist` writes after every `set`**, even when the updater returns the same state. A setter that must not write on equal values skips `set` (#108).
- **macOS has no `timeout` command.**
- **pnpm bootstrap:** if the global `pnpm` shim fails to bootstrap the pinned pnpm version, run `corepack pnpm …`.

**M4 gotchas**

- **MediaPipe stays pinned at exactly `0.10.35` (M4-R1, owner Q1).** Versions 1.0.0 and later POST usage metrics to `odml.pa.googleapis.com` every 60 s while a detector is open, with no opt-out, which breaks "no analytics, ever". `pnpm up --latest` or `pnpm outdated` will offer 1.x: don't take it. Upgrade only to a version whose shipped files pass the host audit, and never auto-merge a bump of this package. pnpm 12 also refuses versions younger than its release-age window (24 h by default; a local `minimum-release-age` can be longer), so a fresh release may not install at all.
- **The host audit runs at build and at deploy.** `node scripts/audit-hosts.ts dist` runs in CI's required `build` job and in `deploy-pages.yml` between the build and the upload (the release deploys through that workflow); `scripts/deploy-workflows.test.ts` fails if either check is removed, made conditional or moved after the upload. It flags any link to another host in any `scheme://` form (any case, `\/`-escaped, quoted protocol-relative `//host`) and any name under `googleapis.com` except the exact protobuf name `type.googleapis.com`. Allow-list entries are exact shipped strings (or path prefixes ending in `/`) that the app never requests; a dependency bump that changes them fails the build until the new string is checked and listed.
- **Service worker:** see "Service worker recovery" below for the kill switch. New versions take over only after every Artistica tab has closed (no `skipWaiting`).
- **Playwright's WebKit can't test offline.** It fails an offline reload through a service worker ("WebKit encountered an internal error", `C1-R1`), so G-X1 runs on chromium and firefox only, and WebKit offline is checked on the owner's iPhone. Its ephemeral contexts also lose Cache Storage entries on a reload, so a WebKit test can't expect a cached model to survive one.
- **Real face and pose detection runs in CI on chromium and mobile-chromium only.** MediaPipe needs WebGL even on the CPU delegate: CI's Linux Firefox has none (it covers the "needs WebGL" path, owner Q15), and CI's Linux WebKit has it on the page only (the main-thread engine, covered by unit tests). The pose fixture recorded on macOS differs from Linux chromium by up to 1.44e-3 mm, so E2E compares it within `POSE_RECORDING_TOL_MM` (0.01 mm).
- **Memory: CI Linux is the gate, not your Mac.** The memory test M3 fails locally on macOS arm64 (settled after guides about +155 to +185 MB, sometimes over 1500 MB in the guides phase) because RSS there counts reclaimable pages the browser has already given back; the renderer's footprint shows dirty memory flat while reclaimable memory grows. CI's Linux meets every budget. A local macOS failure of that test alone is not a regression; a CI failure is.
- **Release on drain.** The scheduler closes the landmark worker and drops the model bytes as soon as the landmark queue drains (and the edge worker likewise), so every detection after an idle moment starts a worker and reads the model from Cache Storage again: about 0.5 s on CI for a later face as well as the first. A guide switched off during a job keeps the engine for 2 s, so quick toggles don't churn workers.
- **The WebKit CI job sometimes hangs in "Install OS deps only (cache hit)".** The hang is in that setup step, before any test runs; re-run the failed job (`gh run rerun <run-id> --failed`) and it clears. Since #183 every job has a `timeout-minutes` (e2e 50 min), so a hang fails the job instead of holding CI for GitHub's 360-minute default.

**M5 gotchas**

- **Memory: CI Linux is still the gate, not your Mac.** The M5 memory tests (M5a, M5b, M5c in `e2e/mobile-flow.spec.ts`, mobile-chromium) read high on macOS arm64 like M3 does: M3's guides phase reached 1521 MB and M5b grew +333 MB under parallel load locally, while CI stays inside every budget. A local macOS failure alone is not a regression; a CI failure is. Run M5b alone when you need a local figure.
- **`aria-disabled`, not `disabled`, for a button that can turn itself off while focused** (Undo, Re-run auto layout, Apply, Create PDF, the preset buttons, the crop buttons). Native `disabled` drops focus to `<body>` (WCAG 2.4.3). Use `aria-disabled` with a guarded click; the shared style is `.ds-btn[aria-disabled='true']`, and Playwright's `toBeDisabled` honours it. Such a button stays a Tab stop while off.
- **axe `incomplete` results are gated.** `expectNoAxeViolations` in `e2e/support/axe.ts` fails on any `incomplete` node not covered by `REVIEWED_INCOMPLETE` (rule, selector and reason, each entry naming the check that backs it). A new screen with an unjudgeable node needs a re-check, a fix or a reviewed entry, never a blanket one. Every axe call in `e2e/` goes through this helper.
- **Live messages in unit tests:** `Callout live` and error toasts mount their text two animation frames after the region (`useAfterPaint`), so a unit test reads a live message with `waitFor` or `findBy`, never right after an `await` (C3 Ruled item 2).
- **Touch screens refuse photos over 100 MP** (`MAX_DECODED_PIXELS_TOUCH` in `src/features/images/limits.ts`, read through `decodedPixelLimit()` when a photo is added, primary pointer `coarse`). Desktop keeps 200 MP, and export decodes up to 200 MP, so a photo already added always exports. A higher touch limit needs a measured size within 1500 MB first (D7).
- **Bundle headroom for M6:** initial app JS is 229.0 of 250 KB gzip at `5d4dd67`. `src/shared/i18n/resources.ts` loads every `src/locales/*/*.json` with an eager `import.meta.glob`, so adding six languages as they are would put them all in the main chunk; M6 should lazy-load the locale resources. The required `build` job fails above 250 KB.
- **Presets sync between tabs, the rest of the settings don't.** The settings store adopts another tab's presets from a `storage` event (same envelope version only) without writing back; page setup, unit, theme and language stay per tab. Arrangements are never persisted.
- **The pipeline runs a change at once after 80 ms of quiet** and waits for a trailing 80 ms in a burst (D8). An E2E test that adds photos and then clicks a tile must wait for the preview to settle (`app.expectPreviewSettled()` from `e2e/support/app.ts`; the preview is `aria-busy` until the trailing run), or the click can land on a tile the next run moved.

**Service worker recovery**

From E2 on, production registers a service worker (`/artistica/sw.js`, scope `/artistica/`, `src/sw/`; M4-R20). Users keep it after a deploy, so a broken one needs a way out:

- Any later deploy reaches every installed worker. `sw.js` keeps its URL, is registered with `updateViaCache: 'none'` (Pages' `max-age=600` can't pin it), and the browser checks it on each navigation in scope and at least once a day. Navigations are network-first, so an online user gets the deployed HTML even while an old worker is in charge, unless the network takes longer than 5 s (C5-R1).
- **Kill switch:** in a PR, set `serviceWorker({ killSwitch: true })` in `vite.config.ts`, merge it, then deploy (`gh workflow run deploy-pages.yml --ref master`, or the next release). The deployed `sw.js` takes over at once, deletes every `artistica-shell-*` cache (never the AI models in `artistica-ai-v1`) and unregisters itself. Open tabs fall back to the network; the next load is uncontrolled. While it is on, each app load registers and drops it again; to keep the worker off for longer, also remove the `registerServiceWorker()` call in `src/app/main.tsx`. To restore, revert the flag.
- Check it locally with `pnpm build && pnpm preview` and a browser that already has the old worker: after one navigation, `navigator.serviceWorker.getRegistration('/artistica/')` resolves to `undefined` and `caches.keys()` lists no `artistica-shell-*`.

**Process**

Plans were executed with subagent-driven development: one worktree and PR per task, an independent review (often with mutation testing), fix rounds, then a squash merge.

- Every ruling made during execution is recorded in the ledgers (`docs/superpowers/ledgers/m1-*.md`, `m2.md`, `m3.md`, `m4.md`, [`m5.md`](docs/superpowers/ledgers/m5.md)).
- Under a delegation (M5 onwards), the controller approves plans and accepts each question's recommended default; the questions are collected in the ledger for the owner's review at the next owner sign-off.
- Contract changes are in the overview's "Ruled" section (CR-*/CCR-*).

**Rejected or overridden approaches**

- **C-1:** URL import counts streamed bytes and aborts at the size cap. The plan's original approach trusted `Content-Length`, which isn't reliable.
- **D-1:** the original approach rounded crops in the brief, which broke the canvas size cap.
- **A-5:** one M1-wide final review was chosen instead of five per-plan reviews.
- **Containers:** none are used (owner decision).

## Setup & run

There are no env vars, secrets or external services. It is a static app, so there is no `.env.example`.

```bash
# Node 24 (fnm/nvm: .node-version / .nvmrc), pnpm via corepack (version pinned in package.json)
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

**CI** has 8 required checks (every job with a `timeout-minutes`, which `scripts/deploy-workflows.test.ts` requires): `lint`, `typecheck`, `unit`, `build` (with the bundle budget and the host audit), `e2e (chromium)`, `e2e (firefox)`, `e2e (webkit)` and `pr-title`. The webkit leg also runs the `mobile-webkit` project. Merges are squash-only, with Conventional Commit PR titles.

## Known issues (deferred)

The final review triaged every "minor (deferred)" line in `docs/superpowers/ledgers/*.md`. The items below are the ones that matter after M1. The other ledger minors are deferred to M2+ or judged not to be issues.

**Memory**

- **Per-image memory:** each image keeps its compressed source Blob and a preview ImageBitmap of at most `PREVIEW_LONG_SIDE_PX` (2048 px, about 12.6 MB). Export decodes one image at a time at full size from the source, so export is slower than holding full-size bitmaps (by design, #75).
- **Fixed in M5:** pages far from the view release their canvases and study tiles (D1, so phone memory no longer grows with the page count), a stalled study job ends after 20 s (D2), waiting downloads hold a download slot and Cancel or Remove all aborts them and the CORS probe (D3), and WebKit decodes large photos straight to their downscaled size (D5).
- **Many photos on a phone (Q17):** 60 photos of 12 MP settle at about 1565 MB before the preview on CI's phone emulation, above the 1500 MB budget of the spec's 20 photos. There is no count limit; the v1.0.0 phone checklist loads 60 photos, and a warning is M6 work only if the tab closes.

**Deferred to M6 by the M5 final review** (triage table in the [M5 ledger](docs/superpowers/ledgers/m5.md), "F"):

- A centre line on the tiniest tiles (about 12 × 8 mm) can look solid where its only gap falls under the crossing line; the fix is a dash phase.
- The "Can't place here" drag ghost is clipped when a photo is dragged past the preview scroller (the refused drop is still announced).
- No auto-scroll near the edge during a desktop drag (the wheel, Move to page and Page Up/Down cover it).
- Bundle headroom: lazy-load the locale resources (see the M5 gotchas).
- Optional: a committed E2E test for Cancel.

**i18n (M6)**

Only English ships until M6, so these don't show yet:

- `pageTitle('App')` is hard-coded English.
- The export summary shows the raw paper id ("Custom").
- The unit codes `mm`/`in` are interpolated raw in `ImageEditSheet` and `ImageList`.
- Some strings are built by concatenation in `ThemeToggle`, `import-notices` and `PageSetupPanel`. Each needs to become one key with interpolation.
- Slider numbers are not formatted by locale.

**Tests**

- Timing tests (`*/perf.test.ts`) run uninstrumented with `pnpm test:perf`; `pnpm test:coverage` skips them.

- `src/features/layout/golden.test.ts` peaked at about 3.3 s on CI, under the 5 s default timeout. It isn't flaking yet.
- `src/features/layout/perf.test.ts` timings are load-sensitive. The CI bound is 2000 ms; the measured CI peak was 924 ms.

**Layout quality**

- **B3:** the fresh-page fallback can cost a page under the wide/tall policies. The `free` policy is always tried too, and the best result wins.

**Guides (M4)**

The M4 final review triaged every deferred item; the table is in the [M4 ledger](docs/superpowers/ledgers/m4.md), "Final review (task F)". The ones to know:

- **Known limit of the worker guard:** native `import()` syntax and the imports of a `blob:` module are fetched by the browser, not through the worker's APIs, so no guard can refuse them. MediaPipe 0.10.35 uses neither; the exact pin and the host audit are the controls.
- **E2E gaps that CI can't close:** Firefox with WebGL (face and pose there were checked by hand in the final review) and WebKit offline (the owner's iPhone run).

## Related links

- Repo: https://github.com/omarcocarvalho/artistica
- Live site: https://omarcocarvalho.github.io/artistica/
- Releases: https://github.com/omarcocarvalho/artistica/releases
- Spec: [docs/spec.md](docs/spec.md)
- Plans: [docs/superpowers/plans/](docs/superpowers/plans/) — M1 starts at `2026-10-03-m1-overview.md`, M2 at `2026-10-07-m2-overview.md`, M3 at `2026-10-07-m3-overview.md`, M4 at `2026-10-08-m4-overview.md`, M5 at `2026-10-10-m5-overview.md`
- Execution ledgers (progress, rulings, deferred minors per task): [docs/superpowers/ledgers/](docs/superpowers/ledgers/)
- Design mockups: [design/](design/) (open `design/index.html`)
