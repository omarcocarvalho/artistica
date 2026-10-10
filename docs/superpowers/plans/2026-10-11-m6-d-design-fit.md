# M6-D: Design, CJK and Long-Text Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The mockups M6 needs (the language switcher on desktop and phone, the landing footer's language links, CJK type specimens), CJK text that uses each language's own fonts and breaks lines correctly, and the tools that prove every screen fits in every language: a pseudo-locale, a hard-coded-text probe, an overflow probe, and the screen capture with its contact sheet.

**Architecture:** D1 adds static mockups under `design/` in the existing style. D2 is CSS only: per-language `:lang()` blocks in the theme (M6-R17, R18). D3 adds `src/shared/i18n/pseudo.ts` (M6-R14), `e2e/support/l10n.ts` (the probes), `e2e/l10n.spec.ts` (the probes in required CI) and `e2e/screens.spec.ts` with `scripts/screens-index.ts` (capture and contact sheet, run on demand). D3 merging is the English string freeze (M6-R13).

**Tech Stack:** HTML/CSS mockups; CSS (`:lang()`, `line-break`, `word-break`); TypeScript 6; Vitest 5; Playwright 1.63 with `@axe-core/playwright`. No new dependencies.

**Spec:** `docs/spec.md` §2.12 (look and feel; WCAG 2.2 AA), §8 M6 ("check that CJK text fits and renders correctly"), review round 1 D4 and D5, `design/README.md` question 5 **and** the overview (M6-R14, R15, R17, R18, R21, R26; questions Q1, Q4, Q11, Q17).

## Global Constraints

As in the overview. E2E ports 74xx (D1 7401 … D3 7403). D2 adds no `@font-face` and no font file.

## Review Focus

1. **Han glyphs from the right font** (D2): a `zh-CN` page resolves to a Chinese font before any Japanese one; a `ja` page the reverse; `ko` to a Korean font.
2. **The probes can fail** (D3): each probe is shown to catch a planted problem (a literal string, an overflowing chip) before it is trusted.
3. **The freeze is clean** (D3): after D3 every visible string in the app is a key (the pseudo probe passes on every screen of the set).

## File map

| File | Task | Purpose |
|---|---|---|
| `design/language.html`, `design/type-cjk.html`, `design/landing.html`, `design/mobile-flow.html`, `design/index.html`, `design/README.md` | D1 | mockups |
| `src/shared/theme/tokens.css`, `src/shared/theme/base.css`, `src/shared/ui/css/*.css` (+ `tokens.test.ts`, `src/shared/theme/cjk.test.ts`) | D2 | font stacks, line breaking, overflow-wrap in controls |
| `src/shared/i18n/pseudo.ts` (+ tests), `src/shared/i18n/load.ts` (the `?pseudo=1` path) | D3 | pseudo-locale |
| `e2e/support/l10n.ts`, `e2e/l10n.spec.ts`, `e2e/screens.spec.ts`, `e2e/support/screens.ts`, `scripts/screens-index.ts` (+ test), `playwright.config.ts` (screens excluded by default), `package.json` (`e2e:screens`) | D3 | probes, capture, contact sheet |

---

### Task D1: Mockups for M6

**Branch:** `docs/m6-mockups` · **PR title:** `docs: add the M6 mockups for the language switcher and CJK text` · **Depends on:** —

- [ ] **Step 1: `design/language.html`:** the top bar with the language select on desktop (globe and endonym, before the theme toggle, as `workspace.html:25-26` placed it) and at phone width (globe only, 44 px), the open native list (drawn as a static list with each endonym in its own `lang`), a failed-load toast; the top bar in Japanese and in Italian to show the longest labels.
- [ ] **Step 2: `design/landing.html`:** the footer's "Language" list of seven links (M6-R21), the current one marked; at phone width it wraps onto two lines.
- [ ] **Step 3: `design/type-cjk.html`:** a specimen per CJK language with the M6-R17 stacks: a heading, body text, a button row, a chip, a segmented control, a phone step label, at desktop and phone size, light and dark; a paragraph showing `line-break: strict` (no 。 or 、 at a line start) and Korean `keep-all`; with sample strings the B1 glossary proposes.
- [ ] **Step 4: `design/mobile-flow.html`:** the phone top bar with the globe.
- [ ] **Step 5:** `design/index.html` links the new pages; `design/README.md` lists them and closes open question 4 (picker placement, answered by D4 and M6) and question 5 (CJK uses system fonts, M6-R17). Mockups make no network request (open them with the network off).
- [ ] **Step 6: Approval:** the controller reviews the mockups against M6-R15, R17, R18, R21 and records "approved under the owner's delegation, <date>" in the PR and the ledger.

---

### Task D2: Each language's fonts and line breaking

**Branch:** `feat/ui-cjk-type` · **PR title:** `feat(ui): use each language's fonts and line breaking` · **Depends on:** D1

- [ ] **Step 1: Failing tests** (`src/shared/theme/cjk.test.ts`, node, parsing the CSS as `tokens.test.ts` does):
  - `the shared --font-ui and --font-display stacks name no CJK font`;
  - `:lang(ja) puts Hiragino Sans before any Chinese or Korean font`; `:lang(zh-CN) puts PingFang SC before any Japanese font`; `:lang(ko) puts Apple SD Gothic Neo first among CJK fonts` (each list as M6-R17, checked in order);
  - `in each CJK block --font-display and --font-hand fall back to the language's sans`;
  - `ja and zh-CN set line-break: strict; ko sets word-break: keep-all; each sets overflow-wrap: anywhere and font-synthesis: none`;
  - `buttons, chips, tabs and segmented options allow overflow-wrap: anywhere`;
  - the existing `tokens.test.ts` ("family names differ on purpose", line 48) still passes; update its expectations for the shared stacks.
- [ ] **Step 2: RED, implement, GREEN.**
- [ ] **Step 3: E2E** (`e2e/l10n.spec.ts` is D3's; D2 adds `e2e/cjk-type.spec.ts`, chromium and webkit): for `ja`, `ko` and `zh-CN`, with `<html lang>` set by the test (`document.documentElement.lang = …` before render, since translations come later), the computed `font-family` of the body, an `h1` and a `.ds-btn` starts with the Latin family and lists the language's first CJK font next; a long sample string in a chip wraps instead of overflowing (D3's probe logic copied in a small helper until D3 lands, then shared).
- [ ] **Step 4: Visual check** in Safari and Chrome on macOS at desktop and phone width for the three CJK languages and one Latin one, light and dark, against `design/type-cjk.html`; screenshots in the PR.
- [ ] **Step 5: Pre-PR command (7402), PR.**

---

### Task D3: Pseudo-locale, hard-coded text and overflow probes, screen capture

**Branch:** `test/i18n-pseudo-probes` · **PR title:** `test(i18n): find hard-coded text and overflow with a pseudo-locale` · **Depends on:** A1, A3, A5

- [ ] **Step 1: Failing tests** (`pseudo.test.ts`, node): `wraps in ⟦…⟧`, `accents Latin letters`, `pads ×2 / ×1.8 / ×1.4 by length`, `keeps {{variables}}, {{count, number}}, <0>…</0> and $t() intact` (the A4 variable and tag comparison passes between English and pseudo), `pseudoResources keeps every key and plural suffix`; `load.test.ts`: `?pseudo=1 loads the pseudo resources lazily and never saves a language`.
- [ ] **Step 2: RED, implement, GREEN.**
- [ ] **Step 3: Probes** (`e2e/support/l10n.ts`): `setLanguage(page, code | 'pseudo')`; `findUntranslated(page, allow)`: visible text nodes, `aria-label`, `aria-description`, `aria-valuetext`, `title`, `placeholder` and `alt`, each must contain `⟦` unless it matches the allow-list (numbers and formatted quantities, `Artistica`, file names, photo names, endonyms in the switcher); `findOverflow(page)`: every element with text whose `scrollWidth > clientWidth + 1` or `scrollHeight > clientHeight + 1` while its computed `overflow` hides it, or whose text box extends past its nearest bordered ancestor, excluding scrollers and `.sr-only`; `labelInName(page)`: each control's visible text is inside its accessible name. **Self-test first** (`e2e/support-selfcheck.spec.ts`): a planted literal string and a planted overflowing chip are each reported.
- [ ] **Step 4: `e2e/l10n.spec.ts`** (required CI, chromium and mobile-chromium; firefox, webkit and mobile-webkit run the first two screens): for the pseudo-locale, walk the screen set of `e2e/support/screens.ts` (the list of M6-R26, shared with the capture spec; states built in English with the existing helpers, then `setLanguage(page, 'pseudo')`, and states whose text is produced at an event, such as notices and errors, triggered again after the switch, M6-R16): no untranslated text, no overflow at desktop and phone width, label in name. The spec reads `E2E_LANG` (default: pseudo only), so a translation task runs the same walk in its language (B2–B7 Step 4).
- [ ] **Step 5: Fix what the probes find** in the same PR when it is small (a literal in a `.ts` file, a missing `overflow-wrap`, ≤ 50 lines in total); anything larger becomes its own fix task, listed in the ledger, before the freeze.
- [ ] **Step 6: Capture** (`e2e/screens.spec.ts`, skipped unless `E2E_SCREENS=1`; `corepack pnpm e2e:screens` sets it and runs chromium and mobile-chromium): for each language in `E2E_LANG` (default: every available language) and each screen of the set, a full-page PNG at `screens/<screen>/<code>-<desktop|phone>.png` (gitignored); `scripts/screens-index.ts` writes `screens/index.html`: one row per screen, the languages side by side, desktop and phone, with the screen's description, no external resource. `scripts/screens-index.test.ts` checks the HTML for a given file list.
- [ ] **Step 7: Record the freeze:** the PR body says "English string freeze (M6-R13) starts at this merge"; the controller writes the merge commit in the ledger.
- [ ] **Step 8: Pre-PR command (7403), PR.**

---

## Contract change requests

None yet.

## Open questions for the owner

Q1 (switcher), Q4 (CJK fonts), Q11 (CJK headings and accents), Q17 (endonyms) in the overview.
