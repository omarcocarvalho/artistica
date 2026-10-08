# Handover: Artistica (state as of 2026-10-08)

This is for the next developer and their AI agent. Read it first, then [CLAUDE.md](CLAUDE.md) for conventions. The default branch is **`master`**. There is no `main` branch.

## Project overview

Artistica is a free, static web app for artists:

- Load reference photos (upload, paste, drop, link, or HEIC from phones).
- Crop and rotate them.
- Pack them onto printable pages.
- Export a print-ready PDF with crop marks and bleed.

- Print study versions of each photo: blurred (a squint study), values (2–20 tones of one hue), or blur + values, next to the original.
- Draw composition lines on each photo (grid, rule of thirds, diagonals and armature, golden ratio lines, golden spiral, centre lines), as vector paths in the PDF.

Later milestones add AI lines (in the browser), polish, and translations.

- **Everything runs in the browser.** Photos are never uploaded or persisted.
- **Hosting:** GitHub Pages. The landing page is at `/artistica/` and the tool at `/artistica/app/`.
- **Product spec:** [docs/spec.md](docs/spec.md). It is the source of truth.
- **Milestones:** M0 → `v0.0.1` (released), M1 → `v0.1.0` (released), M2 → `v0.2.0` (released), M3 → `v0.3.0` (released), M4 → `v0.4.0` (in progress), M5 → `v0.5.0`, M6 → `v1.0.0`.

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

**M4 ("AI-assisted lines" → `v0.4.0`) is approved and in progress (owner, 2026-10-08: all recommended defaults accepted; the owner supplies the face and body test photos).** Plan: [`2026-10-08-m4-overview.md`](docs/superpowers/plans/2026-10-08-m4-overview.md) and sub-plans A–E (guides core, edge outline, AI runtime and offline, state and render, UI and E2E): 19 tasks in 6 waves, then the final review. It has 14 owner questions plus a budget question. **Q1 blocks the runtime work:** `@mediapipe/tasks-vision` 1.0.0 and later send usage metrics to Google (`odml.pa.googleapis.com`) with no opt-out; the plan recommends pinning 0.10.35, which doesn't.

## Branch map

| Branch | Use |
|---|---|
| `master` | all M1, M2 and M3 work; base for new work |
| `release-please--branches--master--components--artistica` | bot-managed; release-please opens the next release PR here. Don't touch it; merge only after the owner signs off a milestone |

## Next steps (in order)

1. **Owner gate after spike C1:** if the AI runtime is too heavy for phones (the iPhone misses the memory or speed budgets), stop before C2 and C4 and decide another approach with the owner.
2. **Run M4** subagent-driven, wave by wave, as in M3; record rulings in a new `docs/superpowers/ledgers/m4.md`.
3. **Release v0.4.0** after the owner's real-phone sign-off (steps for any milestone):
   1. Run `gh pr view <n> --json mergeable` on the release PR until it isn't `UNKNOWN`.
   2. Close and reopen it and wait for the checks to pass.
   3. Run `gh pr merge <n> --squash` from the main checkout. This creates the release and deploys to Pages.

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

## Owner questions (open)

The spec doesn't answer these. Nothing was changed for them.

**Left open from M1** (Q1 was answered in M2 as H1: phone controls are now 44 px; for Q5 and Q6 the owner accepted the M3 defaults H1 and H2 — unchanged in M3, cancelling to be decided in M5 — so both stay open):

2. **Phone export:** export opens the same centred dialog as on desktop (ruling Q10). `design/mobile-flow.html` shows it inline in the Export step, and the user currently meets two "Create PDF" buttons in a row. Keep it, make it a bottom sheet, or put it inline?
3. **Disabled Export button:** should the reason it is disabled be visible? Today it is only announced to screen readers.
4. **Export file name:** `artistica-A4-…` (as in the spec's D10 example) or `artistica-a4-…` (as in the mockup)?
5. **Cancelling imports:** should the user be able to cancel a pending import, such as a slow link? "Remove all" is hidden while no image has loaded yet. Since M2-2, a pending import also keeps the Studies controls disabled until it ends (a link stalls out after 30 s without progress).
6. **Duplicate photos:** the same file added twice is kept as two images. Keep that, merge them, or flag them?
7. **Phone image limit:** decoding up to 200 MP is allowed and will likely crash a phone tab. Should phones get a lower limit?
8. **Custom paper vs the 5100 px downscale cap:** custom paper goes up to 1200 mm, but 5100 px covers only about 432 mm at 300 DPI. Large custom pages show early low-DPI warnings. Raise the cap for Custom, or accept the limit?
9. **Crop marks with bleed:** at the minimum gutter (2 × bleed), marks between neighbouring photos are dropped (spec §2.3). In an irregular layout an interior photo can end up with no marks. Should the gutter grow when marks and bleed are both on?
10. **Drop copy:** dropping something with no image says "No image on the clipboard". Should drops get their own wording?
11. **Empty state:** it uses the *compact* dropzone, because the card variant repeated the EmptyState headline.
12. **Default unit:** the locale-based default unit (Q8: inches for en-US and en-CA) is recorded only in the plan overview. Should `docs/spec.md` mention it?

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

**Service worker recovery**

From E2 on, production registers a service worker (`/artistica/sw.js`, scope `/artistica/`, `src/sw/`; M4-R20). Users keep it after a deploy, so a broken one needs a way out:

- Any later deploy reaches every installed worker. `sw.js` keeps its URL, is registered with `updateViaCache: 'none'` (Pages' `max-age=600` can't pin it), and the browser checks it on each navigation in scope and at least once a day. Navigations are network-first, so an online user gets the deployed HTML even while an old worker is in charge, unless the network takes longer than 5 s (C5-R1).
- **Kill switch:** in a PR, set `serviceWorker({ killSwitch: true })` in `vite.config.ts`, merge it, then deploy (`gh workflow run deploy-pages.yml --ref master`, or the next release). The deployed `sw.js` takes over at once, deletes every `artistica-shell-*` cache (never the AI models in `artistica-ai-v1`) and unregisters itself. Open tabs fall back to the network; the next load is uncontrolled. While it is on, each app load registers and drops it again; to keep the worker off for longer, also remove the `registerServiceWorker()` call in `src/app/main.tsx`. To restore, revert the flag.
- Check it locally with `pnpm build && pnpm preview` and a browser that already has the old worker: after one navigation, `navigator.serviceWorker.getRegistration('/artistica/')` resolves to `undefined` and `caches.keys()` lists no `artistica-shell-*`.

**Process**

Plans were executed with subagent-driven development: one worktree and PR per task, an independent review (often with mutation testing), fix rounds, then a squash merge.

- Every ruling made during execution is recorded in the ledgers (`docs/superpowers/ledgers/m1-*.md`, `m2.md`, `m3.md`).
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

**CI** has 8 required checks: `lint`, `typecheck`, `unit`, `build` (with a bundle budget), `e2e (chromium)`, `e2e (firefox)`, `e2e (webkit)` and `pr-title`. The webkit leg also runs the `mobile-webkit` project. Merges are squash-only, with Conventional Commit PR titles.

## Known issues (deferred)

The final review triaged every "minor (deferred)" line in `docs/superpowers/ledgers/*.md`. The items below are the ones that matter after M1. The other ledger minors are deferred to M2+ or judged not to be issues.

**Memory (M5)**

- **Per-image memory:** each image keeps its compressed source Blob and a preview ImageBitmap of at most `PREVIEW_LONG_SIDE_PX` (2048 px, about 12.6 MB). Export decodes one image at a time at full size from the source. The M3 E2E test guards the browser's RSS with 22 × 24 MP photos and three study versions. Export is slower than holding full-size bitmaps, because every image is decoded again.
- **Pages:** every mounted page keeps its canvases and its wanted study tiles, so phone memory grows with the page count. Wanting study tiles only for pages near the viewport is the planned fix, deferred to M5 (M2-7 default).
- **Study worker:** a worker killed without an `error` event leaves the preview study queue busy (no job timeout). Export is unaffected.
- **Downloads waiting to decode:** finished URL downloads wait for a decode slot without holding a download slot. Memory is bounded only by how fast links download compared with how fast images decode.
- **CORS probe:** the probe request after a failed fetch keeps its own 8 s timeout and is not cancelled by "Remove all". Its result is discarded.

**i18n (M6)**

Only English ships until M6, so these don't show yet:

- `pageTitle('App')` is hard-coded English.
- The export summary shows the raw paper id ("Custom").
- The unit codes `mm`/`in` are interpolated raw in `ImageEditSheet` and `ImageList`.
- Some strings are built by concatenation in `ThemeToggle`, `import-notices` and `PageSetupPanel`. Each needs to become one key with interpolation.

**Tests**

- Timing tests (`*/perf.test.ts`) run uninstrumented with `pnpm test:perf`; `pnpm test:coverage` skips them.

- `src/features/layout/golden.test.ts` peaked at about 3.3 s on CI, under the 5 s default timeout. It isn't flaking yet.
- `src/features/layout/perf.test.ts` timings are load-sensitive. The CI bound is 2000 ms; the measured CI peak was 924 ms.

**Layout quality**

- **B3:** the fresh-page fallback can cost a page under the wide/tall policies. The `free` policy is always tried too, and the best result wins.

## Related links

- Repo: https://github.com/omarcocarvalho/artistica
- Live site: https://omarcocarvalho.github.io/artistica/
- Releases: https://github.com/omarcocarvalho/artistica/releases
- Spec: [docs/spec.md](docs/spec.md)
- Plans: [docs/superpowers/plans/](docs/superpowers/plans/) — M1 starts at `2026-10-03-m1-overview.md`, M2 at `2026-10-07-m2-overview.md`, M3 at `2026-10-07-m3-overview.md`, M4 at `2026-10-08-m4-overview.md`
- Execution ledgers (progress, rulings, deferred minors per task): [docs/superpowers/ledgers/](docs/superpowers/ledgers/)
- Design mockups: [design/](design/) (open `design/index.html`)
