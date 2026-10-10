# Artistica — notes for Claude

> **Picking up this project? Read [HANDOVER.md](HANDOVER.md) first.** It has the current state, the branch map and the prioritised next steps. Per-task progress, rulings and deferred issues for each milestone are in `docs/superpowers/ledgers/`.

Artistica is a free, static web app for artists: load reference photos, pack them onto printable pages, export a print-ready PDF (crop marks, bleed), plus study versions (blur, values) and composition/construction lines (some AI, in-browser).

- Live: https://omarcocarvalho.github.io/artistica/ (landing `/`, tool `/app/`)
- Repo: `omarcocarvalho/artistica` (public, MIT, default branch **`master`**)
- **Source of truth:** `docs/spec.md`. Per-milestone implementation plans: `docs/superpowers/plans/`. Design mockups: `design/`.
- If the spec doesn't answer a product question, **don't guess** — see "Working agreement" below.

## Stack

TypeScript (strict) · Node 24 · pnpm (pinned via `packageManager`) · Vite + React · Tailwind CSS v4 · Radix UI (from M1) · Zustand + Zod · Web Workers + Comlink · pdf-lib · i18next (from M1) · Vitest + fast-check · Playwright (+ @axe-core/playwright) · ESLint (flat) + typescript-eslint · Prettier.

Dependency versions are pinned exactly (no `^`/`~`). TypeScript stays on 6.0.x until typescript-eslint supports 7.

## Commands

```bash
corepack enable && pnpm install   # setup (Node 24: `fnm use`)
pnpm dev            # dev server → http://localhost:5173/artistica/
pnpm build          # tsc -b && vite build → dist/
pnpm preview        # serve dist/ → http://localhost:4173/artistica/
pnpm lint           # ESLint, zero warnings allowed
pnpm format         # Prettier write   | pnpm format:check — CI uses this
pnpm typecheck      # tsc -b
pnpm test           # Vitest (unit + property tests) | pnpm test:watch
pnpm test:coverage  # unit tests with the coverage gate (CI); skips the timing tests
pnpm test:perf      # timing tests (*/perf.test.ts), uninstrumented; CI runs them in the unit job
pnpm e2e            # Playwright, all projects (chromium, firefox, webkit, mobile-chromium, mobile-webkit)
pnpm e2e --project=chromium   # one browser
# In parallel worktrees use a unique port, e.g. E2E_PORT=4201 pnpm e2e
```

Before opening a PR, run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm e2e --project=chromium`.

## Folder layout

```
landing/          landing page: page.html template + locales/<code>.json, rendered per language
                  (/ for en, /<code>/ otherwise) by scripts/vite-landing.ts; main.ts is behaviour only
app/index.html    tool entry (/app/)
src/
  app/            React shell, routing, layout, theme, i18n setup
  features/
    images/       intake (upload/paste/URL), decode (HEIC, EXIF), per-image edits
    page-setup/   paper sizes, units, safe area, gutter, marks, bleed
    layout/       layout engine (pure TS, no DOM) + worker wrapper
    studies/      blur, values, colour ramps (pure functions on pixel data) + worker
    lines/        composition-line geometry (pure TS); AI lines (M4)
    render/       page model → canvas preview renderer & PDF renderer
    settings/     persisted settings store, schema version + migrations
  shared/         units, colour maths (OKLCH), geometry, UI components
public/models/    self-hosted MediaPipe models (M4)
e2e/              Playwright tests
docs/             spec.md, superpowers/plans/
design/           HTML mockups
```

Architecture rules:
- **One page model, two renderers.** The layout engine outputs a plain-data `PageModel` (mm). The canvas preview and the PDF exporter both draw from it; preview must equal PDF.
- **Pure core, thin UI.** Layout, studies, colour ramps and line geometry are plain TS with no browser APIs, unit-tested directly, run in workers via Comlink.
- **Deterministic:** the same input always gives the same layout.

## Non-negotiable product rules

- **Privacy:** never persist or upload images. No network request may carry a photo. Images live in memory only; only the `settings` store is persisted (`localStorage`, Zod-validated). No analytics, ever.
- **i18n (from M1):** no hard-coded UI strings. All user-visible text goes through i18next; `eslint-plugin-i18next` enforces it. Only English ships until M6.
- **Accessibility:** WCAG 2.2 AA, keyboard-only usable, visible focus, correct ARIA. Every screen gets an axe scan in E2E.
- **Browsers:** latest Chrome, Edge, Firefox, Safari, desktop + mobile.

## Git, PRs and releases

- **Never push to `master`.** Every change goes through a PR from a branch.
- **Branch names:** `feat/…`, `fix/…`, `chore/…`, `docs/…`, `ci/…`, `test/…`; the prefix matches the Conventional Commit type of the change.
- **Squash merge only.** The **PR title becomes the commit message** and must be a Conventional Commit: `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`, `build:`, `refactor:`, `perf:`, `style:`, `revert:` (optional scope, e.g. `feat(layout): …`). The `pr-title` check enforces it. The PR body becomes the commit body.
- **Auto-merge:** open every PR with auto-merge on; it merges when all required checks are green, no human approval needed:
  ```bash
  gh pr create --base master --title "feat: …" --body "…"
  gh pr merge --auto --squash
  ```
- **Coverage (from M1):** unit-test coverage threshold of 80% on the core modules (the `include` list in `vite.config.ts`: layout, studies, render, shared colour and the study model), enforced in CI.
- **Required checks:** `lint`, `typecheck`, `unit`, `build`, `e2e (chromium)`, `e2e (firefox)`, `e2e (webkit)`, `pr-title`. Never add `paths:` filters to these workflows (a PR whose required checks never run can never merge).
- **Releases: one per milestone.** release-please keeps a release PR (`chore(master): release x.y.z`) open. It is **never auto-merged**. At the end of a milestone, after the owner signs off: close and reopen the release PR (PRs opened by `GITHUB_TOKEN` don't trigger CI; a reopen by a person does), wait for green checks, then `gh pr merge <n> --squash`. Merging creates the GitHub release and deploys to Pages in the same workflow run.
  - Versions: M0 `v0.0.1`, M1 `v0.1.0`, M2 `v0.2.0`, M3 `v0.3.0`, M4 `v0.4.0`, M5 `v0.5.0`, M6 `v1.0.0` (put a `Release-As: 1.0.0` footer in the body of a normal PR that is squash-merged to master, so it becomes the commit footer; not in the release PR body, which release-please rewrites).
- **Operational notes:**
  - Agent worktrees live under `.worktrees/` (gitignored).
  - Run `gh pr merge` from the main checkout, not from a worktree: from a worktree, gh's local master switch fails even though the remote merge succeeds.
  - Before closing and reopening the release PR, refresh its merge ref with `gh pr view <n> --json mergeable` (wait until it is not UNKNOWN). The first reopen at the v0.0.1 release tested a stale merge ref against an old master.
  - pnpm refuses package versions younger than its release-age window. Don't add `minimumReleaseAgeExclude` entries without a dated comment saying why and when to remove them.
  - After auto-merges, check that the `master` CI run is green. Branch protection uses `strict: false`, so two individually green PRs can conflict semantically.
- **Deploys:** only on release. Manual deploy for demos: `gh workflow run deploy-pages.yml --ref master`.

## Working agreement: parallel by default, the owner is the only gate

- **Run work in parallel with agents whenever possible.** Whenever two or more pieces of work don't depend on each other (design screens, independent plan tasks, features, test suites, docs, research), send them to agents running in parallel instead of doing them one after another. Each agent gets its own git worktree, branch and PR.
- **The owner's review and decisions are the only gate.**
  - Don't stop to ask permission for routine work that's already in an approved spec or plan.
  - Stop and wait only for:
    1. approving specs, plans and designs
    2. product or scope decisions not covered by the spec
    3. milestone sign-off before a release PR is merged
    4. anything destructive or irreversible
- **Batch questions:** collect them and ask them together, written into the relevant doc (spec or plan), so they don't interrupt the work one by one.
- **Agents never decide product questions themselves.** An agent that hits an open product question reports it back as a question instead of guessing.
- Every milestone after M0 starts with its own implementation plan in `docs/superpowers/plans/`, approved by the owner before work starts.
