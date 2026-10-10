# M6-E: Screens in Every Language and 1.0 Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meet the spec's exit criterion, "every screen reviewed in all 7 languages" (M6-R26): every screen captured, scanned and probed in every language, then read by the controller with every finding fixed. Close the items M5 deferred to M6, and prepare the 1.0 release up to the owner's sign-off.

**Architecture:** E1 runs D3's walk in all seven languages in required CI and captures the screen sets on demand (a manual workflow uploads the contact sheet). E2 is the controller's review, recorded in the ledger, with fix PRs. E3–E5 are small, independent fixes from the M5 triage, run in wave 1. E6 runs after the final review F: README, HANDOVER, spec and the `Release-As: 1.0.0` footer (M6-R28).

**Tech Stack:** Playwright 1.63 with `@axe-core/playwright`, GitHub Actions (`workflow_dispatch` only for the new workflow), TypeScript 6, Vitest 5. No new dependencies.

**Spec:** `docs/spec.md` §8 M6 exit, §3 (reliability), §2.7 (centre lines), §2.12 **and** the overview (M6-R24, R26, R28, R29; "Deferred items: triage"; questions Q10, Q12, Q14, Q15).

## Global Constraints

As in the overview. E2E ports 75xx (E1 7501 … E6 7506). The new workflow `screens.yml` is not a required check and has no effect on merges; `ci.yml` keeps its eight required checks and gets no `paths:` filter.

## Review Focus

1. **The language walk is in required CI** (E1) and fails on axe, overflow, untranslated text or a wrong `lang`.
2. **Output is language-neutral** (E1, L10N-D1): byte-identical PDFs in `en` and `ja`.
3. **E2's record is complete:** every screen of every language looked at, every finding fixed or ruled, privacy claims back-translated.
4. **E3:** a gap of each centre line clears the crossing on the smallest tiles; normal tiles unchanged; preview equals PDF.
5. **E6:** the footer is the last line of the PR body; nothing in `release-please-config.json` changes.

## File map

| File | Task | Purpose |
|---|---|---|
| `e2e/l10n.spec.ts`, `e2e/support/l10n.ts`, `e2e/language.spec.ts`, `e2e/offline.spec.ts`, `e2e/performance.spec.ts` | E1 | the seven-language walk, L10N-D1, offline and T2 in `ja`, switch and first-paint timings |
| `.github/workflows/screens.yml`, `scripts/deploy-workflows.test.ts` | E1 | manual capture workflow (timeout set) |
| `docs/superpowers/ledgers/m6.md` (E2 section), fix PRs | E2 | the screen review |
| `src/features/lines/geometry.ts`, `src/features/render/page-model/tile-lines.ts`, `src/features/render/types.ts` (dash phase), both renderers' dash calls (+ tests, `e2e/lines.spec.ts`) | E3 | centre-line dash phase |
| `src/features/render/components/ArrangeLayer.tsx` (ghost), its CSS (+ tests, `e2e/arrange.spec.ts`) | E4 | unclipped drag ghost |
| `e2e/import.spec.ts` (Cancel), `e2e/support/app.ts` | E5 | Cancel E2E |
| `README.md`, `HANDOVER.md`, `docs/spec.md`, `CLAUDE.md`, the M6 ledger | E6 | 1.0 docs, `Release-As` |

---

### Task E1: Every screen in every language

**Branch:** `test/e2e-languages` · **PR title:** `test(e2e): every screen in every language` · **Depends on:** B2–B7, D2, D3

- [ ] **Step 1: Failing tests** (they fail until the run is wired; each named here):
  - `e2e/l10n.spec.ts` L10N-1…7 (one per language): for each screen of the set at desktop and phone width: `<html lang>` and `document.title` in the language; axe clean (light and dark at desktop); no overflow; no English left (a list of 30 frequent English UI words, plus the A4 `SAME_AS_ENGLISH` allow-list); label in name. Chromium and mobile-chromium run all seven; firefox, webkit and mobile-webkit run `ja` and `pt-BR`.
  - L10N-D1 `the PDF is byte-identical in en and ja` (same photos and settings, export in each language, compare bytes; M6-R24).
  - LANG-D6 `a browser in each language opens the app in it` (seven contexts with `locale` set; `zh-TW` → English).
  - LANG-P1 `first paint in ja is within 200 ms of English` (CI chromium, median of 5, figures recorded in the ledger); LANG-S5 `switching to ja shows the translated top bar within 300 ms`.
  - G-X1 offline (`e2e/offline.spec.ts`) re-run with the app in `ja`: offline reload opens in Japanese (the locale chunk comes from the service worker).
  - T2 (`e2e/performance.spec.ts`) re-run in `ja`: all seven kinds under 200 ms.
- [ ] **Step 2: Implement, GREEN.** Keep the walk's run time on CI chromium under +8 minutes (record before and after; the e2e job's limit is 50 minutes).
- [ ] **Step 3: `screens.yml`** (`workflow_dispatch`, `timeout-minutes: 40`, ubuntu-latest): install Playwright chromium with deps plus `fonts-noto-cjk`, build, `corepack pnpm e2e:screens`, upload `screens/` as the artifact `screens`. `scripts/deploy-workflows.test.ts` requires the timeout on its job like every other.
- [ ] **Step 4: Run it** on the PR branch and on macOS locally (system CJK fonts); attach both contact sheets to the PR.
- [ ] **Step 5: Pre-PR command (7501), PR.**

---

### Task E2: The controller's screen review in all seven languages

**Branch:** `docs/m6-screen-review` (plus fix PRs) · **PR title:** `docs: record the screen review in all seven languages` · **Depends on:** E1, C3

- [ ] **Step 1:** run `screens.yml` on master; download the artifact; also capture on macOS.
- [ ] **Step 2: Read every screen in every language** (contact sheet, desktop and phone) against the style guide and the glossary: meaning, register, terminology, truncation, line breaks, CJK glyphs and punctuation, numbers and units, plurals at 0, 1 and many, and anything that looks wrong next to the English. Fresh reviewers working in each language may be used as helpers (one per language, in parallel); the controller owns the record.
- [ ] **Step 3: Privacy back-translation:** every privacy claim and the privacy FAQ answers in each language, back-translated, next to the English, in a ledger table (M6-R23).
- [ ] **Step 4: Fixes:** each finding gets a fix PR (`fix(i18n): …` per language, or a D-type CSS fix), reviewed as usual; findings recorded with their PR.
- [ ] **Step 5: Record** in `docs/superpowers/ledgers/m6.md`, section "E2": the master commit and the `screens.yml` run id, the count of screens per language, every finding with its fix, the back-translation table, and "screen review done" when every finding is fixed or ruled. This record is the spec's exit evidence; the owner skims the same contact sheet at the sign-off.

---

### Task E3: A gap of the centre line off the crossing on the smallest tiles

**Branch:** `fix/lines-centre-dash-phase` · **PR title:** `fix(lines): keep a gap of the centre line off the crossing on the smallest tiles` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`geometry.test.ts`, `tile-lines.test.ts`):
  - `centreDashPhaseMm(lengthMm, dash, gap, crossAtMm, crossWidthMm)` returns a phase so that at least one whole gap of the line lies outside the crossing line's width (the other centre line), on each side when the half-line holds a full period; table: the 12 × 8 mm tile at 2 mm (the M5 F part 1-5 case, `dashpdf-12-1.png`) gets visible gaps on both centre lines; a 20 mm tile unchanged;
  - `the phase is 0 whenever the tile's short side is at least 30 × the width` (M5-R20's "normal tiles"), so every existing snapshot stays;
  - `preview and PDF read the same phase from the page model` (the phase is a page-model field next to `dashMm`; both renderers pass it: canvas `lineDashOffset`, PDF `d` operator phase).
- [ ] **Step 2: RED, implement, GREEN.** The PDF inspector in `e2e/support/pdf.ts` learns to read the dash phase (M3 deferred "no dash phase").
- [ ] **Step 3: E2E:** L-X1 (`e2e/lines.spec.ts`) gains the 12 × 8 mm tile: the PDF dash array and phase equal the page model's, and the preview's `setLineDash`/`lineDashOffset` match scaled.
- [ ] **Step 4: Pre-PR command (7503), PR.**

---

### Task E4: Show the whole drag ghost past the preview's edge

**Branch:** `fix/arrange-ghost-clip` · **PR title:** `fix(preview): show the whole drag ghost past the preview's edge` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`ArrangeLayer.test.tsx`): the ghost renders in a layer that is not inside the preview scroller's clipping box (a portal to the preview area's overlay root, positioned with `position: fixed` from the pointer and the sheet's client rect); it is `aria-hidden`, has `pointer-events: none`, and goes when the drag ends or is cancelled; no layout call or redraw during the drag (M5-R19 test still passes).
- [ ] **Step 2: RED, implement, GREEN.**
- [ ] **Step 3: E2E** (`e2e/arrange.spec.ts`, B-D8): drag a photo past the scroller's bottom edge: the ghost's bounding box is fully inside the viewport and not cut by the scroller (`elementFromPoint` at its far corner returns the ghost); the "Can't place here" state shows; release: refused and announced as before.
- [ ] **Step 4: Pre-PR command (7504), PR.**

---

### Task E5: Cancel pending imports, end to end

**Branch:** `test/e2e-cancel-imports` · **PR title:** `test(e2e): cancel pending imports and keep the added photos` · **Depends on:** —

- [ ] **Step 1: Test** (`e2e/import.spec.ts`, I-C1): add two photos, then paste a link whose response the test holds open (`page.route` delaying the same-origin fixture URL served by the preview server; the network guard stays strict); "Cancel" next to "Adding 1 photo…" ends the pending import, the two photos stay, the route sees the request aborted, and the CORS probe is aborted too (M5-R23). Run on chromium, firefox and webkit.
- [ ] **Step 2:** confirm it fails with `cancelImports` stubbed to do nothing (mutation recorded in the PR), then passes.
- [ ] **Step 3: Pre-PR command (7505), PR.**

---

### Task E6: Prepare the 1.0 release

**Branch:** `docs/m6-close-out` · **PR title:** `docs: prepare the 1.0 release` · **Depends on:** F (all three parts clean)

- [ ] **Step 1: README:** what Artistica does at 1.0 (the "1.0 highlights" paragraph, Q15: photos to print-ready sheets, studies, composition lines, guides from the photo, presets, arranging by hand, seven languages, private and offline), the live link, development commands unchanged, and a short "Translations" section pointing at `docs/i18n/README.md` (corrections welcome, Q13).
- [ ] **Step 2: HANDOVER:** M6 state, the evidence, M6 gotchas (language resolution, lazy chunks, the locale check and stamps, the freeze rule for future string changes, the landing plugin, CJK fonts), the v1.0.0 sign-off as the next step.
- [ ] **Step 3: Spec:** §2.10 gains the `?lang` hint step and the Traditional Chinese rule (Q7, Q8) marked "(M6, delegated default)"; §2.11 the URL scheme (Q3); nothing else changes.
- [ ] **Step 4: Ledger:** "ready for the owner's v1.0.0 sign-off" with the master commit, the CI run, the bundle figure and the E2 record.
- [ ] **Step 5: The footer.** The PR body ends with these two lines, the last one exactly:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Release-As: 1.0.0
  ```

  Before merging, the controller checks with `gh pr view <n> --json body --jq .body | tail -1` that the last line is `Release-As: 1.0.0`. E6 is merged by the controller with `gh pr merge <n> --squash` (no auto-merge).
- [ ] **Step 6: After the merge:** the release PR is titled `chore(master): release 1.0.0` and its `CHANGELOG.md` entry starts `## [1.0.0]` (M6-R28; fallback described there). The controller refreshes it (`gh pr view <n> --json mergeable` until not UNKNOWN, close, reopen), waits for green checks, makes a manual deploy of master for the owner's phone run (`gh workflow run deploy-pages.yml --ref master`), and tells the owner M6 is **ready for the v1.0.0 sign-off** (overview checklist). **It does not merge the release PR.**

---

## Contract change requests

- **E3 (planned):** the page model's line items gain `dashPhaseMm?: Mm` next to `dashMm` (absent or 0 = today's output, so snapshots of normal tiles are unchanged); both renderers read it.

## Open questions for the owner

Q10 (PDF language), Q12 (auto-scroll), Q14 (many photos), Q15 (changelog) in the overview.
