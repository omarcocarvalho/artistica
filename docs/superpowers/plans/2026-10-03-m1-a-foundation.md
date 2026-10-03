# M1-A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave `master` in a state where sub-plans B (layout), C (images), D (render/PDF) and E (shell) can all start in parallel: every M1 dependency installed, test/coverage/worker/i18n-lint tooling working, the shared model types exported, i18n and namespace files in place, the persisted settings store, the design tokens, fonts and Tailwind theme, theme switching, and the UI primitives.

**Architecture:** Pure TypeScript model modules (`src/shared/model`) with no DOM access, tested in `node` with fast-check property tests. A Zod-validated, versioned, persisted Zustand store (`src/features/settings`) that can never throw on bad stored data. i18next with one JSON file per namespace, so later sub-plans only touch their own files. Design tokens copied 1:1 from `design/tokens.css` into a Tailwind v4 `@theme static` block (with a drift test), plus small plain-CSS component classes (`ds-*`) adapted from `design/mockup.css`, wrapped by accessible React primitives that take every visible string as a prop.

**Tech Stack:** TypeScript 6 strict, React 19, Vite 8, Vitest 5 (`unit` node + `dom` happy-dom projects, v8 coverage), fast-check, Testing Library, Tailwind v4, Radix (`radix-ui`), Zustand 5 + Zod 4, i18next 26 + react-i18next 17, Comlink, `@pdfme/pdf-lib`, `heic-to`, Fontsource variable fonts.

**Spec:** `docs/spec.md` (§2.9 settings, §2.10 i18n support, §2.12 look & feel, §3 non-functional, §4 architecture, §7 testing) and `docs/superpowers/plans/2026-10-03-m1-overview.md` (the Shared contracts section is binding). Design: `design/tokens.css`, `design/mockup.css`, `design/README.md`.

## Global Constraints

Copied from the overview, plus what this plan produces:

- Follow `CLAUDE.md`: branch per PR, Conventional Commit PR titles, squash, auto-merge after green checks; parallel worktrees under `.worktrees/`; `E2E_PORT=<unique>` when running E2E in parallel; never push to `master`.
- TypeScript strict and `noUncheckedIndexedAccess`. No `any`. No non-null assertions without a comment. Dependency versions are pinned **exactly** (no `^`/`~`).
- Pure core (`src/shared/model`) has **no DOM access**, so it can be unit-tested in `node`.
- **Privacy:** photos are never persisted and never sent anywhere. Only the settings store is persisted (`localStorage` key `artistica:settings`), and it never stores images or anything derived from them.
- **i18n:** no literal UI strings in `.tsx`. Every string is in the owning namespace JSON. `eslint-plugin-i18next` enforces it for `src/**/*.tsx` (tests exempt; `e2e/**`, `landing/**`, `index.html` exempt).
- **Accessibility:** WCAG 2.2 AA, keyboard-complete, visible focus (3 px ring, 2 px offset), axe-clean in light and dark (E2E, owned by E).
- **Performance budgets (spec §3):** initial app JS < 250 KB gzipped (enforced by E), layout for 50 items < 500 ms, preview update < 200 ms for 20 images. Fonts are separate assets, not JS.
- **TDD:** every pure module is test-first; components get behaviour tests (Testing Library).
- **Versions:** sub-plans B–E use only the dependencies A installs and **must not edit `package.json` or `pnpm-lock.yaml`**.
- All lengths are millimetres (`Mm`); page coordinates have the origin at the top-left. Model types are plain data (no classes, no `Date`, no `ImageBitmap`).
- Check names that must keep working: `lint`, `typecheck`, `unit`, `build`, `e2e (chromium)`, `e2e (firefox)`, `e2e (webkit)`, `pr-title`. Never add `paths:` filters to workflows.

### Contract items this plan produces (names and signatures verbatim from the overview)

- `src/shared/model/units.ts`: `Mm`, `Unit`, `MM_PER_INCH`, `PT_PER_MM`, `TARGET_DPI`, `mmToUnit`, `unitToMm`, `maxPrintMm(px, dpi = TARGET_DPI)`, `effectiveDpi(px, mm)`, `roundForUnit(value, unit)`. Plus one addition: `defaultUnitForLocale(locale: string): Unit` (owner Q8, default): `'in'` for `en-US` and `en-CA`, `'mm'` otherwise.
- `src/shared/model/paper.ts`: `PaperId`, `SizeMm`, `PAPER_SIZES`, `PAPER_IDS`, `CUSTOM_PAPER_LIMITS`.
- `src/shared/model/page-setup.ts`: `Orientation`, `PageSetup`, `MIN_SAFE_AREA_MM`, `MIN_COMFORT_SHORT_SIDE_MM = 60` (CR-C2: moved here from layout; B and C import it from `src/shared/model/page-setup`), `CROP_MARK_LENGTH_MM`, `CROP_MARK_OFFSET_MM`, `DEFAULT_PAGE_SETUP`, `PageSetupNote`, `normalizePageSetup`, `paperSizeMm`, `outerReserveMm`, `gutterMm`, `contentBoxMm`.
- `src/shared/model/image.ts`: `ImageId`, `Rotation`, `CropRect`, `CropAspect`, `SizeMode`, `ImageEdits`, `MAX_COPIES`, `DEFAULT_EDITS`, `ImageDescriptor`, `printedPixelSize`, `MAX_SOURCE_LONG_SIDE_PX`.
- `src/features/settings`: `useSettings` (persisted under `artistica:settings`, `version: 1`), state `{ pageSetup, unit, language, theme }`, actions `setPageSetup(patch)`, `setUnit`, `setLanguage`, `setTheme`, `reset()`, non-persisted `pageSetupNotes`. The initial `unit` (only when nothing is saved) comes from `defaultUnitForLocale(navigator.language)` (owner Q8, default).
- `src/shared/i18n`: `LANGUAGES`, `LanguageCode`, `initI18n`; namespaces `common, app, images, pageSetup, preview, export, errors` as `src/locales/en/<ns>.json` (CR-E1: `app` added, `landing` dropped; `initI18n()` auto-loads every `src/locales/en/*.json` via `import.meta.glob`); `errors.json` with groups `images`, `export`, `generic`.
- `src/shared/theme`: `useApplyTheme()` (CR-E5): `data-theme="light|dark"` on `<html>`, attribute absent for `auto`.
- Persistence envelope (CR-E8): zustand `persist` writes `{ state, version }` under `artistica:settings`; an inline pre-paint script (E) reads `state.theme`.
- Tooling (CR-E7): the `unit` project also includes `scripts/**/*.test.ts`; `tsconfig.node.json` includes `scripts`.
- `src/shared/ui/index.ts` (A12): the single barrel exporting every primitive and its prop types (signatures listed under "Final primitive signatures" below), plus `buttonClasses(variant, size, { block })` (CCR-D7, ruled) so links such as `<a download>` can look like buttons.
- `resolveJsonModule: true` in `tsconfig.app.json` (set explicitly in A2) so locale JSON can be imported directly.
- `src/shared/ui`: Button, IconButton, Switch, SegmentedControl, Slider, NumberField, Select, Dialog, BottomSheet, Tabs, Tooltip, Badge/Chip, Callout, ProgressBar, VisuallyHidden, SketchCard, Icon.

### Resolved dependency table (Task A1 installs exactly these)

Each version was verified with `npm view <pkg> time --json` on 2026-10-03 and is the newest **stable** release published at least 48 h before 2026-10-03T09:00Z (cutoff **2026-10-01T09:00Z**). Pre-release tags were ignored.

| Package | Kind | Pin | Published (UTC) | Note |
|---|---|---|---|---|
| `zustand` | runtime | 5.0.15 | 2026-08-13 | |
| `zod` | runtime | 4.6.5 | 2026-09-13 | |
| `comlink` | runtime | 4.4.2 | 2024-11-07 | |
| `i18next` | runtime | 26.4.2 | 2026-09-03 | |
| `react-i18next` | runtime | 17.0.15 | 2026-09-21 | peers: i18next ≥ 26.2, TypeScript 5–7 |
| `i18next-browser-languagedetector` | runtime | 8.2.1 | 2026-02-12 | |
| `radix-ui` | runtime | 1.6.7 | 2026-07-24 | |
| `@pdfme/pdf-lib` | runtime | 6.2.2 | 2026-09-29 | |
| `heic-to` | runtime | 1.5.2 | 2026-05-26 | newer 1.6.4 / 1.6.5 were published 2026-10-01 10:38 / 10:53, inside the 48 h window, so they are skipped |
| `@fontsource-variable/fraunces` | runtime | 5.3.0 | 2026-07-19 | |
| `@fontsource-variable/atkinson-hyperlegible-next` | runtime | 5.3.0 | 2026-07-19 | |
| `@fontsource-variable/caveat` | runtime | 5.3.0 | 2026-07-19 | |
| `@vitest/coverage-v8` | dev | 5.0.3 | 2026-09-30 | peer `vitest` must equal 5.0.3 (it does) |
| `happy-dom` | dev | 20.14.5 | 2026-09-12 | |
| `@testing-library/react` | dev | 16.3.3 | 2026-08-27 | |
| `@testing-library/dom` | dev | 10.4.2 | 2026-09-13 | **addition to the overview table**: required peer of `@testing-library/react` and `@testing-library/jest-dom` |
| `@testing-library/user-event` | dev | 14.6.7 | 2026-09-02 | |
| `@testing-library/jest-dom` | dev | 7.0.1 | 2026-08-09 | |
| `eslint-plugin-i18next` | dev | 6.1.5 | 2026-06-28 | |

### Behaviour verified while writing this plan (Vitest 5.0.3, scratch copy outside the repo)

- With `coverage.include` set to globs that match **no files**, `vitest run --coverage` exits **0** and prints `Unknown% ( 0/0 )`, even with 80% thresholds. No special-casing is needed while `src/features/layout` and `src/features/render` are empty.
- Vitest 5 has no `coverage.all` option: files that match `coverage.include` are reported at 0% even when no test imports them. So as soon as B or D adds a source file, it counts against the 80% threshold. This is what we want.
- Inline `test.projects` with `extends: true` works with coverage, and `--project unit` / `--project dom` select a project.
- A `?raw` import of a `.css` file returns an empty string under Vitest (CSS is not processed), so the token drift test reads files with `node:fs` instead.
- `eslint-plugin-i18next` 6.1.5, mode `jsx-only`, flags JSX text and attributes such as `aria-label`/`title`/`placeholder`, and does not flag `className`, `role`, `type`, `aria-hidden="true"`, `viewBox`, `d`, `stroke` and similar. The overview's "markup mode" means `jsx-only`.

## Final primitive signatures

All are exported from `src/shared/ui` (`import { Button } from '../../shared/ui'`). Every visible string and every accessible name is a prop. `...rest` means the remaining native props of the element are forwarded.

| Component | Props |
|---|---|
| `Button` | `variant?: 'neutral' \| 'primary' \| 'secondary' \| 'ghost' \| 'danger'` (default `neutral`), `size?: 'md' \| 'lg'`, `block?: boolean`, `icon?: IconName`, `...button props` (`type` defaults to `"button"`) |
| `IconButton` | `label: string` (aria-label), `icon: IconName`, `variant?: ButtonVariant` (default `ghost`), `size?: ButtonSize`, `...button props` minus `children` |
| `Icon` | `name: IconName`, `...svg props` (decorative) |
| `Badge` | `tone?: 'neutral' \| 'accent' \| 'info' \| 'success' \| 'warning' \| 'danger'`, `icon?: IconName`, `...span props`. The low-DPI chip is `<Badge tone="warning" icon="warning">` |
| `Chip` | `checked: boolean`, `onCheckedChange(checked: boolean)`, `...button props` |
| `Callout` | `tone?: 'info' \| 'warning' \| 'danger' \| 'success' \| 'quiet'`, `title?: string`, `actions?: ReactNode`, `live?: boolean`, `...div props` |
| `ProgressBar` | `value: number \| null` (0..1), `label: string`, `valueText?: string`, `className?` |
| `SketchCard` | `tape?: boolean`, `...div props` |
| `VisuallyHidden` | `...span props` |
| `Switch` | `label: string`, `checked: boolean`, `onCheckedChange(checked: boolean)`, `hint?: string`, `disabled?: boolean`, `className?` |
| `SegmentedControl<T extends string>` | `label: string`, `value: T`, `onValueChange(value: T)`, `options: { value: T; label: ReactNode; disabled?: boolean }[]`, `block?: boolean`, `className?` |
| `Slider` | `label: string`, `value: number`, `min: number`, `max: number`, `step?: number`, `onValueChange(value: number)`, `formatValue?(n: number): string`, `minLabel?: string`, `maxLabel?: string`, `disabled?: boolean`, `className?` |
| `NumberField` | `label: string`, `valueMm: Mm`, `unit: Unit`, `unitLabel: string`, `onChangeMm(mm: Mm)`, `minMm?: Mm`, `maxMm?: Mm`, `stepMm?: Mm` (default 1), `hint?: string`, `disabled?: boolean`, `className?` |
| `Select` | `label: string`, `value: string`, `onValueChange(value: string)`, `options: { value: string; label: string; disabled?: boolean }[]`, `hint?: string`, `disabled?: boolean`, `className?` |
| `Dialog` | `open: boolean`, `onOpenChange(open: boolean)`, `title: string`, `description?: string`, `closeLabel: string`, `children: ReactNode`, `footer?: ReactNode`, `size?: 'sm' \| 'lg'` (default `lg`) |
| `BottomSheet` | `open`, `onOpenChange`, `title: string`, `description?: string`, `closeLabel: string`, `children: ReactNode`, `footer?: ReactNode` |
| `Tabs` | `label: string`, `items: { id: string; label: string; content: ReactNode; badge?: ReactNode }[]`, `value: string`, `onValueChange(id: string)`, `className?` |
| `Tooltip` | `content: string`, `children: ReactElement` (one element that accepts a ref) |

Also exported: `cx(...parts)`; `buttonClasses(variant: ButtonVariant, size: ButtonSize, extra?: { block?: boolean; iconOnly?: boolean }): string` (CCR-D7: the class string `Button` itself uses, for non-button elements such as `<a download className={buttonClasses('primary', 'lg', { block: true })}>`); and the types `IconName`, `ButtonProps`, `ButtonVariant`, `ButtonSize`, `BadgeTone`, `CalloutTone`, `SegmentedOption`, `SelectOption`, `TabItem` and each component's `...Props`.

## Review Focus

Inputs and conditions the spec implies but that a casual implementation would miss. Each line names the task whose tests pin it.

1. **Corrupt, old, hand-edited or hostile `artistica:settings`** (not JSON, wrong types, `NaN`/`Infinity`/huge numbers, future version, arrays) must never break startup: the app boots with defaults, keeping every field that is still valid. Pinned by A5 (`schema.test.ts` including two property tests, `store.test.ts`).
2. **`localStorage` unavailable or throwing** (Safari private mode, blocked site data, quota exceeded) must cost persistence only, not the app. Pinned by A5 (`safeStorage` tests, "store keeps working in memory").
3. **Unit switching and typing in number fields** must never drift stored millimetres, and must accept `5,5` (comma locales), empty and half-typed input (`""`, `.`) without emitting garbage, with clamping to min/max. Pinned by A3 (round-trip and stability properties), A5 ("toggling the unit never changes stored millimetres") and A10 (`NumberField`, `parseDecimal` tests).
4. **Degenerate page setups** (safe area `NaN`/negative, bleed larger than the gutter, bleed with the gutter switched off, a page smaller than its margins) must normalise to something valid and never yield a negative content box. Pinned by A3 (`normalizePageSetup` and `contentBoxMm` properties).
5. **A browser language the app does not have** (`fr`, `pt-BR`, `ja`, or an unsupported saved value) must fall back to English text, not keys or crashes. Pinned by A4 (`init.test.ts`). Dark mode with `auto`, `light` and `dark` choices and the always-white printed paper are pinned by A7 (`tokens.test.ts`) and A8 (`apply-theme.test.tsx`).

## File map

| Path | Task | Responsibility |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | A1 (deps), A2 (scripts only) | dependencies; `test:coverage` script |
| `vite.config.ts` | A2 | Vitest projects (`unit` also covers `scripts/**/*.test.ts`), coverage, `worker.format: 'es'` |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.worker.json`, `tsconfig.node.json` | A2 | worker program separate from the DOM program; node program includes `scripts` |
| `.github/workflows/ci.yml` | A2 | `unit` job runs `pnpm test:coverage` |
| `src/test/setup-dom.ts` | A2 | jest-dom matchers, cleanup, `ResizeObserver` stub |
| `src/shared/worker/ping*.ts`, `worker-setup.test.ts` | A2 | proof worker + config guard tests |
| `src/shared/model/{units,paper,page-setup,image}.ts` + tests | A3 | contract types and pure functions, incl. `defaultUnitForLocale` (owner Q8, default) |
| `src/shared/i18n/*`, `src/locales/en/*.json` | A4 | i18next init (glob-loaded namespaces), English skeletons (`app.json`, `images.json`, `pageSetup.json`, `preview.json`, `export.json` are `{}`) |
| `src/features/settings/{schema,store,index}.ts` + tests | A5 | persisted settings store; initial unit from the browser locale (owner Q8, default) |
| `eslint.config.js`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/main.tsx` | A6 | i18n lint rule, translated placeholder, startup wiring |
| `src/shared/styles.css`, `src/shared/theme/{tokens,base}.css`, `tokens.test.ts`, `src/shared/ui/css/*.css` (placeholders), `src/shared/ui/{cx,icon-paths,Icon}`, `.prettierignore`, `app/index.html` | A7 | tokens, fonts, Tailwind theme, base CSS, `cx`, icons |
| `src/shared/theme/{apply-theme,index}.ts` + test, `src/app/App.tsx` | A8 | `useApplyTheme()` |
| `src/shared/ui/*` (basics) | A9 | Button, IconButton, `buttonClasses`, Badge, Chip, Callout, ProgressBar, SketchCard, VisuallyHidden |
| `src/shared/ui/*` (forms) | A10 | Switch, SegmentedControl, Slider, Select, NumberField |
| `src/shared/ui/*` (overlays) | A11 | Dialog, BottomSheet, Tabs, Tooltip |
| `src/shared/ui/index.ts` + test | A12 | the only barrel file (exports `buttonClasses`, CCR-D7) |

## PR procedure (every task)

Work in a worktree (`.worktrees/<branch>`), branch from latest `master`. Before opening the PR run:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build
```

Then, from the **main checkout** for the merge step:

```bash
gh pr create --base master --title "<PR title from the task>" --body "<what and why>"
gh pr merge --auto --squash
```

Run `pnpm format` before the checks if Prettier complains: the code blocks below are already Prettier-formatted, but copy/paste can change line endings.

## Parallelization

```
A1 deps ──> A2 tooling ──┬─> A7 tokens+fonts+css+icons ──┬─> A9  ui basics ────┐
        │                │                               ├─> A10 ui forms  ────┼─> A12 ui barrel
        ├─> A3 model ────┼─> A5 settings (needs A3+A4)   └─> A11 ui overlays ──┘
        └─> A4 i18n ─────┘        │
                         A6 i18n lint + App (A2, A4, A5) ──> A8 theme (A5, A6, A7)
```

- **A1 must merge first**, alone: every other task needs the lockfile.
- After A1, **A2, A3 and A4 run concurrently**; A7 starts once A2 has merged (its icon test runs in the `dom` project). A3, A4 and A7 can overlap (disjoint files: A2 owns `vite.config.ts`, tsconfigs, CI, `package.json` scripts, `src/test`, `src/shared/worker`; A3 owns `src/shared/model`; A4 owns `src/shared/i18n` and `src/locales`; A7 owns `src/shared/styles.css`, `src/shared/theme/*.css`, `src/shared/ui/css`, `src/shared/ui/{cx,icon-paths,Icon}`, `.prettierignore`, `app/index.html`).
- **A5** needs A3 and A4. **A6** needs A2, A4, A5. **A8** needs A2, A5, A6, A7 (it edits `App.tsx` after A6).
- **A9, A10, A11** need A2 (the `dom` project) and A7 (the CSS files), and run concurrently. Each owns only its own component files and its own test file. The shared CSS files were split per group in A7 so they never collide: `basics.css` (A9), `forms.css` (A10), `overlays.css` (A11). None of them edits `index.ts`: **A12 owns the only barrel**.
- **A12** needs A9, A10 and A11.
- E2E runs in A6, A7 and A12 use fixed `E2E_PORT` values (4101, 4102, 4103) so overlapping worktrees never collide; B–E use other ports.
- Only A1 and A2 touch `package.json` (A2 only the `scripts` block). After A12 merges, B, C, D and E can start.

---

## Tasks

### Task A1: Install every M1 dependency

**Branch:** `chore/m1-deps` · **PR title:** `build: install M1 dependencies`

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (nothing else)

**Interfaces:**
- Consumes: the resolved table in Global Constraints.
- Produces: every package the other sub-plans import, pinned exactly. B–E never edit these two files.

- [ ] **Step 1: Re-verify the versions are still the newest stable release at least 48 h old**

Run this read-only check (it prints the pick per package; the output must equal the table in Global Constraints, or be newer by a release that has since passed 48 h). If a newer version now qualifies, use it and update the table in this plan's PR description.

```bash
for p in zustand zod comlink i18next react-i18next i18next-browser-languagedetector radix-ui @pdfme/pdf-lib heic-to \
  @fontsource-variable/fraunces @fontsource-variable/atkinson-hyperlegible-next @fontsource-variable/caveat \
  @vitest/coverage-v8 happy-dom @testing-library/react @testing-library/dom @testing-library/user-event \
  @testing-library/jest-dom eslint-plugin-i18next; do
  printf '%s  ' "$p"
  npm view "$p" time --json | node -e '
    const t = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const cutoff = Date.now() - 48 * 3600 * 1000;
    const pre = /-(alpha|beta|rc|next|canary|dev|experimental)/i;
    const ok = Object.entries(t)
      .filter(([v]) => !["created", "modified"].includes(v) && !pre.test(v))
      .map(([v, d]) => [v, Date.parse(d)])
      .filter(([, d]) => d <= cutoff)
      .sort((a, b) => b[1] - a[1]);
    console.log(ok[0][0], new Date(ok[0][1]).toISOString());'
done
```

Expected: one line per package. `@vitest/coverage-v8` must be `5.0.3` (it must equal the installed `vitest`).

- [ ] **Step 2: Install runtime dependencies (exact pins)**

```bash
pnpm add --save-exact zustand@5.0.15 zod@4.6.5 comlink@4.4.2 i18next@26.4.2 react-i18next@17.0.15 \
  i18next-browser-languagedetector@8.2.1 radix-ui@1.6.7 @pdfme/pdf-lib@6.2.2 heic-to@1.5.2 \
  @fontsource-variable/fraunces@5.3.0 @fontsource-variable/atkinson-hyperlegible-next@5.3.0 \
  @fontsource-variable/caveat@5.3.0
```

- [ ] **Step 3: Install dev dependencies (exact pins)**

```bash
pnpm add --save-exact --save-dev @vitest/coverage-v8@5.0.3 happy-dom@20.14.5 @testing-library/react@16.3.3 \
  @testing-library/dom@10.4.2 @testing-library/user-event@14.6.7 @testing-library/jest-dom@7.0.1 \
  eslint-plugin-i18next@6.1.5
```

If pnpm reports the release-age window blocks a package, do **not** add `minimumReleaseAgeExclude`: go back to Step 1 and take the previous version.

- [ ] **Step 4: Verify no range specifiers and nothing unexpected**

```bash
grep -nE '"[\^~]' package.json && echo "FOUND RANGE" || echo "all exact"
git diff --stat
pnpm install --frozen-lockfile
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

Expected: `all exact`; the diff touches only `package.json` and `pnpm-lock.yaml`; all commands pass. If pnpm prints "Ignored build scripts", leave them ignored: none of these packages needs a build script.

- [ ] **Step 5: Commit and open the PR (see PR procedure)**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: install M1 dependencies"
```

---

### Task A2: Vitest projects, coverage gate, worker tsconfig, CI

**Branch:** `chore/m1-tooling` · **PR title:** `build: add Vitest projects, coverage gate and worker tooling`

**Files:**
- Modify: `vite.config.ts`, `package.json` (scripts only), `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.github/workflows/ci.yml`
- Create: `tsconfig.worker.json`, `src/test/setup-dom.ts`, `src/shared/worker/ping.ts`, `src/shared/worker/ping.worker.ts`
- Test: `src/shared/worker/ping.test.ts`, `src/shared/worker/worker-setup.test.ts`, plus a `dom`-project smoke test `src/test/setup-dom.test.tsx`

**Interfaces:**
- Consumes: packages from A1.
- Produces: `pnpm test` runs both projects; `pnpm test:coverage` enforces 80% on `src/features/layout/**` and `src/features/render/**` (exit 0 while they are empty); `.worker.ts` files are type-checked with the WebWorker lib and excluded from the DOM program; `scripts/**/*.test.ts` run in `unit` (CR-E7); `src/test/setup-dom.ts` registers jest-dom and cleanup.

- [ ] **Step 1: Write the failing tests**

`src/shared/worker/ping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ping } from './ping'

describe('ping (proof worker logic)', () => {
  it('answers with the message', () => {
    expect(ping('hello')).toBe('pong:hello')
  })
})
```

`src/shared/worker/worker-setup.test.ts` (guards the config so a refactor cannot silently drop it):

```ts
// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

interface TsConfig {
  compilerOptions: { lib: string[] }
  include: string[]
  references?: { path: string }[]
}

describe('worker setup', () => {
  it('builds workers as ES modules', () => {
    expect(read('../../../vite.config.ts')).toMatch(/worker:\s*\{\s*format:\s*'es'\s*\}/)
  })

  it('keeps worker files out of the DOM program', () => {
    expect(read('../../../tsconfig.app.json')).toContain('"src/**/*.worker.ts"')
  })

  it('allows importing JSON modules (locale files)', () => {
    expect(read('../../../tsconfig.app.json')).toContain('"resolveJsonModule": true')
  })

  it('type-checks worker files with the WebWorker lib and without DOM', () => {
    const worker = JSON.parse(read('../../../tsconfig.worker.json')) as TsConfig
    expect(worker.compilerOptions.lib).toContain('WebWorker')
    expect(worker.compilerOptions.lib).not.toContain('DOM')
    expect(worker.include).toEqual(['src/**/*.worker.ts'])
  })

  it('references the worker program from the solution tsconfig', () => {
    const root = JSON.parse(read('../../../tsconfig.json')) as TsConfig
    expect(root.references).toContainEqual({ path: './tsconfig.worker.json' })
  })

  it('runs scripts/** tests in the unit project (CR-E7) and includes scripts in the node program', () => {
    expect(read('../../../vite.config.ts')).toContain("'scripts/**/*.test.ts'")
    expect(read('../../../tsconfig.node.json')).toContain('"scripts"')
  })
})
```

`src/test/setup-dom.test.tsx` (proves the `dom` project, happy-dom and jest-dom matchers work):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('dom project', () => {
  it('renders with happy-dom and has jest-dom matchers', () => {
    render(<button type="button">Hello</button>)
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument()
    expect(document.body).toBeInstanceOf(HTMLElement)
  })

  it('cleans up between tests', () => {
    expect(screen.queryByRole('button')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test`
Expected: FAIL: `ping.test.ts` cannot resolve `./ping`; `worker-setup.test.ts` fails; `setup-dom.test.tsx` is not even picked up (the current config only has one project).

- [ ] **Step 3: Implement the proof worker**

`src/shared/worker/ping.ts`:

```ts
/** The pure part of the proof worker. Real workers follow this shape: logic here, `expose` in the worker file. */
export function ping(message: string): string {
  return `pong:${message}`
}

export interface PingApi {
  ping: typeof ping
}
```

`src/shared/worker/ping.worker.ts`:

```ts
import { expose } from 'comlink'
import { ping, type PingApi } from './ping'

// `DedicatedWorkerGlobalScope` only exists in the WebWorker lib. tsconfig.worker.json has it and
// tsconfig.app.json does not, so this line makes `tsc -b` prove the two programs are separate.
const scope = self as unknown as DedicatedWorkerGlobalScope
const api: PingApi = { ping }

expose(api, scope)
```

- [ ] **Step 4: Add the DOM test setup**

`src/test/setup-dom.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
})

// happy-dom lacks ResizeObserver in some versions; Radix measures with it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {
      /* no layout in tests */
    }
    unobserve(): void {
      /* no layout in tests */
    }
    disconnect(): void {
      /* no layout in tests */
    }
  }
  globalThis.ResizeObserver = ResizeObserverStub
}
```

- [ ] **Step 5: Worker tsconfig and solution references**

`tsconfig.worker.json` (new):

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.worker.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "WebWorker"],
    "module": "esnext",
    "types": [],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.worker.ts"]
}
```

`tsconfig.json` (replace):

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.worker.json" }
  ]
}
```

In `tsconfig.app.json` add `"resolveJsonModule": true,` to `compilerOptions` (it is already implied by `moduleResolution: "bundler"`, but C imports locale JSON directly, so make it explicit), and change the end of the file from `"include": ["src", "landing"]` to:

```json
  "include": ["src", "landing"],
  "exclude": ["src/**/*.worker.ts"]
```

In `tsconfig.node.json` change `"include"` to:

```json
  "include": ["vite.config.ts", "playwright.config.ts", "e2e", "scripts"]
```

Note for B and D: a worker file may import pure modules (they must not touch the DOM), and the app side must get the worker's API **type** from the pure module (as `ping.ts` exports `PingApi`), not from the `.worker.ts` file, because an `import type` of the worker file would pull it into the DOM program.

- [ ] **Step 6: Vitest projects, coverage and worker format**

Replace `vite.config.ts` with:

```ts
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://omarcocarvalho.github.io/artistica/ (GitHub Pages project site).
export default defineConfig({
  base: '/artistica/',
  plugins: [react(), tailwindcss()],
  // Workers are bundled as ES modules: new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' }).
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      // Vitest 5 reports every file matching `include` (0% if untested) and exits 0 when nothing
      // matches, so the gate is harmless until sub-plans B and D add code.
      include: ['src/features/layout/**', 'src/features/render/**'],
      exclude: ['**/*.test.*', '**/*.worker.ts', '**/components/**'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'landing/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup-dom.ts'],
        },
      },
    ],
  },
})
```

In `package.json` `scripts`, add after `"test:watch"`:

```json
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 7: CI uses the coverage command**

In `.github/workflows/ci.yml`, in the job `unit` (keep `name: unit`), change `- run: pnpm test` to:

```yaml
      - run: pnpm test:coverage
```

- [ ] **Step 8: Verify**

```bash
pnpm test:coverage        # both projects pass; coverage table is empty ("Unknown%"); exit code 0
echo $?                   # 0
pnpm typecheck            # tsc -b now also checks tsconfig.worker.json
pnpm lint && pnpm format:check && pnpm build
```

Expected: all green. Sanity-check the separation once (do not commit): temporarily change `DedicatedWorkerGlobalScope` in `ping.worker.ts` to `FooScope`; `pnpm typecheck` must fail with `Cannot find name 'FooScope'`; revert.

- [ ] **Step 9: Commit and open the PR**

```bash
git add vite.config.ts package.json tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.worker.json \
  .github/workflows/ci.yml src/test src/shared/worker
git commit -m "build: add Vitest projects, coverage gate and worker tooling"
```

---

### Task A3: Shared model (units, paper, page setup, image)

**Branch:** `feat/m1-model` · **PR title:** `feat(model): add units, paper, page-setup and image model`

**Files:**
- Create: `src/shared/model/{units,paper,page-setup,image}.ts`
- Test: `src/shared/model/{units,paper,page-setup,image}.test.ts`

**Interfaces:**
- Consumes: `fast-check` (already installed).
- Produces: exactly the contract signatures listed in Global Constraints, including `MIN_COMFORT_SHORT_SIDE_MM = 60` in `page-setup.ts` (CR-C2). Two clarifications of the contract: `effectiveDpi(px, 0)` returns `Infinity`, and `contentBoxMm` never returns a negative `w`/`h` (clamped at 0). See Contract change requests CCR-A1 (the 0.05 mm drift claim) and CCR-A2.

- [ ] **Step 1: Write the failing tests**

`src/shared/model/units.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MM_PER_INCH,
  PT_PER_MM,
  TARGET_DPI,
  defaultUnitForLocale,
  effectiveDpi,
  maxPrintMm,
  mmToUnit,
  roundForUnit,
  unitToMm,
} from './units'

describe('constants', () => {
  it('matches the physical definitions', () => {
    expect(MM_PER_INCH).toBe(25.4)
    expect(PT_PER_MM * 25.4).toBeCloseTo(72, 12)
    expect(TARGET_DPI).toBe(300)
  })
})

describe('mmToUnit / unitToMm', () => {
  it('converts known values', () => {
    expect(mmToUnit(25.4, 'in')).toBeCloseTo(1, 12)
    expect(unitToMm(8.5, 'in')).toBeCloseTo(215.9, 9)
    expect(mmToUnit(210, 'mm')).toBe(210)
    expect(unitToMm(210, 'mm')).toBe(210)
  })

  it('round-trips without meaningful error (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 5000, noNaN: true }), (mm) => {
        expect(unitToMm(mmToUnit(mm, 'in'), 'in')).toBeCloseTo(mm, 9)
      }),
    )
  })
})

describe('maxPrintMm / effectiveDpi', () => {
  it('prints 3000 px at 300 DPI across 254 mm', () => {
    expect(maxPrintMm(3000)).toBeCloseTo(254, 9)
    expect(maxPrintMm(3000, 150)).toBeCloseTo(508, 9)
  })

  it('is the inverse of maxPrintMm (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20000 }),
        fc.double({ min: 72, max: 600, noNaN: true }),
        (px, dpi) => {
          expect(effectiveDpi(px, maxPrintMm(px, dpi))).toBeCloseTo(dpi, 6)
        },
      ),
    )
  })

  it('has infinite DPI for a zero-length print', () => {
    expect(effectiveDpi(1000, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('defaultUnitForLocale (owner Q8, default)', () => {
  it('uses inches for US and Canadian English', () => {
    expect(defaultUnitForLocale('en-US')).toBe('in')
    expect(defaultUnitForLocale('en-CA')).toBe('in')
    expect(defaultUnitForLocale('en_us')).toBe('in')
    expect(defaultUnitForLocale('EN-ca')).toBe('in')
  })

  it('uses millimetres everywhere else', () => {
    const others = ['en', 'en-GB', 'en-AU', 'fr-CA', 'pt-BR', 'ja', 'de-DE', '', 'nonsense']
    for (const locale of others) {
      expect(defaultUnitForLocale(locale)).toBe('mm')
    }
  })
})

describe('roundForUnit', () => {
  it('rounds mm to 1 decimal and inches to 2', () => {
    expect(roundForUnit(5.04, 'mm')).toBe(5)
    expect(roundForUnit(5.06, 'mm')).toBe(5.1)
    expect(roundForUnit(0.2004, 'in')).toBe(0.2)
    expect(roundForUnit(8.5039, 'in')).toBe(8.5)
  })

  it('first rounding error is at most half a display step (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1200, noNaN: true }), (mm) => {
        const shownMm = roundForUnit(mmToUnit(mm, 'mm'), 'mm')
        expect(Math.abs(shownMm - mm)).toBeLessThanOrEqual(0.05 + 1e-9)
        const shownIn = roundForUnit(mmToUnit(mm, 'in'), 'in')
        expect(Math.abs(unitToMm(shownIn, 'in') - mm)).toBeLessThanOrEqual(0.005 * 25.4 + 1e-9)
      }),
    )
  })

  it('does not drift on repeated unit toggling (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1200, noNaN: true }), (mm) => {
        // Start from what the user sees, then bounce mm → in → mm → in a few times.
        let shownMm = roundForUnit(mm, 'mm')
        const firstIn = roundForUnit(mmToUnit(shownMm, 'in'), 'in')
        for (let i = 0; i < 5; i++) {
          const inches = roundForUnit(mmToUnit(shownMm, 'in'), 'in')
          expect(inches).toBe(firstIn)
          shownMm = roundForUnit(unitToMm(inches, 'in'), 'mm')
        }
        // The mm value that comes back is within the inch display step of where we started.
        expect(Math.abs(shownMm - roundForUnit(mm, 'mm'))).toBeLessThanOrEqual(
          0.005 * 25.4 + 0.05 + 1e-9,
        )
      }),
    )
  })
})
```

`src/shared/model/paper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CUSTOM_PAPER_LIMITS, PAPER_IDS, PAPER_SIZES } from './paper'

describe('paper', () => {
  it('has the exact portrait sizes', () => {
    expect(PAPER_SIZES.A3).toEqual({ w: 297, h: 420 })
    expect(PAPER_SIZES.A4).toEqual({ w: 210, h: 297 })
    expect(PAPER_SIZES.A5).toEqual({ w: 148, h: 210 })
    expect(PAPER_SIZES.A6).toEqual({ w: 105, h: 148 })
    expect(PAPER_SIZES.Letter).toEqual({ w: 215.9, h: 279.4 })
    expect(PAPER_SIZES.Legal).toEqual({ w: 215.9, h: 355.6 })
    expect(PAPER_SIZES.Tabloid).toEqual({ w: 279.4, h: 431.8 })
  })

  it('lists papers in UI order, Custom last', () => {
    expect(PAPER_IDS).toEqual(['A4', 'Letter', 'A3', 'A5', 'A6', 'Legal', 'Tabloid', 'Custom'])
  })

  it('has a size for every non-custom id, all portrait', () => {
    for (const id of PAPER_IDS) {
      if (id === 'Custom') continue
      const size = PAPER_SIZES[id]
      expect(size.w).toBeLessThan(size.h)
    }
  })

  it('limits custom sizes to 50..1200 mm', () => {
    expect(CUSTOM_PAPER_LIMITS).toEqual({ minMm: 50, maxMm: 1200 })
  })
})
```

`src/shared/model/page-setup.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CROP_MARK_LENGTH_MM,
  CROP_MARK_OFFSET_MM,
  DEFAULT_PAGE_SETUP,
  MIN_COMFORT_SHORT_SIDE_MM,
  MIN_SAFE_AREA_MM,
  contentBoxMm,
  gutterMm,
  normalizePageSetup,
  outerReserveMm,
  paperSizeMm,
  type PageSetup,
} from './page-setup'

const pageSetupArb: fc.Arbitrary<PageSetup> = fc.record({
  paper: fc.constantFrom('A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Tabloid', 'Custom'),
  customSize: fc
    .tuple(
      fc.double({ min: 50, max: 1200, noNaN: true }),
      fc.double({ min: 50, max: 1200, noNaN: true }),
    )
    .map(([a, b]) => ({ w: Math.min(a, b), h: Math.max(a, b) })),
  orientation: fc.constantFrom('auto', 'portrait', 'landscape'),
  safeAreaMm: fc.oneof(fc.double({ min: -5, max: 40, noNaN: true }), fc.constant(Number.NaN)),
  gutter: fc.record({ enabled: fc.boolean(), mm: fc.double({ min: 0, max: 40, noNaN: true }) }),
  cropMarks: fc.boolean(),
  bleed: fc.record({ enabled: fc.boolean(), mm: fc.double({ min: 0, max: 20, noNaN: true }) }),
})

describe('constants', () => {
  it('exports the comfort minimum used by layout and images', () => {
    expect(MIN_COMFORT_SHORT_SIDE_MM).toBe(60)
    expect(MIN_SAFE_AREA_MM).toBe(3)
  })
})

describe('DEFAULT_PAGE_SETUP', () => {
  it('matches decisions D2/D3 and the contract', () => {
    expect(DEFAULT_PAGE_SETUP).toEqual({
      paper: 'A4',
      customSize: { w: 210, h: 297 },
      orientation: 'auto',
      safeAreaMm: 5,
      gutter: { enabled: true, mm: 6 },
      cropMarks: true,
      bleed: { enabled: false, mm: 3 },
    })
  })

  it('is already normalised', () => {
    expect(normalizePageSetup(DEFAULT_PAGE_SETUP)).toEqual({ setup: DEFAULT_PAGE_SETUP, notes: [] })
  })
})

describe('normalizePageSetup', () => {
  it('raises a too-small safe area', () => {
    const r = normalizePageSetup({ ...DEFAULT_PAGE_SETUP, safeAreaMm: 1 })
    expect(r.setup.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
    expect(r.notes).toEqual(['safe-area-raised-to-minimum'])
  })

  it('treats a NaN safe area as below the minimum', () => {
    const r = normalizePageSetup({ ...DEFAULT_PAGE_SETUP, safeAreaMm: Number.NaN })
    expect(r.setup.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
  })

  it('enables the gutter when bleed is on', () => {
    const r = normalizePageSetup({
      ...DEFAULT_PAGE_SETUP,
      gutter: { enabled: false, mm: 8 },
      bleed: { enabled: true, mm: 3 },
    })
    expect(r.setup.gutter).toEqual({ enabled: true, mm: 8 })
    expect(r.notes).toEqual(['gutter-enabled-for-bleed'])
  })

  it('raises the gutter to twice the bleed and never lowers the bleed', () => {
    const r = normalizePageSetup({
      ...DEFAULT_PAGE_SETUP,
      gutter: { enabled: true, mm: 4 },
      bleed: { enabled: true, mm: 3 },
    })
    expect(r.setup.gutter).toEqual({ enabled: true, mm: 6 })
    expect(r.setup.bleed).toEqual({ enabled: true, mm: 3 })
    expect(r.notes).toEqual(['gutter-raised-for-bleed'])
  })

  it('reports both gutter notes when a disabled gutter is also too small', () => {
    const r = normalizePageSetup({
      ...DEFAULT_PAGE_SETUP,
      gutter: { enabled: false, mm: 1 },
      bleed: { enabled: true, mm: 3 },
    })
    expect(r.setup.gutter).toEqual({ enabled: true, mm: 6 })
    expect(r.notes).toEqual(['gutter-enabled-for-bleed', 'gutter-raised-for-bleed'])
  })

  it('leaves the gutter alone when bleed is off', () => {
    const input = { ...DEFAULT_PAGE_SETUP, gutter: { enabled: false, mm: 0 } }
    expect(normalizePageSetup(input).setup.gutter).toEqual({ enabled: false, mm: 0 })
  })

  it('is idempotent and reports nothing the second time (property)', () => {
    fc.assert(
      fc.property(pageSetupArb, (setup) => {
        const once = normalizePageSetup(setup)
        const twice = normalizePageSetup(once.setup)
        expect(twice.setup).toEqual(once.setup)
        expect(twice.notes).toEqual([])
      }),
    )
  })

  it('always satisfies the invariants and never touches other fields (property)', () => {
    fc.assert(
      fc.property(pageSetupArb, (setup) => {
        const { setup: out } = normalizePageSetup(setup)
        expect(out.safeAreaMm).toBeGreaterThanOrEqual(MIN_SAFE_AREA_MM)
        if (out.bleed.enabled) {
          expect(out.gutter.enabled).toBe(true)
          expect(out.gutter.mm).toBeGreaterThanOrEqual(2 * out.bleed.mm)
        }
        expect(out.bleed).toEqual(setup.bleed)
        expect(out.paper).toBe(setup.paper)
        expect(out.customSize).toEqual(setup.customSize)
        expect(out.orientation).toBe(setup.orientation)
        expect(out.cropMarks).toBe(setup.cropMarks)
        // The gutter only ever grows.
        if (setup.gutter.enabled) expect(out.gutter.mm).toBeGreaterThanOrEqual(setup.gutter.mm)
      }),
    )
  })
})

describe('paperSizeMm', () => {
  it('returns the preset size for presets and customSize for Custom', () => {
    expect(paperSizeMm(DEFAULT_PAGE_SETUP)).toEqual({ w: 210, h: 297 })
    expect(paperSizeMm({ ...DEFAULT_PAGE_SETUP, paper: 'Letter' })).toEqual({ w: 215.9, h: 279.4 })
    expect(
      paperSizeMm({ ...DEFAULT_PAGE_SETUP, paper: 'Custom', customSize: { w: 100, h: 150 } }),
    ).toEqual({ w: 100, h: 150 })
  })
})

describe('outerReserveMm / gutterMm', () => {
  it('adds bleed and crop-mark space (D2)', () => {
    expect(CROP_MARK_LENGTH_MM + CROP_MARK_OFFSET_MM).toBe(5)
    expect(outerReserveMm(DEFAULT_PAGE_SETUP)).toBe(5)
    expect(outerReserveMm({ ...DEFAULT_PAGE_SETUP, cropMarks: false })).toBe(0)
    expect(outerReserveMm({ ...DEFAULT_PAGE_SETUP, bleed: { enabled: true, mm: 3 } })).toBe(8)
    expect(
      outerReserveMm({ ...DEFAULT_PAGE_SETUP, cropMarks: false, bleed: { enabled: true, mm: 3 } }),
    ).toBe(3)
  })

  it('reads the gutter only when enabled', () => {
    expect(gutterMm(DEFAULT_PAGE_SETUP)).toBe(6)
    expect(gutterMm({ ...DEFAULT_PAGE_SETUP, gutter: { enabled: false, mm: 6 } })).toBe(0)
  })
})

describe('contentBoxMm', () => {
  it('insets the page by safe area + reserve', () => {
    expect(contentBoxMm(DEFAULT_PAGE_SETUP, { w: 210, h: 297 })).toEqual({
      x: 10,
      y: 10,
      w: 190,
      h: 277,
    })
  })

  it('never has a negative size, even on a tiny page (property)', () => {
    fc.assert(
      fc.property(
        pageSetupArb,
        fc.double({ min: 0, max: 1200, noNaN: true }),
        fc.double({ min: 0, max: 1200, noNaN: true }),
        (setup, w, h) => {
          const box = contentBoxMm(normalizePageSetup(setup).setup, { w, h })
          expect(box.w).toBeGreaterThanOrEqual(0)
          expect(box.h).toBeGreaterThanOrEqual(0)
          expect(box.x).toBeGreaterThanOrEqual(MIN_SAFE_AREA_MM)
        },
      ),
    )
  })
})
```

`src/shared/model/image.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITS,
  MAX_COPIES,
  MAX_SOURCE_LONG_SIDE_PX,
  printedPixelSize,
  type ImageDescriptor,
  type ImageId,
  type Rotation,
} from './image'

const id = 'img-1' as ImageId
const make = (
  over: Partial<ImageDescriptor['edits']>,
  pxW = 4000,
  pxH = 3000,
): ImageDescriptor => ({
  id,
  pxW,
  pxH,
  edits: { ...DEFAULT_EDITS, ...over },
})

describe('constants', () => {
  it('has the contract defaults', () => {
    expect(DEFAULT_EDITS).toEqual({
      crop: null,
      cropAspect: 'free',
      rotation: 0,
      flipH: false,
      flipV: false,
      copies: 1,
      size: { kind: 'auto' },
    })
    expect(MAX_COPIES).toBe(50)
    expect(MAX_SOURCE_LONG_SIDE_PX).toBe(5100)
  })

  it('caps the long side at Tabloid length at 300 DPI', () => {
    expect(Math.round((431.8 / 25.4) * 300)).toBe(MAX_SOURCE_LONG_SIDE_PX)
  })
})

describe('printedPixelSize', () => {
  it('is the full image when there is no crop and no rotation', () => {
    expect(printedPixelSize(make({}))).toEqual({ pxW: 4000, pxH: 3000 })
  })

  it('uses the crop size', () => {
    expect(printedPixelSize(make({ crop: { x: 10, y: 20, w: 1000, h: 500 } }))).toEqual({
      pxW: 1000,
      pxH: 500,
    })
  })

  it('swaps width and height for 90 and 270 degrees', () => {
    expect(printedPixelSize(make({ rotation: 90 }))).toEqual({ pxW: 3000, pxH: 4000 })
    expect(printedPixelSize(make({ rotation: 270 }))).toEqual({ pxW: 3000, pxH: 4000 })
    expect(printedPixelSize(make({ rotation: 180 }))).toEqual({ pxW: 4000, pxH: 3000 })
  })

  it('ignores flips and copies', () => {
    expect(printedPixelSize(make({ flipH: true, flipV: true, copies: 7 }))).toEqual({
      pxW: 4000,
      pxH: 3000,
    })
  })

  it('keeps the pixel area and depends on rotation only through a swap (property)', () => {
    const rotations: Rotation[] = [0, 90, 180, 270]
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6000 }),
        fc.integer({ min: 1, max: 6000 }),
        fc.constantFrom(...rotations),
        fc.boolean(),
        (pxW, pxH, rotation, flipH) => {
          const base = printedPixelSize(make({}, pxW, pxH))
          const out = printedPixelSize(make({ rotation, flipH }, pxW, pxH))
          expect(out.pxW * out.pxH).toBe(base.pxW * base.pxH)
          const swapped = rotation === 90 || rotation === 270
          expect(out).toEqual(swapped ? { pxW: base.pxH, pxH: base.pxW } : base)
        },
      ),
    )
  })

  it('rotating a crop twice by 90 equals 180 (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 5000 }), (w, h) => {
        const crop = { x: 0, y: 0, w, h }
        const r180 = printedPixelSize(make({ crop, rotation: 180 }, 6000, 6000))
        const r0 = printedPixelSize(make({ crop, rotation: 0 }, 6000, 6000))
        expect(r180).toEqual(r0)
      }),
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/shared/model`
Expected: FAIL: each test file fails to resolve its module (`./units`, `./paper`, `./page-setup`, `./image`).

- [ ] **Step 3: Implement**

`src/shared/model/units.ts`:

```ts
/** Millimetres. Every length in the model is `Mm` unless a name says otherwise. */
export type Mm = number
export type Unit = 'mm' | 'in'

export const MM_PER_INCH = 25.4
export const PT_PER_MM = 72 / 25.4
export const TARGET_DPI = 300

export function mmToUnit(mm: Mm, unit: Unit): number {
  return unit === 'mm' ? mm : mm / MM_PER_INCH
}

export function unitToMm(value: number, unit: Unit): Mm {
  return unit === 'mm' ? value : value * MM_PER_INCH
}

/** Largest print length (mm) for `px` pixels at `dpi`. */
export function maxPrintMm(px: number, dpi: number = TARGET_DPI): Mm {
  return (px / dpi) * MM_PER_INCH
}

/** Effective DPI when `px` pixels are printed across `mm`. A zero-length print has infinite DPI. */
export function effectiveDpi(px: number, mm: Mm): number {
  if (mm <= 0) return Number.POSITIVE_INFINITY
  return px / (mm / MM_PER_INCH)
}

/**
 * First-run unit for a browser locale (owner Q8, default): inches for `en-US` and `en-CA`,
 * millimetres everywhere else. Only used when no settings are saved.
 */
export function defaultUnitForLocale(locale: string): Unit {
  const normalized = locale.replace('_', '-').toLowerCase()
  return normalized === 'en-us' || normalized === 'en-ca' ? 'in' : 'mm'
}

/** Round for display: mm → 1 decimal, in → 2 decimals. */
export function roundForUnit(value: number, unit: Unit): number {
  const factor = unit === 'mm' ? 10 : 100
  return Math.round(value * factor) / factor
}
```

`src/shared/model/paper.ts`:

```ts
import type { Mm } from './units'

export type PaperId = 'A3' | 'A4' | 'A5' | 'A6' | 'Letter' | 'Legal' | 'Tabloid' | 'Custom'

export interface SizeMm {
  readonly w: Mm
  readonly h: Mm
}

/** Portrait sizes. */
export const PAPER_SIZES: Readonly<Record<Exclude<PaperId, 'Custom'>, SizeMm>> = {
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
  Tabloid: { w: 279.4, h: 431.8 },
}

/** Order shown in the UI. */
export const PAPER_IDS: readonly PaperId[] = [
  'A4',
  'Letter',
  'A3',
  'A5',
  'A6',
  'Legal',
  'Tabloid',
  'Custom',
]

export const CUSTOM_PAPER_LIMITS = { minMm: 50, maxMm: 1200 } as const
```

`src/shared/model/page-setup.ts`:

```ts
import type { PaperId, SizeMm } from './paper'
import { PAPER_SIZES } from './paper'
import type { Mm } from './units'

export type Orientation = 'auto' | 'portrait' | 'landscape'

export interface PageSetup {
  readonly paper: PaperId
  /** Used only when `paper === 'Custom'` (portrait-normalised: w ≤ h). */
  readonly customSize: SizeMm
  readonly orientation: Orientation
  /** ≥ MIN_SAFE_AREA_MM */
  readonly safeAreaMm: Mm
  readonly gutter: { readonly enabled: boolean; readonly mm: Mm }
  readonly cropMarks: boolean
  readonly bleed: { readonly enabled: boolean; readonly mm: Mm }
}

export const MIN_SAFE_AREA_MM = 3
/** Shortest trim-box side (mm) that still counts as a comfortable reference. Used by layout and images (CR-C2). */
export const MIN_COMFORT_SHORT_SIDE_MM = 60
export const CROP_MARK_LENGTH_MM = 4
/** Gap between the bleed edge and the start of a mark. */
export const CROP_MARK_OFFSET_MM = 1

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: 'A4',
  customSize: { w: 210, h: 297 },
  orientation: 'auto',
  safeAreaMm: 5,
  gutter: { enabled: true, mm: 6 },
  cropMarks: true,
  bleed: { enabled: false, mm: 3 },
}

export type PageSetupNote =
  'gutter-enabled-for-bleed' | 'gutter-raised-for-bleed' | 'safe-area-raised-to-minimum'

/**
 * Enforce invariants: safeArea ≥ 3; if bleed is enabled, the gutter is enabled and
 * gutter.mm ≥ 2 × bleed.mm (raise the gutter, never lower the bleed). Idempotent.
 */
export function normalizePageSetup(setup: PageSetup): { setup: PageSetup; notes: PageSetupNote[] } {
  const notes: PageSetupNote[] = []

  let safeAreaMm = setup.safeAreaMm
  // `!(x >= min)` also catches NaN.
  if (!(safeAreaMm >= MIN_SAFE_AREA_MM)) {
    safeAreaMm = MIN_SAFE_AREA_MM
    notes.push('safe-area-raised-to-minimum')
  }

  let gutter = setup.gutter
  if (setup.bleed.enabled) {
    if (!gutter.enabled) {
      gutter = { enabled: true, mm: gutter.mm }
      notes.push('gutter-enabled-for-bleed')
    }
    const minGutter = 2 * setup.bleed.mm
    if (!(gutter.mm >= minGutter)) {
      gutter = { enabled: true, mm: minGutter }
      notes.push('gutter-raised-for-bleed')
    }
  }

  return { setup: { ...setup, safeAreaMm, gutter }, notes }
}

/** Portrait paper size for the setup (`customSize` for Custom). */
export function paperSizeMm(setup: PageSetup): SizeMm {
  return setup.paper === 'Custom' ? setup.customSize : PAPER_SIZES[setup.paper]
}

/** Space reserved outside every trim box for bleed + crop marks (D2: inside the safe area). */
export function outerReserveMm(setup: PageSetup): Mm {
  return (
    (setup.bleed.enabled ? setup.bleed.mm : 0) +
    (setup.cropMarks ? CROP_MARK_OFFSET_MM + CROP_MARK_LENGTH_MM : 0)
  )
}

/** Gap between neighbouring trim boxes. */
export function gutterMm(setup: PageSetup): Mm {
  return setup.gutter.enabled ? setup.gutter.mm : 0
}

/**
 * Area available to trim boxes on an oriented page: the page inset by
 * `safeAreaMm + outerReserveMm`. Width and height never go below 0.
 */
export function contentBoxMm(setup: PageSetup, oriented: SizeMm): { x: Mm; y: Mm; w: Mm; h: Mm } {
  const inset = setup.safeAreaMm + outerReserveMm(setup)
  return {
    x: inset,
    y: inset,
    w: Math.max(0, oriented.w - 2 * inset),
    h: Math.max(0, oriented.h - 2 * inset),
  }
}
```

`src/shared/model/image.ts`:

```ts
import type { Mm } from './units'

export type ImageId = string & { readonly __brand: 'ImageId' }
export type Rotation = 0 | 90 | 180 | 270

/** Crop in source pixels, in the EXIF-corrected orientation, before rotation and flips. */
export interface CropRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export type CropAspect = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9'

export type SizeMode =
  | { readonly kind: 'auto' }
  | { readonly kind: 'fixed'; readonly axis: 'width' | 'height'; readonly mm: Mm }

export interface ImageEdits {
  /** null = full image */
  readonly crop: CropRect | null
  readonly cropAspect: CropAspect
  /** Clockwise, applied after crop. */
  readonly rotation: Rotation
  /** Applied after rotation. */
  readonly flipH: boolean
  readonly flipV: boolean
  /** Integer 1..MAX_COPIES */
  readonly copies: number
  readonly size: SizeMode
}

export const MAX_COPIES = 50

export const DEFAULT_EDITS: ImageEdits = {
  crop: null,
  cropAspect: 'free',
  rotation: 0,
  flipH: false,
  flipV: false,
  copies: 1,
  size: { kind: 'auto' },
}

/** Everything about an image the pure core needs (no pixels). */
export interface ImageDescriptor {
  readonly id: ImageId
  /** Decoded (possibly downscaled), EXIF-corrected. */
  readonly pxW: number
  readonly pxH: number
  readonly edits: ImageEdits
}

/** Pixel size after crop and rotation (what gets printed). */
export function printedPixelSize(img: ImageDescriptor): { pxW: number; pxH: number } {
  const w = img.edits.crop?.w ?? img.pxW
  const h = img.edits.crop?.h ?? img.pxH
  const quarterTurn = img.edits.rotation === 90 || img.edits.rotation === 270
  return quarterTurn ? { pxW: h, pxH: w } : { pxW: w, pxH: h }
}

/** Downscale cap on load: longest preset paper side (Tabloid 431.8 mm) at 300 DPI. */
export const MAX_SOURCE_LONG_SIDE_PX = 5100
```

- [ ] **Step 4: Run to verify success**

Run: `pnpm vitest run --project unit src/shared/model && pnpm lint && pnpm typecheck`
Expected: 39 tests pass, lint and typecheck clean.

- [ ] **Step 5: Commit and open the PR**

```bash
git add src/shared/model
git commit -m "feat(model): add units, paper, page-setup and image model"
```

---

### Task A4: i18n setup, namespaces and English skeletons

**Branch:** `feat/m1-i18n` · **PR title:** `feat(i18n): add i18next setup, namespaces and English skeletons`

**Files:**
- Create: `src/shared/i18n/{languages,resources,init,index}.ts`, `src/locales/en/{common,errors}.json`, and **empty** (`{}`) `src/locales/en/{app,images,pageSetup,preview,export}.json`
- Test: `src/shared/i18n/init.test.ts`, `src/shared/i18n/locales.test.ts`

**Interfaces:**
- Consumes: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
- Produces:
  - `LANGUAGES`, `type LanguageCode`, `DEFAULT_LANGUAGE`, `NAMESPACES`, `type Namespace`, `isLanguageCode(value): value is LanguageCode` (from `languages.ts`, re-exported by `index.ts`).
  - `initI18n(options?: { savedLanguage?: LanguageCode | null }): Promise<i18n>`. The contract says `initI18n()`; the saved language is passed in because i18n must not import settings (settings imports `LanguageCode` from i18n). Idempotent. Loads every `src/locales/*/*.json` through `import.meta.glob` (CR-E1), so later sub-plans add a namespace file without editing this module. Detection order: the saved setting, then `navigator`, then `en`.
  - **One rule for JSON consumers:** code and tests that need a string use i18next (`useTranslation('<ns>')` after `initI18n`, or `i18n.t('<ns>:key')`). A test that needs the raw file imports it directly, e.g. `import images from '../../locales/en/images.json'` (works because `resolveJsonModule` is on, A2). Nobody edits `resources.ts`.
  - Ownership of namespace files: A creates all of them; **C** owns `images.json` and `errors.images.*`; **D** owns `preview.json`, `export.json`, `errors.export.*`; **E** owns `app.json` and `pageSetup.json`, and puts its shell strings in `app.json`; `common.json` stays with A (CCR-A3, ruled: see overview CCR-A3). Keys are camelCase, nested by component (`images:list.empty.title`), and `_one`/`_other` plural suffixes are allowed.

- [ ] **Step 1: Write the failing tests**

`src/shared/i18n/init.test.ts`:

```ts
import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from './init'
import { LANGUAGES, NAMESPACES } from './languages'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('initI18n', () => {
  it('serves English strings from every namespace file', async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    expect(i18n.t('common:app.comingSoon')).toBe('The workspace is coming soon.')
    expect(i18n.t('errors:generic.unexpected')).toBe('Something went wrong. Please try again.')
    for (const ns of NAMESPACES) expect(i18n.hasResourceBundle('en', ns)).toBe(true)
  })

  it('is idempotent', async () => {
    const a = await initI18n({ savedLanguage: 'en' })
    const b = await initI18n()
    expect(b).toBe(a)
    expect(b).toBe(i18next)
  })

  it('falls back to English for a saved language without resources', async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    await i18n.changeLanguage('ja')
    expect(i18n.t('common:actions.close')).toBe('Close')
    await i18n.changeLanguage('en')
  })

  it('falls back to English for a language that is not supported at all', async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    await i18n.changeLanguage('fr')
    expect(i18n.t('common:actions.close')).toBe('Close')
    await i18n.changeLanguage('en')
  })

  it('lists the seven planned languages', () => {
    expect(LANGUAGES).toEqual(['en', 'pt-BR', 'ja', 'ko', 'it', 'es', 'zh-CN'])
  })
})
```

`src/shared/i18n/locales.test.ts` (also guards sub-plans B–E: a badly named key or a missing namespace file fails CI):

```ts
import { describe, expect, it } from 'vitest'
import { NAMESPACES } from './languages'

const files = import.meta.glob<Record<string, unknown>>('../../locales/en/*.json', {
  eager: true,
  import: 'default',
})

const KEY = /^[a-z][A-Za-z0-9]*(_(zero|one|two|few|many|other))?$/

function collectBadKeys(value: unknown, path: string[] = []): string[] {
  if (typeof value === 'string') return []
  if (typeof value !== 'object' || value === null)
    return [`${path.join('.')} is not a string or object`]
  return Object.entries(value).flatMap(([key, child]) => [
    ...(KEY.test(key) ? [] : [[...path, key].join('.')]),
    ...collectBadKeys(child, [...path, key]),
  ])
}

describe('English locale files', () => {
  it('has exactly one file per namespace', () => {
    const names = Object.keys(files)
      .map((p) => /\/([^/]+)\.json$/.exec(p)?.[1])
      .sort()
    expect(names).toEqual([...NAMESPACES].sort())
  })

  it('uses camelCase keys and string values everywhere', () => {
    for (const [path, content] of Object.entries(files)) {
      expect(collectBadKeys(content), path).toEqual([])
    }
  })

  it('has the error groups sub-plans C and D add to', () => {
    const errors = Object.entries(files).find(([p]) => p.endsWith('/errors.json'))?.[1]
    expect(errors).toBeDefined()
    expect(Object.keys(errors ?? {})).toEqual(
      expect.arrayContaining(['images', 'export', 'generic']),
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/shared/i18n`
Expected: FAIL: `./init` and `./languages` cannot be resolved.

- [ ] **Step 3: Create the locale files**

`src/locales/en/common.json`:

```json
{
  "app": {
    "comingSoon": "The workspace is coming soon."
  },
  "actions": {
    "cancel": "Cancel",
    "close": "Close",
    "ok": "OK"
  },
  "units": {
    "mm": "mm",
    "in": "in"
  },
  "theme": {
    "auto": "Auto",
    "light": "Light",
    "dark": "Dark"
  }
}
```

`src/locales/en/errors.json`:

```json
{
  "images": {},
  "export": {},
  "generic": {
    "unexpected": "Something went wrong. Please try again."
  }
}
```

Create `src/locales/en/app.json`, `images.json`, `pageSetup.json`, `preview.json` and `export.json`, each containing exactly:

```json
{}
```

- [ ] **Step 4: Implement**

`src/shared/i18n/languages.ts`:

```ts
export const LANGUAGES = ['en', 'pt-BR', 'ja', 'ko', 'it', 'es', 'zh-CN'] as const
export type LanguageCode = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

/** One JSON file per namespace per language: `src/locales/<lang>/<ns>.json`. */
export const NAMESPACES = [
  'common',
  'app',
  'images',
  'pageSetup',
  'preview',
  'export',
  'errors',
] as const
export type Namespace = (typeof NAMESPACES)[number]

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}
```

`src/shared/i18n/resources.ts`:

```ts
import type { LanguageCode } from './languages'

type NamespaceResources = Record<string, Record<string, unknown>>

// Every `src/locales/<lang>/*.json` is picked up automatically, so adding a namespace file never
// means editing this module. The file name (without `.json`) is the namespace.
const files = import.meta.glob<Record<string, unknown>>('../../locales/*/*.json', {
  eager: true,
  import: 'default',
})

function buildResources(): Partial<Record<LanguageCode, NamespaceResources>> {
  const out: Partial<Record<LanguageCode, NamespaceResources>> = {}
  for (const [path, content] of Object.entries(files)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
    const lang = match?.[1] as LanguageCode | undefined
    const ns = match?.[2]
    if (!lang || !ns) continue
    ;(out[lang] ??= {})[ns] = content
  }
  return out
}

/** Only English has resources in M1. Adding a language = adding `src/locales/<lang>/*.json` (M6). */
export const resources = buildResources()
```

`src/shared/i18n/init.ts`:

```ts
import i18n, { type i18n as I18nInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, LANGUAGES, NAMESPACES, type LanguageCode } from './languages'
import { resources } from './resources'

export interface InitI18nOptions {
  /** The language saved in settings. It wins over the browser's language. null = not chosen yet. */
  readonly savedLanguage?: LanguageCode | null
}

/**
 * Initialise i18next once. Detection order: the saved setting, then `navigator`, then `en`.
 * Languages without resources fall back to English, so an unsupported browser language never breaks the UI.
 * Safe to call more than once: later calls return the same instance (and apply `savedLanguage` if given).
 */
export async function initI18n(options: InitI18nOptions = {}): Promise<I18nInstance> {
  const { savedLanguage = null } = options
  if (i18n.isInitialized) {
    if (savedLanguage) await i18n.changeLanguage(savedLanguage)
    return i18n
  }
  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng: savedLanguage ?? undefined,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...LANGUAGES],
      nonExplicitSupportedLngs: false,
      ns: [...NAMESPACES],
      defaultNS: 'common',
      detection: { order: ['navigator'], caches: [] },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      initAsync: false,
    })
  return i18n
}
```

`src/shared/i18n/index.ts`:

```ts
export { DEFAULT_LANGUAGE, LANGUAGES, NAMESPACES, isLanguageCode } from './languages'
export type { LanguageCode, Namespace } from './languages'
export { initI18n } from './init'
export type { InitI18nOptions } from './init'
```

- [ ] **Step 5: Run to verify success**

Run: `pnpm vitest run --project unit src/shared/i18n && pnpm lint && pnpm typecheck && pnpm format:check`
Expected: 8 tests pass. If Prettier reformats a JSON file (for example `{}`), run `pnpm format` and commit the result.

- [ ] **Step 6: Commit and open the PR**

```bash
git add src/shared/i18n src/locales
git commit -m "feat(i18n): add i18next setup, namespaces and English skeletons"
```

---

### Task A5: Persisted settings store

**Branch:** `feat/m1-settings` · **PR title:** `feat(settings): add persisted settings store`

**Files:**
- Create: `src/features/settings/{schema,store,index}.ts`
- Test: `src/features/settings/{schema,store}.test.ts`

**Interfaces:**
- Consumes: A3 (`PageSetup`, `DEFAULT_PAGE_SETUP`, `normalizePageSetup`, `PageSetupNote`, `CUSTOM_PAPER_LIMITS`, `PAPER_IDS`, `Unit`, `defaultUnitForLocale`, `SizeMm`), A4 (`LANGUAGES`, `LanguageCode`), `zustand`, `zod`.
- Produces (all re-exported from `src/features/settings/index.ts`):
  - `useSettings`: the persisted store hook. Storage key `artistica:settings`; zustand `persist` envelope `{ state, version: 1 }` (CR-E8), `state` holding only `pageSetup`, `unit`, `language`, `theme`.
  - `SettingsState = SettingsData & { pageSetupNotes: PageSetupNote[]; setPageSetup(patch: PageSetupPatch): void; setUnit(unit: Unit): void; setLanguage(language: LanguageCode | null): void; setTheme(theme: Theme): void; reset(): void }`.
  - `SettingsData = { pageSetup: PageSetup; unit: Unit; language: LanguageCode | null; theme: Theme }`, `Theme = 'auto' | 'light' | 'dark'`, `THEMES`, `DEFAULT_SETTINGS`.
  - `PageSetupPatch`: every `PageSetup` field optional, with `customSize`, `gutter` and `bleed` accepted as partial objects that merge one level deep.
  - `parseSettings(input: unknown): SettingsData` (total, never throws), `settingsSchema`, `createSettingsStore(storage?, initialUnit?: Unit)` (tests; `initialUnit` defaults to `'mm'`; `useSettings` passes `defaultUnitForLocale(navigator.language)` read in a guarded way, owner Q8, default), `safeStorage(inner)`, `initialUnitFromNavigator(nav?)`, `SETTINGS_STORAGE_KEY`, `SETTINGS_VERSION`.

- [ ] **Step 1: Write the failing tests**

`src/features/settings/schema.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MIN_SAFE_AREA_MM, normalizePageSetup } from '../../shared/model/page-setup'
import { DEFAULT_SETTINGS, parseSettings, settingsSchema } from './schema'

describe('parseSettings', () => {
  it('returns defaults for non-objects', () => {
    for (const bad of [undefined, null, 'x', 42, true, [], [1, 2]]) {
      expect(parseSettings(bad)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('accepts valid settings unchanged', () => {
    const valid = {
      pageSetup: {
        paper: 'Letter',
        customSize: { w: 100, h: 200 },
        orientation: 'landscape',
        safeAreaMm: 8,
        gutter: { enabled: true, mm: 10 },
        cropMarks: false,
        bleed: { enabled: true, mm: 3 },
      },
      unit: 'in',
      language: 'en',
      theme: 'dark',
    }
    expect(parseSettings(valid)).toEqual(valid)
  })

  it('keeps good fields and defaults only the bad ones', () => {
    const out = parseSettings({ unit: 'in', theme: 'neon', language: 'xx', pageSetup: 'nope' })
    expect(out.unit).toBe('in')
    expect(out.theme).toBe('auto')
    expect(out.language).toBeNull()
    expect(out.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
  })

  it('defaults individual bad page-setup fields', () => {
    const out = parseSettings({
      pageSetup: {
        paper: 'B5',
        safeAreaMm: -2,
        bleed: { enabled: 'yes', mm: 1e9 },
        cropMarks: false,
      },
    })
    expect(out.pageSetup.paper).toBe('A4')
    expect(out.pageSetup.safeAreaMm).toBe(DEFAULT_SETTINGS.pageSetup.safeAreaMm)
    expect(out.pageSetup.bleed).toEqual(DEFAULT_SETTINGS.pageSetup.bleed)
    expect(out.pageSetup.cropMarks).toBe(false)
  })

  it('raises an out-of-contract safe area and applies the bleed rule', () => {
    const out = parseSettings({
      pageSetup: {
        safeAreaMm: 1,
        gutter: { enabled: false, mm: 0 },
        bleed: { enabled: true, mm: 3 },
      },
    })
    expect(out.pageSetup.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
    expect(out.pageSetup.gutter).toEqual({ enabled: true, mm: 6 })
  })

  it('portrait-normalises a landscape custom size', () => {
    const out = parseSettings({ pageSetup: { paper: 'Custom', customSize: { w: 400, h: 100 } } })
    expect(out.pageSetup.customSize).toEqual({ w: 100, h: 400 })
  })

  it('rejects custom sizes outside 50..1200 mm', () => {
    expect(
      parseSettings({ pageSetup: { customSize: { w: 10, h: 5000 } } }).pageSetup.customSize,
    ).toEqual(DEFAULT_SETTINGS.pageSetup.customSize)
  })

  it('treats NaN, Infinity and huge numbers as invalid', () => {
    const out = parseSettings({
      pageSetup: { safeAreaMm: Number.NaN, gutter: { mm: Number.POSITIVE_INFINITY } },
    })
    expect(out.pageSetup.safeAreaMm).toBe(5)
    expect(out.pageSetup.gutter.mm).toBe(6)
  })

  it('never throws and always returns a normalised result for any JSON (property)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (json) => {
        const out = parseSettings(json)
        expect(settingsSchema.safeParse(out).success).toBe(true)
        expect(normalizePageSetup(out.pageSetup).notes).toEqual([])
      }),
    )
  })

  it('survives objects with hostile shapes (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          pageSetup: fc.anything(),
          unit: fc.anything(),
          language: fc.anything(),
          theme: fc.anything(),
        }),
        (obj) => {
          expect(() => parseSettings(obj)).not.toThrow()
        },
      ),
    )
  })
})
```

`src/features/settings/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { DEFAULT_SETTINGS } from './schema'
import {
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  createSettingsStore,
  initialUnitFromNavigator,
  safeStorage,
} from './store'

function memoryStorage(initial?: string): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(SETTINGS_STORAGE_KEY, initial)
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}

const saved = (storage: { data: Map<string, string> }) =>
  JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY) ?? 'null') as {
    version: number
    state: Record<string, unknown>
  }

describe('defaults', () => {
  it('starts from the defaults', () => {
    const s = createSettingsStore(memoryStorage()).getState()
    expect(s.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
    expect(s.unit).toBe('mm')
    expect(s.language).toBeNull()
    expect(s.theme).toBe('auto')
    expect(s.pageSetupNotes).toEqual([])
  })
})

describe('initial unit (owner Q8, default)', () => {
  it('uses the given initial unit when nothing is saved', () => {
    expect(createSettingsStore(memoryStorage(), 'in').getState().unit).toBe('in')
  })

  it('lets a saved unit win over the initial unit', () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 1, state: { ...DEFAULT_SETTINGS, unit: 'mm' } }),
    )
    expect(createSettingsStore(storage, 'in').getState().unit).toBe('mm')
  })

  it('keeps the initial unit when the saved value is unreadable', () => {
    expect(createSettingsStore(memoryStorage('{oops'), 'in').getState().unit).toBe('in')
  })

  it('reset restores the initial unit', () => {
    const store = createSettingsStore(memoryStorage(), 'in')
    store.getState().setUnit('mm')
    store.getState().reset()
    expect(store.getState().unit).toBe('in')
  })

  it('reads the browser locale in a guarded way', () => {
    expect(initialUnitFromNavigator({ language: 'en-US' })).toBe('in')
    expect(initialUnitFromNavigator({ language: 'en-CA' })).toBe('in')
    expect(initialUnitFromNavigator({ language: 'fr' })).toBe('mm')
    expect(initialUnitFromNavigator({})).toBe('mm')
    expect(initialUnitFromNavigator(undefined)).toBe('mm')
    const hostile = {
      get language(): string {
        throw new Error('blocked')
      },
    }
    expect(initialUnitFromNavigator(hostile)).toBe('mm')
  })
})

describe('actions', () => {
  it('setPageSetup merges nested fields and normalises', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setPageSetup({ bleed: { enabled: true } })
    const s = store.getState()
    expect(s.pageSetup.bleed).toEqual({ enabled: true, mm: 3 })
    expect(s.pageSetup.gutter).toEqual({ enabled: true, mm: 6 })
    expect(s.pageSetupNotes).toEqual([])
    store.getState().setPageSetup({ bleed: { mm: 5 } })
    expect(store.getState().pageSetup.gutter.mm).toBe(10)
    expect(store.getState().pageSetupNotes).toEqual(['gutter-raised-for-bleed'])
    store.getState().setPageSetup({ cropMarks: false })
    expect(store.getState().pageSetupNotes).toEqual([])
  })

  it('setPageSetup enforces the minimum safe area', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setPageSetup({ safeAreaMm: 0 })
    expect(store.getState().pageSetup.safeAreaMm).toBe(3)
    expect(store.getState().pageSetupNotes).toEqual(['safe-area-raised-to-minimum'])
  })

  it('sets unit, language and theme, and reset restores the defaults', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setUnit('in')
    store.getState().setLanguage('pt-BR')
    store.getState().setTheme('dark')
    store.getState().setPageSetup({ paper: 'Letter' })
    expect(store.getState()).toMatchObject({ unit: 'in', language: 'pt-BR', theme: 'dark' })
    store.getState().reset()
    expect(store.getState()).toMatchObject({ ...DEFAULT_SETTINGS, pageSetupNotes: [] })
  })

  it('toggling the unit never changes stored millimetres', () => {
    const store = createSettingsStore(memoryStorage())
    store.getState().setPageSetup({ safeAreaMm: 7.3 })
    store.getState().setUnit('in')
    store.getState().setUnit('mm')
    expect(store.getState().pageSetup.safeAreaMm).toBe(7.3)
  })
})

describe('persistence', () => {
  it('writes version 1 under artistica:settings, without notes or actions', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setTheme('light')
    store.getState().setPageSetup({ safeAreaMm: 1 })
    const { version, state } = saved(storage)
    expect(SETTINGS_STORAGE_KEY).toBe('artistica:settings')
    expect(version).toBe(1)
    expect(SETTINGS_VERSION).toBe(1)
    expect(Object.keys(state).sort()).toEqual(['language', 'pageSetup', 'theme', 'unit'])
  })

  it('restores saved settings', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        state: { ...DEFAULT_SETTINGS, unit: 'in', theme: 'dark', language: 'ja' },
      }),
    )
    expect(createSettingsStore(storage).getState()).toMatchObject({
      unit: 'in',
      theme: 'dark',
      language: 'ja',
    })
  })

  it.each([
    ['not JSON', '{oops'],
    ['an empty string', ''],
    ['JSON null', 'null'],
    ['a bare number', '42'],
    ['no state', JSON.stringify({ version: 1 })],
    ['state is a string', JSON.stringify({ version: 1, state: 'x' })],
    ['an array', '[1,2,3]'],
  ])('falls back to defaults when the saved value is %s', (_name, raw) => {
    const s = createSettingsStore(memoryStorage(raw)).getState()
    expect(s).toMatchObject(DEFAULT_SETTINGS)
  })

  it('sanitises current-version data that was edited by hand', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        state: { unit: 'furlongs', theme: 'dark', pageSetup: { paper: 'A3', safeAreaMm: 0.5 } },
      }),
    )
    const s = createSettingsStore(storage).getState()
    expect(s.unit).toBe('mm')
    expect(s.theme).toBe('dark')
    expect(s.pageSetup.paper).toBe('A3')
    expect(s.pageSetup.safeAreaMm).toBe(3)
  })

  it('migrates old versions by sanitising them', () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 0, state: { unit: 'in', page: { paper: 'A5' } } }),
    )
    const s = createSettingsStore(storage).getState()
    expect(s.unit).toBe('in')
    expect(s.pageSetup).toEqual(DEFAULT_SETTINGS.pageSetup)
  })

  it('reads settings written by a newer version as well as it can', () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 99, state: { theme: 'light', extra: { a: 1 } } }),
    )
    const s = createSettingsStore(storage).getState()
    expect(s.theme).toBe('light')
    expect(s).not.toHaveProperty('extra')
  })

  it('does not store anything but the four settings (privacy)', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    store.getState().setUnit('in')
    expect(JSON.stringify(saved(storage))).not.toMatch(/image|bitmap|blob|url/i)
  })
})

describe('storage that fails', () => {
  const throwing: StateStorage = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
  }

  it('safeStorage swallows read and write errors', () => {
    const s = safeStorage(() => throwing)
    expect(s.getItem('k')).toBeNull()
    expect(() => {
      s.setItem('k', 'v')
      void s.removeItem('k')
    }).not.toThrow()
  })

  it('safeStorage survives the storage accessor itself throwing', () => {
    const s = safeStorage(() => {
      throw new Error('blocked')
    })
    expect(s.getItem('k')).toBeNull()
  })

  it('the store keeps working in memory when storage is unavailable', () => {
    const store = createSettingsStore(safeStorage(() => throwing))
    expect(() => {
      store.getState().setTheme('dark')
    }).not.toThrow()
    expect(store.getState().theme).toBe('dark')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project unit src/features/settings`
Expected: FAIL: `./schema` and `./store` cannot be resolved.

- [ ] **Step 3: Implement**

`src/features/settings/schema.ts`:

```ts
import { z } from 'zod'
import { LANGUAGES, type LanguageCode } from '../../shared/i18n/languages'
import { CUSTOM_PAPER_LIMITS, PAPER_IDS, type PaperId } from '../../shared/model/paper'
import {
  DEFAULT_PAGE_SETUP,
  normalizePageSetup,
  type Orientation,
  type PageSetup,
} from '../../shared/model/page-setup'
import type { Unit } from '../../shared/model/units'

export const THEMES = ['auto', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export interface SettingsData {
  readonly pageSetup: PageSetup
  readonly unit: Unit
  readonly language: LanguageCode | null
  readonly theme: Theme
}

export const DEFAULT_SETTINGS: SettingsData = {
  pageSetup: DEFAULT_PAGE_SETUP,
  unit: 'mm',
  language: null,
  theme: 'auto',
}

const D = DEFAULT_PAGE_SETUP
const { minMm, maxMm } = CUSTOM_PAPER_LIMITS

const lengthMm = (max: number) => z.number().min(0).max(max)
const paperIds = PAPER_IDS as [PaperId, ...PaperId[]]
const orientations: [Orientation, ...Orientation[]] = ['auto', 'portrait', 'landscape']

/**
 * Every field falls back to its default on its own (`.catch`), so one bad field never throws away
 * the others. The schema is deliberately total: `parse` never throws on any input that is an object.
 */
const pageSetupSchema = z.object({
  paper: z.enum(paperIds).catch(D.paper),
  customSize: z
    .object({
      w: z.number().min(minMm).max(maxMm),
      h: z.number().min(minMm).max(maxMm),
    })
    .catch(D.customSize),
  orientation: z.enum(orientations).catch(D.orientation),
  safeAreaMm: lengthMm(100).catch(D.safeAreaMm),
  gutter: z
    .object({ enabled: z.boolean().catch(D.gutter.enabled), mm: lengthMm(100).catch(D.gutter.mm) })
    .catch(D.gutter),
  cropMarks: z.boolean().catch(D.cropMarks),
  bleed: z
    .object({ enabled: z.boolean().catch(D.bleed.enabled), mm: lengthMm(50).catch(D.bleed.mm) })
    .catch(D.bleed),
})

export const settingsSchema = z.object({
  pageSetup: pageSetupSchema.catch(D),
  unit: z.enum(['mm', 'in']).catch(DEFAULT_SETTINGS.unit),
  language: z.enum(LANGUAGES).nullable().catch(null),
  theme: z.enum(THEMES).catch(DEFAULT_SETTINGS.theme),
})

let warned = false
function warnOnce(reason: unknown): void {
  if (warned || !import.meta.env.DEV) return
  warned = true
  console.warn('[artistica] Ignoring unreadable saved settings; using defaults.', reason)
}

/**
 * Turn anything that came out of storage into valid settings. Never throws.
 * Missing or invalid fields take their defaults and the page setup is normalised.
 */
export function parseSettings(input: unknown): SettingsData {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    if (input !== undefined && input !== null) warnOnce(input)
    return DEFAULT_SETTINGS
  }
  try {
    const parsed = settingsSchema.parse(input)
    // customSize is stored portrait-normalised (w ≤ h).
    const { w, h } = parsed.pageSetup.customSize
    const customSize = w <= h ? { w, h } : { w: h, h: w }
    const pageSetup = normalizePageSetup({ ...parsed.pageSetup, customSize }).setup
    return { ...parsed, pageSetup }
  } catch (error) {
    warnOnce(error)
    return DEFAULT_SETTINGS
  }
}
```

`src/features/settings/store.ts`:

```ts
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { LanguageCode } from '../../shared/i18n/languages'
import {
  normalizePageSetup,
  type PageSetup,
  type PageSetupNote,
} from '../../shared/model/page-setup'
import type { SizeMm } from '../../shared/model/paper'
import { defaultUnitForLocale, type Unit } from '../../shared/model/units'
import { DEFAULT_SETTINGS, parseSettings, type SettingsData, type Theme } from './schema'

export const SETTINGS_STORAGE_KEY = 'artistica:settings'
export const SETTINGS_VERSION = 1

/** Nested objects are merged one level deep, so callers can change one gutter field. */
export interface PageSetupPatch {
  readonly paper?: PageSetup['paper']
  readonly customSize?: Partial<SizeMm>
  readonly orientation?: PageSetup['orientation']
  readonly safeAreaMm?: PageSetup['safeAreaMm']
  readonly gutter?: Partial<PageSetup['gutter']>
  readonly cropMarks?: PageSetup['cropMarks']
  readonly bleed?: Partial<PageSetup['bleed']>
}

export interface SettingsState extends SettingsData {
  /** Notes from the latest `setPageSetup` call. Not persisted. */
  readonly pageSetupNotes: PageSetupNote[]
  setPageSetup(patch: PageSetupPatch): void
  setUnit(unit: Unit): void
  setLanguage(language: LanguageCode | null): void
  setTheme(theme: Theme): void
  reset(): void
}

function mergePageSetup(base: PageSetup, patch: PageSetupPatch): PageSetup {
  return {
    ...base,
    ...patch,
    customSize: { ...base.customSize, ...patch.customSize },
    gutter: { ...base.gutter, ...patch.gutter },
    bleed: { ...base.bleed, ...patch.bleed },
  }
}

/**
 * Wrap a storage so that it can never throw: blocked site data, quota errors and private windows
 * must cost us persistence, not the app. Reads that fail look like "nothing saved".
 */
export function safeStorage(inner: () => StateStorage): StateStorage {
  const guard = <T>(fn: (storage: StateStorage) => T, fallback: T): T => {
    try {
      return fn(inner())
    } catch {
      return fallback
    }
  }
  return {
    getItem: (key) => guard((s) => s.getItem(key) as string | null, null),
    setItem: (key, value) => {
      guard((s) => {
        s.setItem(key, value)
      }, undefined)
    },
    removeItem: (key) => {
      guard((s) => {
        s.removeItem(key)
      }, undefined)
    },
  }
}

/** `window.localStorage` is read lazily because merely touching it can throw. */
const browserStorage = safeStorage(() => window.localStorage)

/**
 * First-run unit from the browser language (owner Q8, default). `navigator` may be missing
 * (SSR, workers) or its getters may throw, in which case the answer is millimetres.
 */
export function initialUnitFromNavigator(
  nav: { readonly language?: unknown } | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
): Unit {
  try {
    const language = nav?.language
    return typeof language === 'string' ? defaultUnitForLocale(language) : 'mm'
  } catch {
    return 'mm'
  }
}

/**
 * Exported for tests; the app uses `useSettings`. `initialUnit` applies only when nothing valid
 * is saved (and after `reset()`); tests leave it at `'mm'` so jsdom's `en-US` does not leak in.
 */
export function createSettingsStore(
  storage: StateStorage = browserStorage,
  initialUnit: Unit = DEFAULT_SETTINGS.unit,
) {
  return create<SettingsState>()(
    persist(
      (set) => ({
        ...DEFAULT_SETTINGS,
        unit: initialUnit,
        pageSetupNotes: [],
        setPageSetup: (patch) => {
          set((state) => {
            const { setup, notes } = normalizePageSetup(mergePageSetup(state.pageSetup, patch))
            return { pageSetup: setup, pageSetupNotes: notes }
          })
        },
        setUnit: (unit) => {
          set({ unit })
        },
        setLanguage: (language) => {
          set({ language })
        },
        setTheme: (theme) => {
          set({ theme })
        },
        reset: () => {
          set({ ...DEFAULT_SETTINGS, unit: initialUnit, pageSetupNotes: [] })
        },
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        version: SETTINGS_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ pageSetup, unit, language, theme }) => ({
          pageSetup,
          unit,
          language,
          theme,
        }),
        // Runs for older/newer versions. There is no earlier format to convert, so anything
        // that is not a v1 object is sanitised the same way.
        migrate: (persisted) => parseSettings(persisted),
        // Runs for every load, including current-version data that was edited by hand.
        // Nothing saved (or unreadable JSON, which storage reports as null) keeps the initial
        // state, including the locale-based unit.
        merge: (persisted, current) =>
          persisted === undefined || persisted === null
            ? current
            : { ...current, ...parseSettings(persisted) },
      },
    ),
  )
}

export const useSettings = createSettingsStore(browserStorage, initialUnitFromNavigator())
```

`src/features/settings/index.ts`:

```ts
export { DEFAULT_SETTINGS, THEMES, parseSettings, settingsSchema } from './schema'
export type { SettingsData, Theme } from './schema'
export {
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  createSettingsStore,
  initialUnitFromNavigator,
  safeStorage,
  useSettings,
} from './store'
export type { PageSetupPatch, SettingsState } from './store'
```

- [ ] **Step 4: Run to verify success**

Run: `pnpm vitest run --project unit src/features/settings && pnpm lint && pnpm typecheck`
Expected: 36 tests pass. In dev, `console.warn` fires at most once per page load for unreadable data; the tests run with `import.meta.env.DEV` true and tolerate it.

- [ ] **Step 5: Commit and open the PR**

```bash
git add src/features/settings
git commit -m "feat(settings): add persisted settings store"
```

---

### Task A6: i18n lint rule and a translated placeholder app

**Branch:** `feat/m1-i18n-lint` · **PR title:** `feat(app): enforce i18n lint rule and translate the placeholder app`

**Files:**
- Modify: `eslint.config.js`, `src/app/App.tsx`, `src/app/main.tsx`
- Create: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: A2 (`dom` project, `setup-dom.ts`), A4 (`initI18n`, `common:app.comingSoon`), A5 (`useSettings`).
- Produces: `no-literal-string` (mode `jsx-only`) enforced on `src/**/*.tsx` except tests; the app calls `initI18n({ savedLanguage })` before the first render. E replaces `App.tsx` later.

- [ ] **Step 1: Turn the rule on (this is the failing test)**

In `eslint.config.js` add the import next to the other plugin imports:

```js
import i18next from 'eslint-plugin-i18next'
```

and add this block just before `prettier,` at the end of the array:

```js
  {
    // Literal strings in JSX (text and attributes such as aria-label, title, placeholder) must go
    // through i18n. Tests, e2e, landing and index.html are exempt.
    files: ['src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    ...i18next.configs['flat/recommended'],
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-only' }] },
  },
```

Run: `pnpm lint`
Expected: FAIL: `src/app/App.tsx` reports `disallow literal string: The workspace is coming soon.`.

- [ ] **Step 2: Write the component test**

`src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../shared/i18n'
import { App } from './App'

beforeAll(async () => {
  await initI18n({ savedLanguage: 'en' })
})

describe('App', () => {
  it('shows the app name and the translated placeholder', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Artistica' })).toBeInTheDocument()
    expect(screen.getByText('The workspace is coming soon.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Translate the placeholder**

`src/app/App.tsx` (the class names stay; `common:app.comingSoon` was added in A4):

```tsx
import { useTranslation } from 'react-i18next'
import { APP_NAME } from '../shared/app-info'

export function App() {
  const { t } = useTranslation('common')
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="font-display text-4xl font-bold">{APP_NAME}</h1>
      <p className="text-lg">{t('app.comingSoon')}</p>
    </main>
  )
}
```

`src/app/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { useSettings } from '../features/settings'
import { pageTitle } from '../shared/app-info'
import { initI18n } from '../shared/i18n'
import { App } from './App'

document.title = pageTitle('App')

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element in app/index.html')

// Resources are bundled, so this resolves immediately; waiting keeps the first paint translated.
void initI18n({ savedLanguage: useSettings.getState().language }).then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
```

- [ ] **Step 4: Verify**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build
E2E_PORT=4101 pnpm e2e --project=chromium     # unique port: A6, A7 and A12 can run in parallel
```

Expected: all green (the E2E smoke test still finds the "Artistica" heading, 36 px).

- [ ] **Step 5: Commit and open the PR**

```bash
git add eslint.config.js src/app
git commit -m "feat(app): enforce i18n lint rule and translate the placeholder app"
```

---

### Task A7: Design tokens, fonts, Tailwind theme and base styles

**Branch:** `feat/m1-design-tokens` · **PR title:** `feat(design): add theme tokens, self-hosted fonts, base styles and icons`

**Files:**
- Create: `src/shared/theme/tokens.css`, `src/shared/theme/base.css`, `src/shared/ui/css/{basics,forms,overlays}.css` (header comment only; A9, A10 and A11 fill them), `src/shared/ui/{cx.ts,icon-paths.ts,Icon.tsx}`
- Modify: `src/shared/styles.css` (keep both `@source not` lines), `.prettierignore`, `app/index.html`
- Test: `src/shared/theme/tokens.test.ts`, `src/shared/ui/icon.test.tsx`

**Interfaces:**
- Consumes: A1 (fontsource packages, `tailwindcss`), A2 (`dom` project, for the Icon test), `design/tokens.css`.
- Produces: `cx(...parts: (string | false | null | undefined)[]): string`; `type IconName` and `Icon({ name: IconName, ...SVGProps })` (decorative, `aria-hidden`, 24×24 stroke icons: upload, download, paste, link, edit, trash, copy, lock, help, sun, moon, auto, close, check, plus, info, warning, danger, rotateLeft, rotateRight, flipH, flipV, zoomIn, zoomOut, chevronLeft, chevronRight; `ICON_NAMES` is in `icon-paths.ts`). They live here so A9, A10 and A11 do not depend on each other. Tailwind utilities from the tokens (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `bg-accent`, `font-ui`, `font-display`, `font-hand`, `font-mono`, `text-2xs`…`text-display`, `rounded-md`, `rounded-pill`, `rounded-sketch`, `ease-wobble`, and `elev-xs|sm|md|lg|paper|sticker` for the theme-aware shadows); every token as a CSS variable (`var(--color-ink)`, `var(--space-4)`, …); light/dark via `data-theme` and `prefers-color-scheme`; `prefers-reduced-motion` shortens durations. Note: `--text-2xl`/`--text-3xl` follow the design (36/48 px) and override Tailwind's defaults; `text-4xl` is unchanged (E2E checks 36 px on the h1).

- [ ] **Step 1: Write the failing drift test**

`src/shared/theme/tokens.test.ts` (fails if `design/tokens.css` and the Tailwind copy ever disagree):

```ts
// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const designCss = read('../../../design/tokens.css')
const ourCss = read('./tokens.css')

// `--name: value;` where the value may contain quoted strings with semicolons (data: URLs).
const DECL = /(--[a-z0-9-]+):\s*((?:[^;"]|"[^"]*")+);/g

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, name, value] of block.matchAll(DECL)) {
    if (name && value) out.set(name, value.replace(/\s+/g, ' ').trim())
  }
  return out
}

/** Body of the first block whose selector line starts with `selector`. */
function block(css: string, selector: RegExp): string {
  const match = selector.exec(css)
  if (!match) throw new Error(`selector not found: ${String(selector)}`)
  const start = css.indexOf('{', match.index) + 1
  let depth = 1
  let i = start
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    i++
  }
  return css.slice(start, i - 1)
}

const designLight = declarations(block(designCss, /^:root \{/m))
const designDark = declarations(block(designCss, /^:root\[data-theme="dark"\] \{/m))
const ourLight = new Map([
  ...declarations(block(ourCss, /^@theme static \{/m)),
  ...declarations(block(ourCss, /^:root \{/m)),
])
const ourDark = declarations(block(ourCss, /^:root\[data-theme='dark'\] \{/m))
const ourDarkMedia = declarations(block(ourCss, /^ {2}:root:not\(\[data-theme='light'\]\) \{/m))

describe('design tokens', () => {
  it('carry every light token from design/tokens.css with the same value', () => {
    for (const [name, value] of designLight) {
      if (name.startsWith('--font-')) continue // family names differ on purpose (see next test)
      expect(ourLight.get(name), name).toBe(value)
    }
  })

  it('use the self-hosted variable font families first', () => {
    expect(ourLight.get('--font-ui')).toMatch(/^"Atkinson Hyperlegible Next Variable"/)
    expect(ourLight.get('--font-display')).toMatch(/^"Fraunces Variable"/)
    expect(ourLight.get('--font-hand')).toMatch(/^"Caveat Variable"/)
    expect(ourLight.get('--font-mono')).toBe(designLight.get('--font-mono'))
  })

  it('carry every dark token, both for the manual override and for the OS preference', () => {
    expect(designDark.size).toBeGreaterThan(20)
    for (const [name, value] of designDark) {
      expect(ourDark.get(name), `[data-theme=dark] ${name}`).toBe(value)
      expect(ourDarkMedia.get(name), `prefers-color-scheme ${name}`).toBe(value)
    }
  })

  it('keeps the printed paper white in both themes (R4)', () => {
    expect(ourLight.get('--color-paper')).toBe('#ffffff')
    expect(ourDark.has('--color-paper')).toBe(false)
    expect(ourDarkMedia.has('--color-paper')).toBe(false)
  })

  it('does not disable the OS preference when the user picked light', () => {
    expect(ourCss).toContain(":root:not([data-theme='light'])")
  })
})
```

`src/shared/ui/icon.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { ICON_NAMES } from './icon-paths'

describe('Icon', () => {
  it('renders every named icon as a hidden svg', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
      unmount()
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/shared/theme src/shared/ui/icon`
Expected: FAIL: `ENOENT ... src/shared/theme/tokens.css`, and `./Icon` cannot be resolved.

- [ ] **Step 3: Create the tokens file**

`src/shared/theme/tokens.css` (verbatim values from `design/tokens.css`, regrouped; **do not run Prettier on it**, see Step 6):

```css
/*
 * Design tokens (source of truth: design/tokens.css; tokens.test.ts fails if they drift).
 *
 * - @theme static   -> tokens that become Tailwind utilities (bg-surface, text-ink, font-display,
 *                      rounded-md, text-sm ...). "static" emits every variable even when unused, so
 *                      the plain CSS in ui/css/*.css can use var(--color-...) freely.
 * - :root           -> tokens with no utility (spacing scale, sizes, shadows, motion, textures).
 *                      Tailwind's own spacing scale already equals --space-N (p-4 = 1rem).
 * - dark blocks     -> same names re-pointed. "data-theme" on <html> wins; with no attribute the
 *                      OS preference decides. The printed page (--color-paper) is white in both.
 */

@theme static {
  --color-canvas: #f4ede1;
  --color-surface: #fffcf6;
  --color-surface-raised: #ffffff;
  --color-surface-sunken: #ebe2d3;
  --color-overlay: rgb(43 36 32 / 0.45);
  --color-ink: #2b2420;
  --color-ink-muted: #5e5146;
  --color-ink-subtle: #6f6055;
  --color-ink-inverse: #fffcf6;
  --color-line: #ddd0bc;
  --color-line-strong: #8a7a69;
  --color-accent: #b0432a;
  --color-accent-hover: #933720;
  --color-on-accent: #ffffff;
  --color-accent-soft: #f6dccf;
  --color-on-accent-soft: #6e2615;
  --color-secondary: #2f4c9e;
  --color-secondary-hover: #243c80;
  --color-on-secondary: #ffffff;
  --color-secondary-soft: #dfe5f5;
  --color-on-secondary-soft: #1d2f63;
  --color-ochre: #e2b13c;
  --color-sap: #7a9a6b;
  --color-rose: #e59a8a;
  --color-tape: rgb(226 177 60 / 0.55);
  --color-tape-edge: rgb(180 130 30 / 0.25);
  --color-success: #356128;
  --color-success-soft: #e0ecd6;
  --color-warning: #7d5100;
  --color-warning-soft: #fcebc4;
  --color-danger: #a3261b;
  --color-danger-soft: #f9dad5;
  --color-info: var(--color-secondary);
  --color-info-soft: var(--color-secondary-soft);
  --color-paper: #ffffff;
  --color-paper-edge: rgb(0 0 0 / 0.08);
  --color-guide-safe: #2a7ab8;
  --color-guide-bleed: #d63a78;
  --color-guide-cut: rgb(0 0 0 / 0.35);
  --color-crop-mark: #000000;
  --color-selection: #2f4c9e;
  --color-line-overlay: #e0457b;
  --font-ui: "Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Hiragino Sans", "PingFang SC", "Apple SD Gothic Neo", "Noto Sans CJK JP", sans-serif;
  --font-display: "Fraunces Variable", "Fraunces", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Hiragino Mincho ProN", "Noto Serif CJK JP", serif;
  --font-hand: "Caveat Variable", "Caveat", "Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --text-2xs: 0.6875rem;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-md: 1.125rem;
  --text-lg: 1.375rem;
  --text-xl: 1.75rem;
  --text-2xl: 2.25rem;
  --text-3xl: 3rem;
  --text-display: clamp(2.5rem, 1.6rem + 4vw, 4.5rem);
  --text-hand: 1.375rem;
  --leading-tight: 1.15;
  --leading-snug: 1.3;
  --leading-normal: 1.5;
  --leading-relaxed: 1.65;
  --tracking-tight: -0.01em;
  --tracking-wide: 0.06em;
  --radius-xs: 3px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-pill: 999px;
  --radius-sketch: 255px 18px 225px 18px / 18px 225px 18px 255px;
  --radius-sketch-sm: 14px 5px 12px 6px / 6px 12px 5px 14px;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-wobble: cubic-bezier(0.34, 1.56, 0.64, 1);
}

:root {
  color-scheme: light;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --space-0: 0;
  --space-px: 1px;
  --space-0-5: 0.125rem;
  --space-1: 0.25rem;
  --space-1-5: 0.375rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;
  --size-target: 2.75rem;
  --size-target-dense: 2rem;
  --size-topbar: 3.5rem;
  --size-panel-left: 18rem;
  --size-panel-right: 22rem;
  --border-width: 1px;
  --border-width-strong: 2px;
  --shadow-xs: 0 1px 1px rgb(74 52 32 / 0.08);
  --shadow-sm: 0 1px 2px rgb(74 52 32 / 0.10), 0 1px 1px rgb(74 52 32 / 0.06);
  --shadow-md: 0 4px 10px -2px rgb(74 52 32 / 0.14), 0 2px 4px rgb(74 52 32 / 0.06);
  --shadow-lg: 0 18px 40px -12px rgb(74 52 32 / 0.30), 0 4px 10px rgb(74 52 32 / 0.08);
  --shadow-paper: 0 0 0 1px var(--color-paper-edge), 0 1px 1px rgb(74 52 32 / 0.10), 0 10px 24px -8px rgb(74 52 32 / 0.28);
  --shadow-sticker: 2px 3px 0 rgb(74 52 32 / 0.18);
  --focus-ring-color: #2f4c9e;
  --focus-ring-width: 3px;
  --focus-ring-offset: 2px;
  --focus-ring: 0 0 0 var(--focus-ring-offset) var(--color-surface), 0 0 0 calc(var(--focus-ring-offset) + var(--focus-ring-width)) var(--focus-ring-color);
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --z-panel: 10;
  --z-topbar: 20;
  --z-popover: 40;
  --z-toast: 60;
  --z-dialog: 80;
  --texture-grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .35 0 0 0 0 .25 0 0 0 0 .15 0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  --texture-grain-opacity: 0.22;
  --texture-desk: radial-gradient(circle at 1px 1px, rgb(94 81 70 / 0.16) 1px, transparent 1.5px);
  --texture-desk-size: 22px 22px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --color-canvas: #1c1714;
    --color-surface: #26201b;
    --color-surface-raised: #2f2822;
    --color-surface-sunken: #15110e;
    --color-overlay: rgb(8 6 4 / 0.65);
    --color-ink: #f2e9dc;
    --color-ink-muted: #c4b5a3;
    --color-ink-subtle: #a29382;
    --color-ink-inverse: #1c1714;
    --color-line: #3d342c;
    --color-line-strong: #85766a;
    --color-accent: #ee8a63;
    --color-accent-hover: #f4a385;
    --color-on-accent: #1c1714;
    --color-accent-soft: #4a2a1e;
    --color-on-accent-soft: #ffd3c0;
    --color-secondary: #9db2ee;
    --color-secondary-hover: #b9c8f3;
    --color-on-secondary: #1c1714;
    --color-secondary-soft: #263255;
    --color-on-secondary-soft: #d6defa;
    --color-tape: rgb(226 177 60 / 0.38);
    --color-tape-edge: rgb(255 220 140 / 0.18);
    --color-success: #9ccb86;
    --color-success-soft: #23331c;
    --color-warning: #f0c468;
    --color-warning-soft: #3d2f12;
    --color-danger: #ff9a8c;
    --color-danger-soft: #4a1f1a;
    --color-selection: #9db2ee;
    --focus-ring-color: #9db2ee;
    --shadow-xs: 0 1px 1px rgb(0 0 0 / 0.35);
    --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.45);
    --shadow-md: 0 4px 12px -2px rgb(0 0 0 / 0.55);
    --shadow-lg: 0 18px 40px -12px rgb(0 0 0 / 0.7);
    --shadow-paper: 0 0 0 1px rgb(0 0 0 / 0.4), 0 12px 28px -8px rgb(0 0 0 / 0.75);
    --shadow-sticker: 2px 3px 0 rgb(0 0 0 / 0.45);
    --texture-grain-opacity: 0.12;
    --texture-desk: radial-gradient(circle at 1px 1px, rgb(242 233 220 / 0.07) 1px, transparent 1.5px);
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --color-canvas: #1c1714;
  --color-surface: #26201b;
  --color-surface-raised: #2f2822;
  --color-surface-sunken: #15110e;
  --color-overlay: rgb(8 6 4 / 0.65);
  --color-ink: #f2e9dc;
  --color-ink-muted: #c4b5a3;
  --color-ink-subtle: #a29382;
  --color-ink-inverse: #1c1714;
  --color-line: #3d342c;
  --color-line-strong: #85766a;
  --color-accent: #ee8a63;
  --color-accent-hover: #f4a385;
  --color-on-accent: #1c1714;
  --color-accent-soft: #4a2a1e;
  --color-on-accent-soft: #ffd3c0;
  --color-secondary: #9db2ee;
  --color-secondary-hover: #b9c8f3;
  --color-on-secondary: #1c1714;
  --color-secondary-soft: #263255;
  --color-on-secondary-soft: #d6defa;
  --color-tape: rgb(226 177 60 / 0.38);
  --color-tape-edge: rgb(255 220 140 / 0.18);
  --color-success: #9ccb86;
  --color-success-soft: #23331c;
  --color-warning: #f0c468;
  --color-warning-soft: #3d2f12;
  --color-danger: #ff9a8c;
  --color-danger-soft: #4a1f1a;
  --color-selection: #9db2ee;
  --focus-ring-color: #9db2ee;
  --shadow-xs: 0 1px 1px rgb(0 0 0 / 0.35);
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.45);
  --shadow-md: 0 4px 12px -2px rgb(0 0 0 / 0.55);
  --shadow-lg: 0 18px 40px -12px rgb(0 0 0 / 0.7);
  --shadow-paper: 0 0 0 1px rgb(0 0 0 / 0.4), 0 12px 28px -8px rgb(0 0 0 / 0.75);
  --shadow-sticker: 2px 3px 0 rgb(0 0 0 / 0.45);
  --texture-grain-opacity: 0.12;
  --texture-desk: radial-gradient(circle at 1px 1px, rgb(242 233 220 / 0.07) 1px, transparent 1.5px);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-base: 0ms;
    --duration-slow: 0ms;
  }
}

/* Shadows change with the theme, so they are plain variables; these utilities read them. */
@utility elev-xs {
  box-shadow: var(--shadow-xs);
}
@utility elev-sm {
  box-shadow: var(--shadow-sm);
}
@utility elev-md {
  box-shadow: var(--shadow-md);
}
@utility elev-lg {
  box-shadow: var(--shadow-lg);
}
@utility elev-paper {
  box-shadow: var(--shadow-paper);
}
@utility elev-sticker {
  box-shadow: var(--shadow-sticker);
}
```

- [ ] **Step 4: `cx`, icons, base styles and placeholder component CSS**

`src/shared/ui/cx.ts`:

```ts
type ClassValue = string | false | null | undefined

/** Join class names, skipping falsy values. */
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ')
}
```

`src/shared/ui/icon-paths.ts`:

```ts
export const PATHS = {
  upload: ['M12 15V4M7 9l5-5 5 5', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  download: ['M12 4v11M7 10l5 5 5-5', 'M4 20h16'],
  paste: ['M5 4h14v17H5z', 'M9 3h6v3H9z', 'M9 11h6M9 15h4'],
  link: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  edit: ['M4 20l4-1 11-11-3-3L5 16z', 'M14 6l3 3'],
  trash: ['M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13'],
  copy: ['M8 8h12v12H8z', 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3'],
  lock: ['M5 10h14v10H5z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  help: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17v.3',
  ],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  ],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  auto: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 4a8 8 0 0 1 0 16z'],
  close: ['M6 6l12 12M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  plus: ['M12 5v14M5 12h14'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5M12 8v.3'],
  warning: ['M12 3l10 18H2z', 'M12 10v5M12 18v.3'],
  danger: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9 9l6 6M15 9l-6 6'],
  rotateLeft: ['M4 12a8 8 0 1 0 3-6.2', 'M4 4v5h5'],
  rotateRight: ['M20 12a8 8 0 1 1-3-6.2', 'M20 4v5h-5'],
  flipH: ['M12 3v18', 'M8 7L3 17h5z', 'M16 7l5 10h-5z'],
  flipV: ['M3 12h18', 'M7 8h10l-5-5z', 'M7 16h10l-5 5z'],
  zoomIn: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4M11 8v6M8 11h6'],
  zoomOut: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4M8 11h6'],
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof PATHS
export const ICON_NAMES = Object.keys(PATHS) as IconName[]
```

`src/shared/ui/Icon.tsx`:

```tsx
import type { SVGProps } from 'react'
import { PATHS, type IconName } from './icon-paths'

export type { IconName }

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: IconName
}

/** Decorative inline SVG (24×24, 1.8 stroke, `currentColor`). Label the control that contains it, not the icon. */
export function Icon({ name, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width="1.1em"
      height="1.1em"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
```


`src/shared/theme/base.css`:

```css
/* Page-level defaults from design/mockup.css: warm canvas, ink text, paper grain, focus ring. */
@layer base {
  html {
    -webkit-text-size-adjust: 100%;
    background-color: var(--color-canvas);
  }

  body {
    margin: 0;
    min-height: 100vh;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    color: var(--color-ink);
    background-color: var(--color-canvas);
    -webkit-font-smoothing: antialiased;
  }

  /* Paper grain over the whole canvas. */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image: var(--texture-grain);
    opacity: var(--texture-grain-opacity);
    mix-blend-mode: multiply;
    z-index: 0;
  }

  :root[data-theme='dark'] body::before {
    mix-blend-mode: screen;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) body::before {
      mix-blend-mode: screen;
    }
  }

  /* Keep real content above the grain. Overlays set their own position and z-index (components layer wins). */
  body > * {
    position: relative;
    z-index: 1;
  }

  h1,
  h2 {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-tight);
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    color: inherit;
  }

  :focus {
    outline: none;
  }

  :focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
    border-radius: var(--radius-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }
  }
}
```

Create the three component stylesheets with only this content each (the tasks A9, A10, A11 replace them; keeping the files separate is what lets those tasks run in parallel):

`src/shared/ui/css/basics.css`:

```css
/* Component styles for A9 (buttons, badges, chips, callouts, progress, sketch card). */
```

`src/shared/ui/css/forms.css`:

```css
/* Component styles for A10 (fields, switch, segmented control, slider). */
```

`src/shared/ui/css/overlays.css`:

```css
/* Component styles for A11 (dialog, bottom sheet, tabs, tooltip). */
```

- [ ] **Step 5: Wire everything into `src/shared/styles.css`**

Replace the file with (the two `@source not` lines already existed and must stay):

```css
@import 'tailwindcss';
@import '@fontsource-variable/fraunces';
@import '@fontsource-variable/atkinson-hyperlegible-next';
@import '@fontsource-variable/caveat';
@import './theme/tokens.css';
@import './theme/base.css';
@import './ui/css/basics.css';
@import './ui/css/forms.css';
@import './ui/css/overlays.css';
@source not '../../design';
@source not '../../docs';
```

`.prettierignore`: append

```
# Verbatim copy of design/tokens.css (a test checks it); Prettier would change quote styles
src/shared/theme/tokens.css
```

`app/index.html`: change the `<body ...>` line to a plain `<body>` (the stone Tailwind classes would override the new canvas/ink colours and ignore `data-theme`). Leave `index.html` (the landing page) alone; E restyles it.

- [ ] **Step 6: Verify**

```bash
pnpm vitest run src/shared/theme src/shared/ui/icon   # 6 tests pass
pnpm lint && pnpm format:check && pnpm typecheck
pnpm build
ls dist/assets/*.woff2 | wc -l                   # > 0: fonts are bundled and self-hosted
grep -l -- '--color-canvas' dist/assets/*.css     # tokens are in the CSS bundle
grep -c 'elev-sm' dist/assets/*.css               # utilities exist
E2E_PORT=4102 pnpm e2e --project=chromium         # smoke + axe (light and dark) still pass
```

Expected: all pass. If axe reports a contrast violation, fix the token usage in `App.tsx` or `base.css`, never loosen the test. Manual check: `pnpm dev`, open `/artistica/app/`: warm canvas with faint paper grain, Fraunces heading, Atkinson body text; toggle your OS dark mode and confirm the "studio at night" palette.

- [ ] **Step 7: Commit and open the PR**

```bash
git add src/shared/styles.css src/shared/theme src/shared/ui .prettierignore app/index.html
git commit -m "feat(design): add theme tokens, self-hosted fonts, base styles and icons"
```

---

### Task A8: Theme application from settings

**Branch:** `feat/m1-theme` · **PR title:** `feat(theme): apply the theme from settings with useApplyTheme`

**Files:**
- Create: `src/shared/theme/apply-theme.ts`, `src/shared/theme/index.ts`
- Modify: `src/app/App.tsx`
- Test: `src/shared/theme/apply-theme.test.tsx`

**Interfaces:**
- Consumes: A5 (`useSettings`, `Theme`), A7 (`[data-theme]` CSS), A2 (`dom` project), A6 (`App.tsx`).
- Produces (CR-E5): `applyTheme(theme: Theme, root?: HTMLElement): void` (sets `data-theme="light|dark"`; removes the attribute for `auto`), `nextTheme(theme: Theme): Theme` (auto → light → dark → auto, for E's toggle), and `useApplyTheme(): void` (call once in the app root; E uses it instead of writing its own).

- [ ] **Step 1: Write the failing test**

`src/shared/theme/apply-theme.test.tsx` (named `.tsx` so the `dom` project runs it):

```tsx
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSettings } from '../../features/settings'
import { applyTheme, nextTheme, useApplyTheme } from './apply-theme'

afterEach(() => {
  act(() => {
    useSettings.getState().reset()
  })
  document.documentElement.removeAttribute('data-theme')
})

describe('applyTheme', () => {
  it('sets data-theme for light and dark and removes it for auto', () => {
    const root = document.createElement('html')
    applyTheme('dark', root)
    expect(root).toHaveAttribute('data-theme', 'dark')
    applyTheme('light', root)
    expect(root).toHaveAttribute('data-theme', 'light')
    applyTheme('auto', root)
    expect(root).not.toHaveAttribute('data-theme')
  })
})

describe('nextTheme', () => {
  it('cycles auto → light → dark → auto', () => {
    expect(nextTheme('auto')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('auto')
  })
})

describe('useApplyTheme', () => {
  it('applies the stored theme and follows changes on <html>', () => {
    const html = document.documentElement
    act(() => {
      useSettings.getState().setTheme('dark')
    })
    renderHook(() => {
      useApplyTheme()
    })
    expect(html).toHaveAttribute('data-theme', 'dark')
    act(() => {
      useSettings.getState().setTheme('light')
    })
    expect(html).toHaveAttribute('data-theme', 'light')
    act(() => {
      useSettings.getState().setTheme('auto')
    })
    expect(html).not.toHaveAttribute('data-theme')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project dom src/shared/theme`
Expected: FAIL: `./apply-theme` cannot be resolved.

- [ ] **Step 3: Implement**

`src/shared/theme/apply-theme.ts`:

```ts
import { useEffect } from 'react'
import { useSettings, type Theme } from '../../features/settings'

/**
 * Reflect the theme on `<html data-theme>`. "auto" removes the attribute so the
 * `prefers-color-scheme` media query in tokens.css decides.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/** The theme a toggle button switches to next: auto → light → dark → auto. */
export function nextTheme(theme: Theme): Theme {
  if (theme === 'auto') return 'light'
  if (theme === 'light') return 'dark'
  return 'auto'
}

/**
 * Keep `<html data-theme>` in step with the stored theme. Call once, in the app root.
 * (An inline script in the HTML, owned by E, sets the attribute before first paint; this hook
 * takes over from there and handles changes.)
 */
export function useApplyTheme(): void {
  const theme = useSettings((state) => state.theme)
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
}
```

`src/shared/theme/index.ts`:

```ts
export { applyTheme, nextTheme, useApplyTheme } from './apply-theme'
```

In `src/app/App.tsx` add `import { useApplyTheme } from '../shared/theme'` and call `useApplyTheme()` as the first line of `App()`.

- [ ] **Step 4: Verify**

```bash
pnpm vitest run --project dom && pnpm lint && pnpm typecheck && pnpm format:check
```

Manual: in the browser console on `/artistica/app/`, run `localStorage.setItem('artistica:settings', JSON.stringify({ state: { theme: 'dark' }, version: 1 }))`, reload, and confirm `<html data-theme="dark">` and the dark palette even if your OS is in light mode.

- [ ] **Step 5: Commit and open the PR**

```bash
git add src/shared/theme src/app/App.tsx
git commit -m "feat(theme): apply the theme from settings with useApplyTheme"
```

---

### Task A9: UI primitives, part 1 (buttons, badges, callouts, progress, cards, icons)

**Branch:** `feat/m1-ui-basics` · **PR title:** `feat(ui): add button, badge, callout, progress and sketch card primitives`

**Files:**
- Create: `src/shared/ui/{VisuallyHidden.tsx,button-classes.ts,Button.tsx,IconButton.tsx,Badge.tsx,Chip.tsx,Callout.tsx,ProgressBar.tsx,SketchCard.tsx}`
- Modify: `src/shared/ui/css/basics.css` (replace the placeholder)
- Test: `src/shared/ui/basics.test.tsx`

**Interfaces:**
- Consumes: A7 (CSS variables, `cx`, `Icon`, `ds-*` styles imported by `styles.css`), A2 (`dom` project).
- Produces (import by file path; the barrel comes in A12). No component hard-codes a visible string.
  - `buttonClasses(variant: ButtonVariant, size: ButtonSize, extra?: { block?: boolean; iconOnly?: boolean }): string` in `button-classes.ts` (CCR-D7, ruled). `Button` and `IconButton` build their classes only through it, so a link styled with it (`<a download className={buttonClasses('primary', 'lg', { block: true })}>`) cannot drift. A12 exports it from the barrel.
  - `Button({ variant?: 'neutral' | 'primary' | 'secondary' | 'ghost' | 'danger' (default 'neutral'), size?: 'md' | 'lg', block?, icon?: IconName, ...button props })`; `type` defaults to `"button"`.
  - `IconButton({ label: string /* aria-label, required */, icon: IconName, variant? (default 'ghost'), size?, ...button props })`.
  - `Badge({ tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger', icon?: IconName, ...span props })`. The low-DPI chip is `<Badge tone="warning" icon="warning">{text}</Badge>`.
  - `Chip({ checked: boolean, onCheckedChange(checked: boolean), ...button props })`: a toggle with `aria-pressed`.
  - `Callout({ tone?: 'info' | 'warning' | 'danger' | 'success' | 'quiet', title?: string, actions?: ReactNode, live?: boolean, children })`. `live` makes it a live region (`alert` for danger, `status` otherwise); off by default so static notes are not announced.
  - `ProgressBar({ value: number | null /* 0..1, null = indeterminate */, label: string, valueText?: string })`.
  - `SketchCard({ tape?: boolean, ...div props })`, `VisuallyHidden(span props)`.

- [ ] **Step 1: Write the failing tests**

`src/shared/ui/basics.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Badge } from './Badge'
import { Button } from './Button'
import { buttonClasses } from './button-classes'
import { Callout } from './Callout'
import { Chip } from './Chip'
import { IconButton } from './IconButton'
import { ProgressBar } from './ProgressBar'
import { SketchCard } from './SketchCard'
import { VisuallyHidden } from './VisuallyHidden'

describe('buttonClasses', () => {
  it('builds the class string for each variant, size and option', () => {
    expect(buttonClasses('neutral', 'md')).toBe('ds-btn')
    expect(buttonClasses('primary', 'lg', { block: true })).toBe(
      'ds-btn ds-btn--primary ds-btn--lg ds-btn--block',
    )
    expect(buttonClasses('ghost', 'md', { iconOnly: true })).toBe(
      'ds-btn ds-btn--ghost ds-btn--icon',
    )
  })

  it('is what Button renders, so link-buttons cannot drift', () => {
    render(
      <>
        <Button variant="danger" size="lg" block>
          Delete
        </Button>
        <a href="/x" download className={buttonClasses('danger', 'lg', { block: true })}>
          Link
        </a>
      </>,
    )
    expect(screen.getByRole('button').className).toBe(screen.getByRole('link').className)
  })
})

describe('Button', () => {
  it('defaults to type=button and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('maps variant, size and block to classes', () => {
    render(
      <Button variant="primary" size="lg" block>
        Go
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveClass(
      'ds-btn',
      'ds-btn--primary',
      'ds-btn--lg',
      'ds-btn--block',
    )
  })

  it('does not fire when disabled and can show a decorative icon', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled icon="download" onClick={onClick}>
        Export
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(onClick).not.toHaveBeenCalled()
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('IconButton', () => {
  it('is named by its label prop', () => {
    render(<IconButton label="Remove photo" icon="trash" />)
    expect(screen.getByRole('button', { name: 'Remove photo' })).toHaveClass('ds-btn--icon')
  })
})

describe('Badge', () => {
  it('shows text and tone, with an optional icon', () => {
    render(
      <Badge tone="warning" icon="warning">
        Low DPI
      </Badge>,
    )
    const badge = screen.getByText('Low DPI')
    expect(badge).toHaveClass('ds-badge', 'ds-badge--warning')
    expect(badge.querySelector('svg')).not.toBeNull()
  })
})

describe('Chip', () => {
  it('toggles and reports aria-pressed', async () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(
      <Chip checked={false} onCheckedChange={onCheckedChange}>
        Blur
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'Blur' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    rerender(
      <Chip checked onCheckedChange={onCheckedChange}>
        Blur
      </Chip>,
    )
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Callout', () => {
  it('is silent by default and a live region on request', () => {
    const { rerender } = render(<Callout title="Heads up">Gutter raised.</Callout>)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    rerender(
      <Callout tone="danger" live>
        Broken
      </Callout>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Broken')
    rerender(
      <Callout tone="warning" live>
        Careful
      </Callout>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Careful')
  })

  it('renders actions', () => {
    render(<Callout actions={<button type="button">Undo</button>}>Done</Callout>)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('exposes a named progressbar with a clamped percentage', () => {
    render(<ProgressBar value={1.7} label="Exporting" valueText="Page 2 of 2" />)
    const bar = screen.getByRole('progressbar', { name: 'Exporting' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar).toHaveAttribute('aria-valuetext', 'Page 2 of 2')
  })

  it('has no aria-valuenow while indeterminate', () => {
    render(<ProgressBar value={null} label="Loading" />)
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  })
})

describe('SketchCard / VisuallyHidden', () => {
  it('renders children, and tape is hidden from assistive tech', () => {
    const { container } = render(<SketchCard tape>Hello</SketchCard>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(container.querySelector('.ds-tape')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps text for screen readers', () => {
    render(<VisuallyHidden>Only for readers</VisuallyHidden>)
    expect(screen.getByText('Only for readers')).toHaveClass('sr-only')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project dom src/shared/ui/basics`
Expected: FAIL: the component modules cannot be resolved.

- [ ] **Step 3: Implement the helpers**

`src/shared/ui/VisuallyHidden.tsx`:

```tsx
import type { HTMLAttributes } from 'react'
import { cx } from './cx'

/** Text for screen readers only. */
export function VisuallyHidden({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx('sr-only', className)} {...rest} />
}
```

- [ ] **Step 4: Implement the components**

`src/shared/ui/button-classes.ts`:

```ts
import { cx } from './cx'

export type ButtonVariant = 'neutral' | 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

/** Class names shared by Button and IconButton (the CSS lives in ui/css/basics.css). */
export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  extra?: { block?: boolean; iconOnly?: boolean },
): string {
  return cx(
    'ds-btn',
    variant !== 'neutral' && `ds-btn--${variant}`,
    size === 'lg' && 'ds-btn--lg',
    extra?.block && 'ds-btn--block',
    extra?.iconOnly && 'ds-btn--icon',
  )
}
```

`src/shared/ui/Button.tsx`:

```tsx
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type { ButtonSize, ButtonVariant }

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** neutral = the plain mockup `.btn`; primary = terracotta; secondary = ultramarine. */
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the full width of the container. */
  block?: boolean
  /** Decorative icon shown before the label. */
  icon?: IconName
  children?: ReactNode
}

/** `type` defaults to "button" so a Button inside a form never submits by accident. */
export function Button({
  variant = 'neutral',
  size = 'md',
  block = false,
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClasses(variant, size, { block }), className)}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  )
}
```

`src/shared/ui/IconButton.tsx`:

```tsx
import type { ComponentPropsWithRef } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'aria-label'
> {
  /** The accessible name. Required: an icon alone says nothing to a screen reader. */
  label: string
  icon: IconName
  variant?: ButtonVariant
  size?: ButtonSize
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(buttonClasses(variant, size, { iconOnly: true }), className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}
```

`src/shared/ui/Badge.tsx`:

```tsx
import type { HTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Decorative icon. Colour is never the only signal: warnings should always pass an icon. */
  icon?: IconName
}

/** Small status pill. A low-DPI chip is `<Badge tone="warning" icon="warning">…</Badge>`. */
export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('ds-badge', tone !== 'neutral' && `ds-badge--${tone}`, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  )
}
```

`src/shared/ui/Chip.tsx`:

```tsx
import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'

export interface ChipProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'onChange' | 'aria-pressed'
> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/** A toggle chip (the mockup's checkbox chip): a button with `aria-pressed`. */
export function Chip({
  checked,
  onCheckedChange,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={checked}
      className={cx('ds-chip', className)}
      onClick={() => {
        onCheckedChange(!checked)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
```

`src/shared/ui/Callout.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type CalloutTone = 'info' | 'warning' | 'danger' | 'success' | 'quiet'

const ICONS: Record<CalloutTone, IconName> = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  success: 'check',
  quiet: 'info',
}

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CalloutTone
  title?: string
  /** Buttons or links shown under the text. */
  actions?: ReactNode
  /**
   * Announce the callout to screen readers when it appears (danger → alert, others → status).
   * Leave off for notes that are simply part of the page.
   */
  live?: boolean
}

export function Callout({
  tone = 'info',
  title,
  actions,
  live = false,
  className,
  children,
  ...rest
}: CalloutProps) {
  const role = live ? (tone === 'danger' ? 'alert' : 'status') : undefined
  return (
    <div
      role={role}
      className={cx('ds-note', tone !== 'info' && `ds-note--${tone}`, className)}
      {...rest}
    >
      <Icon name={ICONS[tone]} />
      <div className="ds-note__body">
        {title ? <strong>{title}</strong> : null}
        {children}
        {actions ? <div className="ds-note__actions">{actions}</div> : null}
      </div>
    </div>
  )
}
```

`src/shared/ui/ProgressBar.tsx`:

```tsx
export interface ProgressBarProps {
  /** 0..1, or null while the amount is unknown. */
  value: number | null
  /** Accessible name, e.g. "Exporting PDF". */
  label: string
  /** Optional spoken value, e.g. "Page 2 of 5". */
  valueText?: string
  className?: string
}

export function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const percent = value === null ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className={className ? `ds-progress ${className}` : 'ds-progress'}
    >
      <div
        className={
          value === null
            ? 'ds-progress__fill ds-progress__fill--indeterminate'
            : 'ds-progress__fill'
        }
        style={value === null ? undefined : { width: `${String(percent)}%` }}
      />
    </div>
  )
}
```

`src/shared/ui/SketchCard.tsx`:

```tsx
import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export interface SketchCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Add a strip of washi tape on the top edge. Purely decorative. */
  tape?: boolean
}

/** The hand-drawn card from the mockups: wobbly border, sticker shadow. */
export function SketchCard({ tape = false, className, children, ...rest }: SketchCardProps) {
  return (
    <div className={cx('ds-card', 'ds-card--sketch', className)} {...rest}>
      {tape ? <span className="ds-tape" aria-hidden="true" /> : null}
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Component styles (match `design/mockup.css`)**

Replace `src/shared/ui/css/basics.css` with:

```css
/* Buttons, badges, chips, callouts, progress, sketch card. Adapted from design/mockup.css (.btn → .ds-btn). */
@layer components {
  .ds-btn {
    --btn-bg: var(--color-surface);
    --btn-ink: var(--color-ink);
    --btn-border: var(--color-line-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--size-target-dense);
    padding: var(--space-1-5) var(--space-3);
    border: var(--border-width) solid var(--btn-border);
    border-radius: var(--radius-md);
    background: var(--btn-bg);
    color: var(--btn-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    line-height: 1.2;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
    transition:
      transform var(--duration-fast) var(--ease-out),
      background var(--duration-fast);
  }
  .ds-btn:hover {
    background: var(--color-surface-sunken);
    color: var(--btn-ink);
  }
  .ds-btn:active {
    transform: translateY(1px);
  }
  .ds-btn svg {
    width: 1.1em;
    height: 1.1em;
    flex: none;
  }
  .ds-btn--primary {
    --btn-bg: var(--color-accent);
    --btn-ink: var(--color-on-accent);
    --btn-border: var(--color-accent);
    box-shadow: var(--shadow-sticker);
  }
  .ds-btn--primary:hover {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
  .ds-btn--secondary {
    --btn-bg: var(--color-secondary);
    --btn-ink: var(--color-on-secondary);
    --btn-border: var(--color-secondary);
  }
  .ds-btn--secondary:hover {
    background: var(--color-secondary-hover);
  }
  .ds-btn--ghost {
    --btn-bg: transparent;
    --btn-border: transparent;
  }
  .ds-btn--ghost:hover {
    background: var(--color-surface-sunken);
  }
  .ds-btn--danger {
    --btn-ink: var(--color-danger);
  }
  .ds-btn--lg {
    min-height: var(--size-target);
    padding: 0.625rem var(--space-5);
    font-size: var(--text-base);
    border-radius: var(--radius-lg);
  }
  .ds-btn--block {
    width: 100%;
  }
  .ds-btn--icon {
    padding: 0;
    width: var(--size-target-dense);
    min-width: var(--size-target-dense);
  }
  .ds-btn--icon.ds-btn--lg {
    width: var(--size-target);
  }
  .ds-btn[disabled],
  .ds-btn[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.5;
    box-shadow: none;
    transform: none;
  }

  .ds-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px var(--space-1-5);
    border-radius: var(--radius-pill);
    font-size: var(--text-2xs);
    font-weight: var(--weight-bold);
    line-height: 1.5;
    background: var(--color-surface-sunken);
    color: var(--color-ink-muted);
    white-space: nowrap;
  }
  .ds-badge svg {
    width: 11px;
    height: 11px;
  }
  .ds-badge--warning {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }
  .ds-badge--danger {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }
  .ds-badge--accent {
    background: var(--color-accent-soft);
    color: var(--color-on-accent-soft);
  }
  .ds-badge--info {
    background: var(--color-secondary-soft);
    color: var(--color-on-secondary-soft);
  }
  .ds-badge--success {
    background: var(--color-success-soft);
    color: var(--color-success);
  }

  .ds-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1-5);
    min-height: var(--size-target-dense);
    padding: var(--space-1) var(--space-3);
    border: var(--border-width) solid var(--color-line-strong);
    border-radius: var(--radius-sketch-sm);
    background: var(--color-surface-raised);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }
  .ds-chip[aria-pressed='true'] {
    background: var(--color-accent-soft);
    color: var(--color-on-accent-soft);
    border-color: var(--color-accent);
  }

  .ds-note {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    background: var(--color-info-soft);
    color: var(--color-on-secondary-soft);
    border-left: 4px solid var(--color-secondary);
  }
  .ds-note > svg {
    width: 18px;
    height: 18px;
    flex: none;
    margin-top: 2px;
  }
  .ds-note strong {
    display: block;
  }
  .ds-note--warning {
    background: var(--color-warning-soft);
    color: var(--color-ink);
    border-left-color: var(--color-warning);
  }
  .ds-note--warning > svg {
    color: var(--color-warning);
  }
  .ds-note--danger {
    background: var(--color-danger-soft);
    color: var(--color-ink);
    border-left-color: var(--color-danger);
  }
  .ds-note--danger > svg {
    color: var(--color-danger);
  }
  .ds-note--success {
    background: var(--color-success-soft);
    color: var(--color-ink);
    border-left-color: var(--color-success);
  }
  .ds-note--success > svg {
    color: var(--color-success);
  }
  .ds-note--quiet {
    background: var(--color-surface-sunken);
    color: var(--color-ink-muted);
    border-left-color: var(--color-line-strong);
  }
  .ds-note__actions {
    margin-top: var(--space-2);
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .ds-progress {
    height: 14px;
    border-radius: 999px;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-line-strong);
    overflow: hidden;
    position: relative;
  }
  .ds-progress__fill {
    height: 100%;
    background: repeating-linear-gradient(
      -45deg,
      var(--color-accent) 0 10px,
      color-mix(in srgb, var(--color-accent) 80%, white) 10px 20px
    );
    background-size: 28px 28px;
    animation: ds-stripes 1s linear infinite;
    transition: width var(--duration-slow) var(--ease-out);
    border-radius: 999px;
  }
  .ds-progress__fill--indeterminate {
    width: 40%;
    animation:
      ds-stripes 1s linear infinite,
      ds-slide 1.6s ease-in-out infinite alternate;
  }
  @keyframes ds-stripes {
    to {
      background-position: 28px 0;
    }
  }
  @keyframes ds-slide {
    from {
      margin-left: 0;
    }
    to {
      margin-left: 60%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ds-progress__fill,
    .ds-progress__fill--indeterminate {
      animation: none;
    }
  }

  .ds-card {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: var(--space-5);
    position: relative;
  }
  .ds-card--sketch {
    border-radius: var(--radius-sketch);
    border: 2px solid var(--color-ink);
    box-shadow: var(--shadow-sticker);
  }
  .ds-tape {
    position: absolute;
    top: -11px;
    left: 50%;
    width: 84px;
    height: 24px;
    transform: translateX(-50%) rotate(-2deg);
    background: var(--color-tape);
    box-shadow: inset 0 0 0 1px var(--color-tape-edge);
    clip-path: polygon(
      3% 0,
      97% 4%,
      100% 25%,
      96% 50%,
      100% 78%,
      97% 100%,
      2% 96%,
      0 70%,
      4% 46%,
      0 20%
    );
    pointer-events: none;
  }
}
```

- [ ] **Step 6: Verify**

```bash
pnpm vitest run --project dom src/shared/ui/basics && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
```

Expected: 14 tests pass. Visual check (do not commit the scratch file): temporarily render one of each component in `App.tsx`, run `pnpm dev`, and compare side by side with `design/index.html` / `design/workspace.html` (buttons, terracotta primary with sticker shadow, badges, notes with left border, striped progress bar, wobbly sketch card) in light and dark. Revert `App.tsx`.

- [ ] **Step 7: Commit and open the PR**

```bash
git add src/shared/ui
git commit -m "feat(ui): add button, badge, callout, progress and sketch card primitives"
```

---

### Task A10: UI primitives, part 2 (form controls)

**Branch:** `feat/m1-ui-forms` · **PR title:** `feat(ui): add switch, segmented control, slider, select and number field`

**Files:**
- Create: `src/shared/ui/{Switch.tsx,SegmentedControl.tsx,Slider.tsx,Select.tsx,parse-decimal.ts,NumberField.tsx}`
- Modify: `src/shared/ui/css/forms.css` (replace the placeholder)
- Test: `src/shared/ui/forms.test.tsx`

**Interfaces:**
- Consumes: A3 (`mmToUnit`, `unitToMm`, `roundForUnit`, `Mm`, `Unit`), A7 (CSS, `cx`), A2 `dom` project. Independent of A9 and A11.
- Produces:
  - `Switch({ label, checked, onCheckedChange(checked), hint?, disabled?, className? })`: Radix Switch, `role="switch"`, label and hint wired with `htmlFor`/`aria-describedby`.
  - `SegmentedControl<T extends string>({ label /* group aria-label */, value: T, onValueChange(value: T), options: { value: T; label: ReactNode; disabled? }[], block?, className? })`: Radix RadioGroup (arrow keys).
  - `Slider({ label, value, min, max, step?, onValueChange(value: number), formatValue?(n): string, minLabel?, maxLabel?, disabled?, className? })`: a native range input (touch and keyboard for free) with a live `<output>` and `aria-valuetext`.
  - `Select({ label, value, onValueChange(value: string), options: { value; label; disabled? }[], hint?, disabled?, className? })`: native `<select>` (the OS picker on phones).
  - `NumberField({ label, valueMm: Mm, unit: Unit, unitLabel: string, onChangeMm(mm: Mm), minMm?, maxMm?, stepMm? (default 1; Shift = 10×), hint?, disabled?, className? })`: shows `valueMm` converted and rounded for `unit`, **always emits millimetres**, accepts `5.5` and `5,5`, commits on Enter/blur, reverts invalid text, clamps to min/max, does not emit when the displayed number would not change (prevents unit-toggle drift). `role="spinbutton"`.
  - `parseDecimal(text: string): number | null`.

- [ ] **Step 1: Write the failing tests**

`src/shared/ui/forms.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'
import { parseDecimal } from './parse-decimal'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { Slider } from './Slider'
import { Switch } from './Switch'
import fc from 'fast-check'

describe('Switch', () => {
  it('is a labelled switch that toggles', async () => {
    const onCheckedChange = vi.fn()
    render(
      <Switch
        label="Crop marks"
        checked={false}
        onCheckedChange={onCheckedChange}
        hint="Printed outside the bleed"
      />,
    )
    const sw = screen.getByRole('switch', { name: 'Crop marks' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveAccessibleDescription('Printed outside the bleed')
    await userEvent.click(sw)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('toggles with the keyboard and respects disabled', async () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(<Switch label="Bleed" checked onCheckedChange={onCheckedChange} />)
    screen.getByRole('switch').focus()
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledWith(false)
    onCheckedChange.mockClear()
    rerender(<Switch label="Bleed" checked onCheckedChange={onCheckedChange} disabled />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})

describe('SegmentedControl', () => {
  const options = [
    { value: 'auto', label: 'Auto' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'landscape', label: 'Landscape' },
  ] as const

  it('is a named radio group with the current value checked', () => {
    render(
      <SegmentedControl
        label="Orientation"
        value="portrait"
        onValueChange={() => undefined}
        options={options}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Orientation' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Portrait' })).toBeChecked()
  })

  it('emits the clicked value and supports arrow keys', async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl
        label="Orientation"
        value="auto"
        onValueChange={onValueChange}
        options={options}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Landscape' }))
    expect(onValueChange).toHaveBeenLastCalledWith('landscape')
    screen.getByRole('radio', { name: 'Auto' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    // Roving focus: the arrow key moves focus to the next option (Radix then selects it).
    expect(screen.getByRole('radio', { name: 'Portrait' })).toHaveFocus()
  })
})

describe('Slider', () => {
  it('is a labelled range with a live output and emits numbers', () => {
    const onValueChange = vi.fn()
    render(
      <Slider
        label="Blur"
        value={4}
        min={0}
        max={10}
        onValueChange={onValueChange}
        formatValue={(n) => `${String(n)} px`}
      />,
    )
    const range = screen.getByRole('slider', { name: 'Blur' })
    expect(range).toHaveValue('4')
    expect(range).toHaveAttribute('aria-valuetext', '4 px')
    expect(screen.getByText('4 px').tagName).toBe('OUTPUT')
    // user-event does not implement keyboard stepping of native ranges, so fire the change itself.
    fireEvent.change(range, { target: { value: '5' } })
    expect(onValueChange).toHaveBeenCalledWith(5)
  })
})

describe('Select', () => {
  it('is a labelled native select that emits the value', async () => {
    const onValueChange = vi.fn()
    render(
      <Select
        label="Paper"
        value="A4"
        onValueChange={onValueChange}
        options={[
          { value: 'A4', label: 'A4' },
          { value: 'Letter', label: 'Letter' },
        ]}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Paper' }), 'Letter')
    expect(onValueChange).toHaveBeenCalledWith('Letter')
  })
})

describe('parseDecimal', () => {
  it('accepts dot and comma decimals and partial numbers', () => {
    expect(parseDecimal('5')).toBe(5)
    expect(parseDecimal(' 5.5 ')).toBe(5.5)
    expect(parseDecimal('5,5')).toBe(5.5)
    expect(parseDecimal('.5')).toBe(0.5)
    expect(parseDecimal('5.')).toBe(5)
  })

  it('rejects everything else', () => {
    for (const bad of [
      '',
      ' ',
      '.',
      ',',
      'abc',
      '1,000.5',
      '1e3',
      '-2',
      '+2',
      '5 mm',
      'Infinity',
      '1.2.3',
    ]) {
      expect(parseDecimal(bad)).toBeNull()
    }
  })

  it('reads back any plain decimal text (property)', () => {
    fc.assert(
      fc.property(fc.nat(100000), fc.nat(999), (whole, frac) => {
        expect(parseDecimal(`${String(whole)},${String(frac)}`)).toBe(
          Number(`${String(whole)}.${String(frac)}`),
        )
      }),
    )
  })
})

describe('NumberField', () => {
  function Harness({
    unit = 'mm',
    initial = 5,
    onChange,
  }: {
    unit?: 'mm' | 'in'
    initial?: number
    onChange?: (mm: number) => void
  }) {
    const [mm, setMm] = useState(initial)
    return (
      <NumberField
        label="Safe area"
        valueMm={mm}
        unit={unit}
        unitLabel={unit}
        minMm={3}
        maxMm={50}
        onChangeMm={(v) => {
          setMm(v)
          onChange?.(v)
        }}
      />
    )
  }

  it('shows millimetres rounded to one decimal, with the unit label', () => {
    render(<Harness initial={5.04} />)
    const field = screen.getByRole('spinbutton', { name: 'Safe area' })
    expect(field).toHaveValue('5')
    expect(screen.getByText('mm')).toBeInTheDocument()
  })

  it('shows the same value in inches, and emits millimetres', async () => {
    const onChange = vi.fn()
    render(<Harness unit="in" initial={25.4} onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    expect(field).toHaveValue('1')
    await userEvent.clear(field)
    await userEvent.type(field, '0.5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(12.7)
  })

  it('accepts a comma decimal and commits on blur', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '7,5')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith(7.5)
    expect(field).toHaveValue('7.5')
  })

  it('lets the field be empty or half-typed without emitting', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '.')
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.tab()
    expect(field).toHaveValue('5')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps to min and max', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '999{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(50)
    expect(field).toHaveValue('50')
    await userEvent.clear(field)
    await userEvent.type(field, '1{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('steps with arrow keys, ten times as far with Shift', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('spinbutton').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith(6)
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('does not emit (and so cannot drift) when the typed value shows the same number', async () => {
    const onChange = vi.fn()
    render(<Harness unit="in" initial={5.08} onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    expect(field).toHaveValue('0.2')
    await userEvent.clear(field)
    await userEvent.type(field, '0.2{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project dom src/shared/ui/forms`
Expected: FAIL: modules cannot be resolved.

- [ ] **Step 3: Implement**

`src/shared/ui/parse-decimal.ts`:

```ts
/**
 * Parse what a person types into a number field. Accepts "5", "5.5", "5,5", " 5 ", ".5", "5.".
 * Returns null for anything else (empty, letters, "1,000.5" with two separators, Infinity).
 */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d*[.,]?\d*$/.test(trimmed) || !/\d/.test(trimmed)) return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
```

`src/shared/ui/Switch.tsx`:

```tsx
import { Switch as RadixSwitch } from 'radix-ui'
import { useId } from 'react'
import { cx } from './cx'

export interface SwitchProps {
  /** Visible label. */
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Small helper text under the label. */
  hint?: string
  disabled?: boolean
  className?: string
}

export function Switch({
  label,
  checked,
  onCheckedChange,
  hint,
  disabled,
  className,
}: SwitchProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={cx('ds-switch-row', className)}>
      <div className="ds-switch-row__text">
        <label htmlFor={id} className="ds-switch-label">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="ds-field-hint">
            {hint}
          </span>
        ) : null}
      </div>
      <RadixSwitch.Root
        id={id}
        className="ds-switch"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
      >
        <RadixSwitch.Thumb className="ds-switch__thumb" />
      </RadixSwitch.Root>
    </div>
  )
}
```

`src/shared/ui/SegmentedControl.tsx`:

```tsx
import { RadioGroup } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Orientation". */
  label: string
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Fill the container width. */
  block?: boolean
  className?: string
}

/** A radio group drawn as joined buttons. Arrow keys move the selection (Radix roving focus). */
export function SegmentedControl<T extends string>({
  label,
  value,
  onValueChange,
  options,
  block = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => {
        onValueChange(v as T)
      }}
      orientation="horizontal"
      className={cx('ds-seg', block && 'ds-seg--block', className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className="ds-seg__item"
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
```

`src/shared/ui/Slider.tsx`:

```tsx
import { useId, type CSSProperties } from 'react'
import { cx } from './cx'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (value: number) => void
  /** Text shown in the live output and announced; defaults to the number. */
  formatValue?: (value: number) => string
  /** Captions under the track ends, e.g. "Fewer" / "More". */
  minLabel?: string
  maxLabel?: string
  disabled?: boolean
  className?: string
}

/** A native range input (best touch and keyboard behaviour for free) with the mockup's look. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  formatValue = String,
  minLabel,
  maxLabel,
  disabled,
  className,
}: SliderProps) {
  const id = useId()
  const span = max - min
  const fill = span > 0 ? ((value - min) / span) * 100 : 0
  const text = formatValue(value)
  return (
    <div className={cx('ds-slider', className)}>
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{text}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        style={{ '--fill': `${String(fill)}%` } as CSSProperties}
        onChange={(e) => {
          onValueChange(Number(e.currentTarget.value))
        }}
      />
      {minLabel || maxLabel ? (
        <div className="ds-slider__ends" aria-hidden="true">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
```

`src/shared/ui/Select.tsx`:

```tsx
import { useId } from 'react'
import { cx } from './cx'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  hint?: string
  disabled?: boolean
  className?: string
}

/**
 * A native `<select>`: on phones the OS picker is far easier to use than any custom list, and it is
 * accessible for free.
 */
export function Select({
  label,
  value,
  onValueChange,
  options,
  hint,
  disabled,
  className,
}: SelectProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={cx('ds-field', className)}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="ds-select"
        value={value}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => {
          onValueChange(e.currentTarget.value)
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span id={hintId} className="ds-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
```

`src/shared/ui/NumberField.tsx`:

```tsx
import { useId, useState, type KeyboardEvent } from 'react'
import { cx } from './cx'
import { parseDecimal } from './parse-decimal'
import { mmToUnit, roundForUnit, unitToMm, type Mm, type Unit } from '../model/units'

export interface NumberFieldProps {
  label: string
  /** The value in millimetres. The field shows it in `unit` and always emits millimetres. */
  valueMm: Mm
  unit: Unit
  /** Text shown after the number, e.g. "mm" or "in" (comes from i18n). */
  unitLabel: string
  onChangeMm: (mm: Mm) => void
  minMm?: Mm
  maxMm?: Mm
  /** Arrow-key step in millimetres (Shift = 10×). Default 1. */
  stepMm?: Mm
  hint?: string
  disabled?: boolean
  className?: string
}

function show(mm: Mm, unit: Unit): string {
  return String(roundForUnit(mmToUnit(mm, unit), unit))
}

export function NumberField({
  label,
  valueMm,
  unit,
  unitLabel,
  onChangeMm,
  minMm = 0,
  maxMm = Number.POSITIVE_INFINITY,
  stepMm = 1,
  hint,
  disabled,
  className,
}: NumberFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  // While editing, show exactly what was typed. Otherwise show the (rounded) value.
  const [draft, setDraft] = useState<string | null>(null)

  const commitMm = (mm: Mm) => {
    const clamped = Math.min(maxMm, Math.max(minMm, mm))
    // Emit nothing when the display would not change: avoids drift from re-rounding.
    if (show(clamped, unit) !== show(valueMm, unit)) onChangeMm(clamped)
  }

  const commitDraft = () => {
    if (draft === null) return
    const parsed = parseDecimal(draft)
    if (parsed !== null) commitMm(unitToMm(parsed, unit))
    setDraft(null) // invalid text snaps back to the current value
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitDraft()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const parsed = draft === null ? null : parseDecimal(draft)
      const base = parsed === null ? valueMm : unitToMm(parsed, unit)
      const step = stepMm * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
      commitMm(base + step)
      setDraft(null)
    }
  }

  return (
    <div className={cx('ds-field', className)}>
      <label htmlFor={id}>{label}</label>
      <div className="ds-unit-input">
        <input
          id={id}
          className="ds-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          role="spinbutton"
          aria-valuenow={roundForUnit(mmToUnit(valueMm, unit), unit)}
          aria-valuemin={
            Number.isFinite(minMm) ? roundForUnit(mmToUnit(minMm, unit), unit) : undefined
          }
          aria-valuemax={
            Number.isFinite(maxMm) ? roundForUnit(mmToUnit(maxMm, unit), unit) : undefined
          }
          aria-describedby={hint ? hintId : undefined}
          disabled={disabled}
          value={draft ?? show(valueMm, unit)}
          onChange={(e) => {
            setDraft(e.currentTarget.value)
          }}
          onBlur={commitDraft}
          onKeyDown={onKeyDown}
        />
        <span className="ds-unit-input__unit" aria-hidden="true">
          {unitLabel}
        </span>
      </div>
      {hint ? (
        <span id={hintId} className="ds-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Component styles**

Replace `src/shared/ui/css/forms.css` with:

```css
/* Fields, inputs, select, switch, segmented control, slider. Adapted from design/mockup.css. */
@layer components {
  .ds-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .ds-field > label,
  .ds-switch-label {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-ink);
  }
  .ds-field-hint {
    font-size: var(--text-xs);
    color: var(--color-ink-muted);
  }

  .ds-input,
  .ds-select {
    min-height: var(--size-target-dense);
    width: 100%;
    padding: var(--space-1-5) 0.625rem;
    border: var(--border-width) solid var(--color-line-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface-raised);
    color: var(--color-ink);
    font-size: var(--text-sm);
  }
  .ds-input:focus-visible,
  .ds-select:focus-visible {
    outline-offset: 0;
  }
  .ds-select {
    appearance: none;
    padding-right: 2rem;
    background-image:
      linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position:
      calc(100% - 15px) 55%,
      calc(100% - 10px) 55%;
    background-size: 5px 5px;
    background-repeat: no-repeat;
  }

  .ds-unit-input {
    position: relative;
    display: flex;
    align-items: stretch;
  }
  .ds-unit-input .ds-input {
    padding-right: 2.6rem;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .ds-unit-input__unit {
    position: absolute;
    right: var(--space-2);
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--text-xs);
    color: var(--color-ink-muted);
    pointer-events: none;
  }

  /* Segmented control (Radix RadioGroup renders buttons with role=radio) */
  .ds-seg {
    display: inline-flex;
    flex-wrap: wrap;
    padding: 3px;
    gap: 2px;
    background: var(--color-surface-sunken);
    border: var(--border-width) solid var(--color-line);
    border-radius: var(--radius-md);
  }
  .ds-seg--block {
    display: flex;
  }
  .ds-seg--block .ds-seg__item {
    flex: 1 1 0;
  }
  .ds-seg__item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: 28px;
    padding: var(--space-1) var(--space-3);
    border: 0;
    background: transparent;
    border-radius: calc(var(--radius-md) - 3px);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-ink-muted);
    cursor: pointer;
    text-align: center;
    line-height: 1.15;
  }
  .ds-seg__item:hover {
    color: var(--color-ink);
  }
  .ds-seg__item[data-state='checked'] {
    background: var(--color-surface-raised);
    color: var(--color-ink);
    box-shadow:
      var(--shadow-sm),
      inset 0 -2px 0 var(--color-accent);
  }
  .ds-seg__item:focus-visible {
    outline-offset: 1px;
  }
  .ds-seg__item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Switch (Radix Switch renders a button with role=switch) */
  .ds-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--size-target-dense);
  }
  .ds-switch-row__text {
    display: flex;
    flex-direction: column;
  }
  .ds-switch {
    flex: none;
    cursor: pointer;
    width: 42px;
    height: 24px;
    padding: 0;
    border-radius: var(--radius-pill);
    background: var(--color-surface-sunken);
    border: var(--border-width-strong) solid var(--color-line-strong);
    position: relative;
    transition: background var(--duration-base) var(--ease-out);
  }
  .ds-switch__thumb {
    display: block;
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-line-strong);
    transition:
      transform var(--duration-base) var(--ease-wobble),
      background var(--duration-base);
  }
  .ds-switch[data-state='checked'] {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  .ds-switch[data-state='checked'] .ds-switch__thumb {
    transform: translateX(18px);
    background: var(--color-on-accent);
  }
  .ds-switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Slider with live output */
  .ds-slider {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }
  .ds-slider > label {
    grid-column: 1;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }
  .ds-slider output {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    background: var(--color-surface-sunken);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-2);
    min-width: 3.5em;
    text-align: center;
  }
  .ds-slider input[type='range'] {
    grid-column: 1 / -1;
  }
  .ds-slider__ends {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    font-size: var(--text-xs);
    color: var(--color-ink-muted);
    margin-top: -2px;
  }
  .ds-slider input[type='range'] {
    appearance: none;
    width: 100%;
    height: 24px;
    background: transparent;
    margin: 0;
    cursor: pointer;
  }
  .ds-slider input[type='range']::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--color-accent) 0 var(--fill, 50%),
      var(--color-surface-sunken) var(--fill, 50%)
    );
    border: 1px solid var(--color-line-strong);
  }
  .ds-slider input[type='range']::-moz-range-track {
    height: 6px;
    border-radius: 999px;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-line-strong);
  }
  .ds-slider input[type='range']::-moz-range-progress {
    height: 6px;
    border-radius: 999px;
    background: var(--color-accent);
  }
  .ds-slider input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    margin-top: -8px;
    border-radius: 50%;
    background: var(--color-surface-raised);
    border: 2px solid var(--color-accent);
    box-shadow: var(--shadow-sm);
  }
  .ds-slider input[type='range']::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-surface-raised);
    border: 2px solid var(--color-accent);
    box-shadow: var(--shadow-sm);
  }
  .ds-slider input[type='range']:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: 2px;
    border-radius: 999px;
  }
}
```

- [ ] **Step 5: Verify**

```bash
pnpm vitest run --project dom src/shared/ui/forms && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
```

Expected: tests pass. Known happy-dom limits (covered by E's E2E instead): native range keyboard stepping and Radix roving-focus selection are checked through focus movement and `fireEvent.change`. Visual check against `design/page-setup.html` as in A9 (segmented control with the accent underline on the selected option, 42×24 switch, range track filled with the accent, mono unit input with a suffix).

- [ ] **Step 6: Commit and open the PR**

```bash
git add src/shared/ui
git commit -m "feat(ui): add switch, segmented control, slider, select and number field"
```

---

### Task A11: UI primitives, part 3 (dialog, bottom sheet, tabs, tooltip)

**Branch:** `feat/m1-ui-overlays` · **PR title:** `feat(ui): add dialog, bottom sheet, tabs and tooltip`

**Files:**
- Create: `src/shared/ui/{Dialog.tsx,BottomSheet.tsx,Tabs.tsx,Tooltip.tsx}`
- Modify: `src/shared/ui/css/overlays.css` (replace the placeholder)
- Test: `src/shared/ui/overlays.test.tsx`

**Interfaces:**
- Consumes: A7 (CSS, `cx`, `Icon`), A2 `dom` project. Independent of A9 and A10 (the close button is a plain `ds-btn ds-btn--icon` button with `Icon`, not `IconButton`).
- Produces:
  - `Dialog({ open, onOpenChange(open), title, description?, closeLabel, children, footer?, size?: 'sm' | 'lg' })`: Radix Dialog, modal, focus trap, Esc/backdrop close, focus returns to the opener; the title names the dialog, the description (if any) describes it.
  - `BottomSheet({ open, onOpenChange, title, description?, closeLabel, children, footer? })`: the phone variant (slides up, max 86 dvh).
  - `Tabs({ label /* tablist aria-label */, items: { id; label; content; badge? }[], value, onValueChange(id), className? })`: Radix Tabs (arrow keys).
  - `Tooltip({ content: string, children: ReactElement })`: Radix Tooltip with its own provider; opens on focus and hover. Never the only place for an instruction (touch has no hover).

- [ ] **Step 1: Write the failing tests**

`src/shared/ui/overlays.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Dialog } from './Dialog'
import { Tabs } from './Tabs'
import { Tooltip } from './Tooltip'

describe('Dialog', () => {
  function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true)
          }}
        >
          Open
        </button>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            onOpenChange?.(o)
          }}
          title="Export PDF"
          description="Choose how to export"
          closeLabel="Close"
          footer={<button type="button">Download</button>}
        >
          <p>Body text</p>
        </Dialog>
      </>
    )
  }

  it('opens as a named modal with description, body and footer', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Export PDF' })
    expect(dialog).toHaveAccessibleDescription('Choose how to export')
    expect(within(dialog).getByText('Body text')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('closes with Escape and the close button', async () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(opener)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onOpenChange={() => undefined} title="T" closeLabel="Close">
        x
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('BottomSheet', () => {
  it('is a named dialog with a close button', async () => {
    const onOpenChange = vi.fn()
    render(
      <BottomSheet open onOpenChange={onOpenChange} title="Edit photo" closeLabel="Close sheet">
        <p>Controls</p>
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Edit photo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close sheet' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Tabs', () => {
  function Harness() {
    const [value, setValue] = useState('page')
    return (
      <Tabs
        label="Settings"
        value={value}
        onValueChange={setValue}
        items={[
          { id: 'page', label: 'Page', content: <p>Page panel</p> },
          { id: 'studies', label: 'Studies', content: <p>Studies panel</p>, badge: '2' },
        ]}
      />
    )
  }

  it('shows the selected panel and switches on click', async () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Page' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Page panel')).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: /Studies/ }))
    expect(screen.getByText('Studies panel')).toBeVisible()
    expect(screen.queryByText('Page panel')).toBeNull()
  })

  it('moves between tabs with the arrow keys', async () => {
    render(<Harness />)
    screen.getByRole('tab', { name: 'Page' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Studies/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Tooltip', () => {
  it('shows its text when the trigger is focused', async () => {
    render(
      <Tooltip content="Rotate 90 degrees">
        <button type="button">Rotate</button>
      </Tooltip>,
    )
    await userEvent.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Rotate 90 degrees')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project dom src/shared/ui/overlays`
Expected: FAIL: modules cannot be resolved.

- [ ] **Step 3: Implement**

`src/shared/ui/Dialog.tsx`:

```tsx
import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Accessible name of the close (X) button, e.g. "Close". */
  closeLabel: string
  children: ReactNode
  /** Buttons for the footer bar. */
  footer?: ReactNode
  size?: 'sm' | 'lg'
}

/** Modal dialog: focus is trapped, Esc and the backdrop close it, focus returns to the opener. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
  size = 'lg',
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ds-overlay" />
        <RadixDialog.Content
          className={cx('ds-dialog', size === 'sm' && 'ds-dialog--sm')}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="ds-dialog__head">
            <RadixDialog.Title>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label={closeLabel}
                className="ds-btn ds-btn--ghost ds-btn--icon"
              >
                <Icon name="close" />
              </button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="ds-dialog__desc">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="ds-dialog__body">{children}</div>
          {footer ? <div className="ds-dialog__foot">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
```

`src/shared/ui/BottomSheet.tsx`:

```tsx
import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  closeLabel: string
  children: ReactNode
  footer?: ReactNode
}

/** The phone variant of Dialog: slides up from the bottom edge, same focus handling. */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
}: BottomSheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ds-overlay" />
        <RadixDialog.Content
          className="ds-sheet"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="ds-sheet__grab" aria-hidden="true" />
          <div className="ds-dialog__head">
            <RadixDialog.Title>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label={closeLabel}
                className="ds-btn ds-btn--ghost ds-btn--icon"
              >
                <Icon name="close" />
              </button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="ds-dialog__desc">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="ds-sheet__body">{children}</div>
          {footer ? <div className="ds-dialog__foot">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
```

`src/shared/ui/Tabs.tsx`:

```tsx
import { Tabs as RadixTabs } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface TabItem {
  id: string
  label: string
  content: ReactNode
  /** Optional badge next to the label (e.g. a count). */
  badge?: ReactNode
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string
  items: readonly TabItem[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

/** WAI-ARIA tabs. Arrow keys move between tabs; the panel of the selected tab is shown. */
export function Tabs({ label, items, value, onValueChange, className }: TabsProps) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={onValueChange}
      className={cx('ds-tabs-root', className)}
    >
      <RadixTabs.List aria-label={label} className="ds-tabs">
        {items.map((item) => (
          <RadixTabs.Trigger key={item.id} value={item.id} className="ds-tab">
            {item.label}
            {item.badge ? <span className="ds-tab__badge">{item.badge}</span> : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.id} value={item.id} className="ds-tabpanel">
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  )
}
```

`src/shared/ui/Tooltip.tsx`:

```tsx
import { Tooltip as RadixTooltip } from 'radix-ui'
import type { ReactElement } from 'react'

export interface TooltipProps {
  /** The tip text. Never the only place an important instruction lives: touch users cannot hover. */
  content: string
  /** The element that triggers the tip; it must accept a ref and props (a button, a link…). */
  children: ReactElement
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="ds-tooltip" sideOffset={6}>
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
```

- [ ] **Step 4: Component styles**

Replace `src/shared/ui/css/overlays.css` with:

```css
/* Dialog, bottom sheet, tabs, tooltip. Adapted from design/mockup.css. */
@layer components {
  .ds-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    background: var(--color-overlay);
    backdrop-filter: blur(2px);
  }

  .ds-dialog,
  .ds-sheet {
    position: fixed;
    z-index: calc(var(--z-dialog) + 1);
    display: flex;
    flex-direction: column;
    color: var(--color-ink);
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
  }
  .ds-dialog {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(960px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    border-radius: var(--radius-xl);
    animation: ds-pop-in var(--duration-slow) var(--ease-wobble);
  }
  .ds-dialog--sm {
    width: min(480px, calc(100vw - 32px));
  }
  .ds-dialog__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-line);
  }
  .ds-dialog__head h2 {
    font-size: var(--text-lg);
  }
  .ds-dialog__desc {
    padding: var(--space-3) var(--space-5) 0;
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
  }
  .ds-dialog__body {
    padding: var(--space-5);
    overflow: auto;
  }
  .ds-dialog__foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-line);
    background: var(--color-surface-sunken);
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }
  @keyframes ds-pop-in {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 10px)) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  .ds-sheet {
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 86dvh;
    border-radius: 24px 24px 0 0;
    animation: ds-sheet-up var(--duration-slow) var(--ease-out);
  }
  .ds-sheet__grab {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--color-line-strong);
    margin: 8px auto 0;
  }
  .ds-sheet__body {
    overflow: auto;
    padding: var(--space-3) var(--space-4) var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  @keyframes ds-sheet-up {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }

  .ds-tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--color-line);
    padding: 0 var(--space-3);
  }
  .ds-tab {
    position: relative;
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: var(--space-3);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--color-ink-muted);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1-5);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  }
  .ds-tab:hover {
    color: var(--color-ink);
  }
  .ds-tab[aria-selected='true'] {
    color: var(--color-ink);
  }
  .ds-tab[aria-selected='true']::after {
    content: '';
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: -2px;
    height: 6px;
    background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 8' preserveAspectRatio='none'><path d='M2 5 C 25 1, 50 7, 75 3 S 95 4, 98 4' fill='none' stroke='%23b0432a' stroke-width='3.2' stroke-linecap='round'/></svg>")
      center / 100% 100% no-repeat;
  }
  .ds-tab__badge {
    font-size: var(--text-2xs);
    background: var(--color-surface-sunken);
    border-radius: var(--radius-pill);
    padding: 0 var(--space-1-5);
  }
  .ds-tabpanel {
    padding: var(--space-4);
  }

  .ds-tooltip {
    z-index: var(--z-popover);
    max-width: 18rem;
    padding: var(--space-1-5) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-ink);
    color: var(--color-ink-inverse);
    font-size: var(--text-xs);
    box-shadow: var(--shadow-md);
  }
}
```

- [ ] **Step 5: Verify**

```bash
pnpm vitest run --project dom src/shared/ui/overlays && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
```

Expected: tests pass. happy-dom does not return focus to the opener after Radix closes a dialog, so that behaviour is left to E's E2E (focus return and the focus trap are Radix guarantees). Visual check against `design/export.html` (dialog: rounded 24 px, sunken footer bar) and `design/mobile-flow.html` (bottom sheet with grab handle).

- [ ] **Step 6: Commit and open the PR**

```bash
git add src/shared/ui
git commit -m "feat(ui): add dialog, bottom sheet, tabs and tooltip"
```

---

### Task A12: UI barrel and export surface test

**Branch:** `feat/m1-ui-barrel` · **PR title:** `feat(ui): export all primitives from one barrel`

**Files:**
- Create: `src/shared/ui/index.ts`
- Test: `src/shared/ui/index.test.tsx`

**Interfaces:**
- Consumes: A9, A10, A11 files (including A9's `button-classes.ts`).
- Produces: `import { Button, Dialog, NumberField, … } from '../shared/ui'`: every primitive and its prop types. This is the **only** barrel; B–E import from it and never edit it.

- [ ] **Step 1: Write the failing test**

`src/shared/ui/index.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui barrel', () => {
  it('exports every primitive in the M1 contract', () => {
    const names = [
      'Button',
      'IconButton',
      'Switch',
      'SegmentedControl',
      'Slider',
      'NumberField',
      'Select',
      'Dialog',
      'BottomSheet',
      'Tabs',
      'Tooltip',
      'Badge',
      'Chip',
      'Callout',
      'ProgressBar',
      'VisuallyHidden',
      'SketchCard',
      'Icon',
      'cx',
      'buttonClasses',
    ]
    for (const name of names) expect(ui, name).toHaveProperty(name)
  })

  it('buttonClasses styles a link like a Button (CCR-D7)', () => {
    expect(ui.buttonClasses('primary', 'lg', { block: true })).toBe(
      'ds-btn ds-btn--primary ds-btn--lg ds-btn--block',
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project dom src/shared/ui/index`
Expected: FAIL: `./index` cannot be resolved.

- [ ] **Step 3: Implement**

`src/shared/ui/index.ts`:

```ts
export { Badge } from './Badge'
export type { BadgeProps, BadgeTone } from './Badge'
export { BottomSheet } from './BottomSheet'
export type { BottomSheetProps } from './BottomSheet'
export { Button } from './Button'
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button'
export { buttonClasses } from './button-classes'
export { Callout } from './Callout'
export type { CalloutProps, CalloutTone } from './Callout'
export { Chip } from './Chip'
export type { ChipProps } from './Chip'
export { Dialog } from './Dialog'
export type { DialogProps } from './Dialog'
export { Icon } from './Icon'
export type { IconName, IconProps } from './Icon'
export { IconButton } from './IconButton'
export type { IconButtonProps } from './IconButton'
export { NumberField } from './NumberField'
export type { NumberFieldProps } from './NumberField'
export { ProgressBar } from './ProgressBar'
export type { ProgressBarProps } from './ProgressBar'
export { SegmentedControl } from './SegmentedControl'
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl'
export { Select } from './Select'
export type { SelectOption, SelectProps } from './Select'
export { SketchCard } from './SketchCard'
export type { SketchCardProps } from './SketchCard'
export { Slider } from './Slider'
export type { SliderProps } from './Slider'
export { Switch } from './Switch'
export type { SwitchProps } from './Switch'
export { Tabs } from './Tabs'
export type { TabItem, TabsProps } from './Tabs'
export { Tooltip } from './Tooltip'
export type { TooltipProps } from './Tooltip'
export { VisuallyHidden } from './VisuallyHidden'
export { cx } from './cx'
```

- [ ] **Step 4: Full verification of the foundation**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build
E2E_PORT=4103 pnpm e2e --project=chromium
```

Expected: everything green. Confirm the hand-off state for B–E on `master`:
- `ls src/locales/en` shows `common app images pageSetup preview export errors` (7 JSON files), and the unused ones contain `{}`.
- `grep -rn "from '../shared/ui'" src` compiles from another feature directory (try a throwaway import).
- `git log --oneline` shows A1…A11 merged.

- [ ] **Step 5: Commit and open the PR**

```bash
git add src/shared/ui/index.ts src/shared/ui/index.test.tsx
git commit -m "feat(ui): export all primitives from one barrel"
```

---

## Contract change requests

All ruled: see the overview, "Contract change requests → Ruled".

- **CCR-A1 (units wording):** Ruled: see overview CCR-A1. A3 tests exactly the ruled wording (`first rounding error is at most half a display step`, `does not drift on repeated unit toggling`); A10's `NumberField` refuses to emit when the displayed number does not change.
- **CCR-A2 (`contentBoxMm` clamps at 0):** Ruled: see overview CCR-A2. B treats a zero-area box as "nothing fits".
- **CCR-A3 (i18n ownership):** Ruled: see overview CCR-A3. A seeds `common.json`; E puts shell strings in `app.json` and leaves `common.json` alone.
- **CCR-A4 (`initI18n` signature):** Ruled: see overview CCR-A4. `initI18n(options?: { savedLanguage?: LanguageCode | null })`; E passes `useSettings.getState().language`.
- **CCR-A5 (dependency table):** Ruled: see overview CCR-A5. `@testing-library/dom@10.4.2` is added; `heic-to` is pinned to `1.5.2` (1.6.4/1.6.5 were inside the 48 h window).
- **CCR-A6 (lint mode name):** Ruled: see overview CCR-A6. `eslint-plugin-i18next` mode `jsx-only`.
- **CCR-A7 (`PageSetupPatch`):** Ruled: see overview CCR-A7. Nested `customSize`, `gutter` and `bleed` merge one level deep.
- **CCR-A8 (design-system choices):** Ruled: see overview CCR-A8. Native `Slider` and `Select`; Radix for the rest; `app/index.html` loses its stone body classes in A7.
- **CCR-D7 (`buttonClasses` export):** Ruled: see overview CCR-D7. Added in A9 (with a test) and exported in A12; `Button` uses it internally.

## Open questions for the owner

1. **Default unit (owner Q8, default).** Implemented as the overview's recommendation: `defaultUnitForLocale(locale)` returns `'in'` for `en-US` and `en-CA`, `'mm'` otherwise. The settings store uses it for the initial `unit` only when no saved settings exist (A5, `initialUnitFromNavigator`). If the owner prefers millimetres for everyone, pass `'mm'` instead of `initialUnitFromNavigator()` in `useSettings` (one line); no other sub-plan needs a change.

## Self-review

- **Spec/overview coverage:** dependencies with exact pins and verification (A1); Vitest projects, coverage gate that does not fail on empty directories, CI `unit` switch, worker tsconfig and `worker.format` with a type-level and config-level proof (A2); model with property tests for `normalizePageSetup`, unit drift and `printedPixelSize` (A3); `LANGUAGES`, `initI18n`, glob-loaded namespaces, `common`/`errors` skeletons and empty other files (A4, CR-E1); settings store with Zod, versioning, `{ state, version }` envelope and corrupt/old-data tests (A5, CR-E8); lint rule scoped to `src/**/*.tsx` minus tests and the translated placeholder (A6); tokens mapped into Tailwind v4 `@theme` with light/dark and fonts self-hosted (A7); `useApplyTheme` (A8, CR-E5); the 17 primitives plus `Icon` and `buttonClasses` with tests (A9–A12); locale-based first-run unit (A3 `defaultUnitForLocale`, A5); CR-E7's `scripts` edits (A2).
- **Placeholders:** none. Every code block was written and run in a scratch copy outside the repo (Vitest 5.0.3, TypeScript 6.0.3, ESLint with the repo's rules plus the i18n rule, Prettier with the repo's config, and `tailwindcss` 4.3.3 compilation of `styles.css`): the counts quoted in the Expected lines were derived from the scratch run plus the additions of the review fixes (`buttonClasses`, `defaultUnitForLocale`, initial unit), which were not re-run, `tsc -b` and `eslint --max-warnings=0` were clean. The only blocks not run are the repo-specific config edits (`vite.config.ts`, CI, tsconfigs, `main.tsx`) and `worker-setup.test.ts`.
- **Type consistency:** `IconName` comes from `icon-paths.ts` and is re-exported by `Icon.tsx`; `ButtonVariant`/`ButtonSize` come from `button-classes.ts` and are re-exported by `Button.tsx`; `Theme` and `SettingsData` come from `settings/schema.ts`; `LanguageCode` from `i18n/languages.ts`; barrel names match file exports (including `buttonClasses`).
- **Review Focus:** items 1–2 (A5), 3 (A3, A5, A10), 4 (A3), 5 (A4, A7, A8) each have a named test.
