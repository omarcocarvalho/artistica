# Handover: Artistica (state as of 2026-10-07)

This is for the next developer and their AI agent. Read it first, then [CLAUDE.md](CLAUDE.md) for conventions. The default branch is **`master`**. There is no `main` branch.

## Project overview

Artistica is a free, static web app for artists:

- Load reference photos (upload, paste, drop, link, or HEIC from phones).
- Crop and rotate them.
- Pack them onto printable pages.
- Export a print-ready PDF with crop marks and bleed.

- Print study versions of each photo: blurred (a squint study), values (2–20 tones of one hue), or blur + values, next to the original.

Later milestones add composition lines (some AI, in the browser), polish, and translations.

- **Everything runs in the browser.** Photos are never uploaded or persisted.
- **Hosting:** GitHub Pages. The landing page is at `/artistica/` and the tool at `/artistica/app/`.
- **Product spec:** [docs/spec.md](docs/spec.md). It is the source of truth.
- **Milestones:** M0 → `v0.0.1` (released), M1 → `v0.1.0` (released), M2 → `v0.2.0` (built; awaiting owner sign-off), M3–M5 → `v0.3.0`–`v0.5.0`, M6 → `v1.0.0`.

## Current status

**M0 is done** and released as `v0.0.1`.

**M1 ("print-ready PDF from photos") is done** and released as [`v0.1.0`](https://github.com/omarcocarvalho/artistica/releases/tag/v0.1.0). Its plans are `docs/superpowers/plans/2026-10-03-m1-*.md` and its ledgers `docs/superpowers/ledgers/m1-*.md`. The owner's real-phone check found an export crash on an iPhone (22 × 24 MP HEIC); #75 fixed it by keeping compressed sources and 2048 px preview bitmaps, and decoding full resolution one image at a time at export.

**M2 ("image studies") is built, reviewed and merged. It waits for the owner's sign-off.** Plan: [`2026-10-07-m2-overview.md`](docs/superpowers/plans/2026-10-07-m2-overview.md) and sub-plans A–D, approved by the owner on 2026-10-07 with every recommended default (PR #77). All 18 tasks are merged (#78, #79, #81–#95 and #97), then the milestone-wide final review in three parts and its fixes (#96, #98, #99). The full record — per-task review findings, rulings, deferred items and the owner questions — is in [`docs/superpowers/ledgers/m2.md`](docs/superpowers/ledgers/m2.md).

- **Exit criterion** ("an image next to its blurred version and its 5-value version prints correctly"): pinned by E2E test S-X1 in `e2e/studies.spec.ts` on chromium, firefox and webkit — three equal tiles, two JPEGs and one PNG with exactly 5 colours, the Blurred tile measurably blurred.
- **Phone memory** (M3 in `e2e/mobile-flow.spec.ts`, 22 × 24 MP photos × 3 versions, CI): import 1169 MB, studies 1327 MB, settled 1150 MB, export 1285 MB, against budgets of 1500 / 1500 / 1700 MB.
- **Phone controls** are 44 px on touch screens, and phone inputs use 16 px text so iOS doesn't zoom on focus (#97, owner answer H1).

**Release:** the release-please PR [#80](https://github.com/omarcocarvalho/artistica/pull/80) (`chore(master): release 0.2.0`) is open. Don't merge it before the owner signs off.

## Branch map

| Branch | Use |
|---|---|
| `master` | all M1 and M2 work; base for new work |
| `release-please--branches--master--components--artistica` | bot-managed; release-please opens the next release PR here. Don't touch it; merge only after the owner signs off a milestone |

## Next steps (in order)

1. **Owner sign-off for v0.2.0:** deploy `master` to Pages (`gh workflow run deploy-pages.yml --ref master`) and run the "M2 sign-off checklist (owner, on a real phone)" in the M2 overview on the owner's iPhone over HTTPS, including printing the exit-criterion sheet. Bring the owner questions below.
2. **Release v0.2.0 after approval** (steps for any milestone):
   1. Run `gh pr view <n> --json mergeable` on the release PR until it isn't `UNKNOWN`.
   2. Close and reopen the PR and wait for the checks to pass.
   3. Run `gh pr merge <n> --squash` from the main checkout. This creates the release and deploys to Pages.
3. **Start M3** (composition lines): write the M3 plan in `docs/superpowers/plans/` and get owner approval **before** coding. Fold in the owner's answers below.

## Owner questions (open)

The spec doesn't answer these. Nothing was changed for them.

**Raised in M2** (details in the M2 ledger):

- **M2-1.** Should "Apply to all" count as "last used" for the remembered study defaults?
- **M2-2.** A photo whose import finishes after "Apply to all" gets the default study, not the applied one. Change?
- **M2-3.** Copy for the single-image "Apply to all" hint ("Add another photo to copy these settings to it.").
- **M2-4.** Removing the selected image on desktop leaves nothing selected. Move the selection to the next image?
- **M2-5.** Mockup differences: tab icons, a bare "5" readout, an image-name label under each group outline — adopt or accept as built?
- **M2-6.** Value studies of low-contrast photos stretch noise into full-contrast speckle. Add a minimum lightness span?
- **M2-7.** Ship with phone memory growing with page count (gated by the real-phone run), and defer "visible pages only" to M5?
- **M2-8.** Plan-label shortcodes in code comments (`M2-R5`, `Q11`, …): keep, or remove in M5?

**Left open from M1** (Q1 was answered in M2 as H1: phone controls are now 44 px):

2. **Phone export:** export opens the same centred dialog as on desktop (ruling Q10). `design/mobile-flow.html` shows it inline in the Export step, and the user currently meets two "Create PDF" buttons in a row. Keep it, make it a bottom sheet, or put it inline?
3. **Disabled Export button:** should the reason it is disabled be visible? Today it is only announced to screen readers.
4. **Export file name:** `artistica-A4-…` (as in the spec's D10 example) or `artistica-a4-…` (as in the mockup)?
5. **Cancelling imports:** should the user be able to cancel a pending import, such as a slow link? "Remove all" is hidden while no image has loaded yet.
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
- **macOS has no `timeout` command.**
- **pnpm bootstrap:** if the global `pnpm` shim fails to bootstrap the pinned pnpm version, run `corepack pnpm …`.

**Process**

Plans were executed with subagent-driven development: one worktree and PR per task, an independent review (often with mutation testing), fix rounds, then a squash merge.

- Every ruling made during execution is recorded in the ledgers (`docs/superpowers/ledgers/m1-*.md`, `m2.md`).
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
- **Pages:** every mounted page keeps its canvases and its wanted study tiles, so phone memory grows with the page count. Wanting study tiles only for pages near the viewport is the planned fix (owner question M2-7).
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
- Plans: [docs/superpowers/plans/](docs/superpowers/plans/) — M1 starts at `2026-10-03-m1-overview.md`, M2 at `2026-10-07-m2-overview.md`
- Execution ledgers (progress, rulings, deferred minors per task): [docs/superpowers/ledgers/](docs/superpowers/ledgers/)
- Design mockups: [design/](design/) (open `design/index.html`)
