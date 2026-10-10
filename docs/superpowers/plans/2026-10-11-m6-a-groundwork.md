# M6-A: i18n Groundwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app ready for six more languages before any translation lands: each language loads on demand, the right language is chosen (saved choice, landing hint, browser, English), numbers and units follow the language, every message is one key, the locale check guards every locale, and a language switcher sits in the top bar.

**Architecture:** `src/shared/i18n/` grows four pure modules (`match.ts`, `format.ts`, later D3's `pseudo.ts`) and one loader (`load.ts`); `init.ts` takes the resolved language. `src/app/main.tsx` resolves, loads, then renders. The locale check is a Node script in `scripts/` with a unit test, so the required `unit` job runs it. UI changes stay at the call sites; the switcher is one small component in the top bar.

**Tech Stack:** TypeScript 6, i18next 26 and react-i18next 17 (built-in `Intl` formatting), `Intl` APIs, Vite 8 (rolldown chunk groups), Vitest 5, fast-check 4, Playwright 1.63. No new dependencies (M6-R1).

**Spec:** `docs/spec.md` §2.10, §3 (bundle), §2.12 **and** the overview (M6-R3–R16, R25; Shared contracts → Language runtime, Formatting, Locale check, Paper names; questions Q1, Q5–Q8, Q17). **Design:** `design/workspace.html:25-26` (top-bar select), D1's phone placement.

## Global Constraints

As in the overview. E2E ports 71xx (A1 7101 … A5 7105). `src/shared/i18n/**` joins the coverage `include` (A1).

## Review Focus

1. **English stays synchronous; nothing else is in the initial chunks** (A1): `LOCALE_MARKERS` and the per-language chunk check; the boot never renders before the resolved language is loaded.
2. **The resolution order** (A1): saved > hint > browser walk > English; the hint is removed and never saved; `zh-TW` falls through.
3. **No hand-formatted number reaches the UI** (A2): the scan test, editable fields without grouping, `aria-valuenow` numeric.
4. **One key per message** (A3): no template literal or `+` joins two translated strings; `paperName` everywhere a paper is shown; file names unchanged.
5. **The locale check catches every problem kind** (A4), each pinned by a fixture.

## File map

| File | Task | Purpose |
|---|---|---|
| `src/shared/i18n/match.ts`, `load.ts`, `languages.ts`, `init.ts`, `resources.ts`, `index.ts` (+ tests) | A1 | matching, resolution, lazy loading, endonyms |
| `src/app/language.ts`, `src/app/main.tsx` (+ tests) | A1 | `?lang` hint, boot order, document language and title |
| `vite.config.ts` | A1 | locale chunk groups; coverage `include` |
| `scripts/bundle-budget.ts`, `scripts/check-bundle-budget.ts` (+ tests) | A1 | `LOCALE_MARKERS`, per-language chunk size |
| `src/shared/i18n/format.ts` (+ tests, `no-hand-format.test.ts`) | A2 | formatters |
| `NumberField.tsx`, `Slider` callers, `page-setup-logic.ts`, `ImageEditSheet.tsx`, `ImageList.tsx`, `preset-summary.ts`, `arrange-controller.ts`, `ArrangeToolbar.tsx`, `use-guide-status.ts`, `DownloadBox.tsx`, `ExportPanel.tsx`, `StudiesPanel.tsx`, `LinesPanel.tsx`, `GuidesSection.tsx` (+ tests); `src/locales/en/*.json` | A2 | call sites; `{{value}}` keys; `common:units` removed |
| `ThemeToggle.tsx`, `import-notices.ts`, `PageSetupPanel.tsx`, `GuidesSection.tsx`, `ExportSlot.tsx`, `PreviewSlot.tsx`, `src/features/page-setup/paper-name.ts` (+ tests); `src/locales/en/*.json` | A3 | one key per message; paper names |
| `scripts/check-locales.ts` (+ `check-locales.test.ts`, fixtures under `scripts/__fixtures__/locales/`), `src/locales/translated-from.json`, `package.json` scripts | A4 | the locale check and stamps |
| `src/app/components/LanguageSelect.tsx`, `TopBar.tsx` (+ tests), `src/locales/en/app.json`, `e2e/language.spec.ts`, `e2e/support/l10n.ts` | A5 | the switcher; home link per language |

---

### Task A1: Load each language on demand and follow the browser language

**Branch:** `feat/i18n-lazy-locales` · **PR title:** `feat(i18n): load each language on demand and follow the browser language` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`match.test.ts`, `load.test.ts`, `init.test.ts`, `src/app/language.test.ts`):
  - `matchLanguage maps every tag of M6-R4` (table: `pt` → pt-BR, `pt-PT` → pt-BR, `PT_br` → pt-BR, `es-MX` → es, `es-419` → es, `it-CH` → it, `ja-JP` → ja, `ko-KR` → ko, `en-GB` → en, `zh` → zh-CN, `zh-SG` → zh-CN, `zh-Hans-HK` → zh-CN, `zh-TW` → null, `zh-Hant` → null, `fr` → null, `''` → null);
  - `matchLanguage walks the list in order` (`['zh-TW', 'ja']` → ja; `['fr', 'de']` → null);
  - `resolveLanguage: saved beats hint beats browser beats English` (table) and a property (fast-check over arbitrary strings: the result is always in `LANGUAGES`; a non-null saved value is always the result; an invalid hint is ignored);
  - `loadLanguage adds every namespace before resolving`, `is idempotent` (the loader is called once), `resolves at once for en`, `rejects when a chunk fails`;
  - `setAppLanguage changes the language only after the load` (`languageChanged` fires after `addResourceBundle` for every namespace) and `returns 'failed' and keeps the language when the load fails`;
  - `readLangHint returns the ?lang value and removes it with replaceState, keeping other params and the hash`;
  - `installDocumentLanguage sets lang, dir and the translated title on every change` (happy-dom document);
  - `initI18n no longer reads navigator through the detector` (the `i18next-browser-languagedetector` import is gone from `init.ts`).
- [ ] **Step 2: RED, implement, GREEN.** `resources.ts`: an eager glob for `../../locales/en/*.json` and a lazy glob `['../../locales/*/*.json', '!../../locales/en/*.json']`; `load.ts` groups the lazy loaders by language. `main.tsx`: `resolveLanguage({ saved, hint: readLangHint(location, history), browser: navigator.languages ?? [navigator.language] })` → `initI18n({ language })` (loads it; on failure falls back to `en`, logs nothing, M6-R5) → `installDocumentLanguage` → render. The error toast of M6-R5 is for the switcher path (`setAppLanguage` returning `failed`), shown by A5. Add `app:documentTitle` ("Artistica app") and `app:language.loadFailed` to `en`; remove `pageTitle`'s English argument from `main.tsx` (`app-info.ts` keeps `APP_NAME`). `ENDONYMS` and `OG_LOCALES` in `languages.ts`.
- [ ] **Step 3: Chunks and budget.** `vite.config.ts`: a rolldown chunk group per language (`/src\/locales\/(pt-BR|ja|ko|it|es|zh-CN)\//` → `locale-<code>`); record the option name used and why in the PR. `scripts/bundle-budget.ts`: `LOCALE_MARKERS`: the check reads every chunk whose name starts `locale-` and fails if any of its string literals longer than 12 characters appears in an initial chunk (so it needs no hand-kept list and works for each language as it lands); and `localeChunkViolations`: each `locale-*` chunk ≤ 15 KB gzip. `bundle-budget.test.ts` covers both with synthetic entries, since no translation exists yet. Record the initial JS figure in the PR (expected ≈ 229.5 KB).
- [ ] **Step 4: E2E** (`e2e/language.spec.ts`, new). Until the translation tasks merge, no non-English chunk exists in the production build E2E runs against, so A1's E2E covers what exists: LANG-D1 `an English browser gets English and lang="en"`; LANG-D2 `?lang=xx is ignored and removed from the URL`; LANG-D3 `?lang=en is removed and not saved` (storage holds no `language`); LANG-D4 `a zh-TW browser falls through to English`; LANG-D5 `a pt-BR browser gets English while Portuguese has no strings` (the matcher's result is filtered by `availableLanguages()`, A5 contract). The unit tests above cover every matching row. E1 adds the per-language cases once the chunks exist (L10N-1…7) and LANG-P1 (first-paint delay).
- [ ] **Step 5: Pre-PR command (7101), PR.** The PR lists the bundle figures before and after.

---

### Task A2: Format numbers and units for the language

**Branch:** `feat/i18n-format` · **PR title:** `feat(i18n): format numbers and units for the language` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`format.test.ts`, `format.property.test.ts`, `no-hand-format.test.ts`):
  - `formatLength` table for all seven languages against Node's `Intl` (e.g. `(12.5, 'mm', 'pt-BR')` → `12,5 mm`; `(38.1, 'in', 'pt-BR')` → `1,5 pol.`; `(12.5, 'mm', 'zh-CN')` → `12.5毫米`; `(12.5, 'mm', 'ko')` → `12.5mm`; `(1200, 'mm', 'pt-BR')` → `1.200 mm` for display), each expected string written out in the test (not computed by the code under test);
  - `formatLengthValue never groups` (`1200` mm → `1200` in pt-BR, it, es, en) and uses the language's decimal separator;
  - `parseDecimal(formatLengthValue(x, unit, lng)) equals roundForUnit(mmToUnit(x))` for every language (property over 0–1200 mm, both units);
  - `unitLabel` (`mm`, `in`, `pol.`, `毫米`, `英寸`), `formatPercent(50, 'es')` → `50 %`, `formatMegabytes(4_200_000, 'it')` → `4,2 MB`, `formatDegrees(45, 'ja')`;
  - `formatters are cached` (the same `Intl.NumberFormat` instance for the same language and options; spy on the constructor);
  - `joinSentences` joins with the language's key;
  - `no-hand-format.test.ts`: scans `src/**/*.{ts,tsx}` except tests and `format.ts` for `toFixed(` and `String(roundForUnit`; fails listing each hit.
- [ ] **Step 2: RED, implement `format.ts`, GREEN.**
- [ ] **Step 3: Call sites** (each with a behaviour test in a non-English language, using a hand-written fixture bundle for `pt-BR` added in the test with `addResourceBundle`, since real translations come later):
  - `NumberField`: shows `formatLengthValue`, suffix `unitLabel`, `aria-valuetext` `formatLength`; `aria-valuenow` unchanged;
  - `page-setup-logic.ts` `formatLength` moves to `format.ts` (callers updated); `ImageEditSheet.tsx:45-46` `fmt`; `ImageList.tsx:42` (`list.sizeFixed` gets `{{size}}`); `preset-summary.ts:24,45`; `arrange-controller.ts:75,178` and `ArrangeToolbar.tsx:95,241` (unit labels);
  - sliders: `studies.json` `blur.valueText` → `"{{value}}"` with `formatPercent`, `hueText` with `formatDegrees`; `lines.json` `detail.value`, `opacity.value` (`formatPercent`), `thickness.value` (`formatLength` in mm); megabytes: `use-guide-status.ts:51-53` `formatMb` → `formatMegabytes`, `lines.json` `guides.size`, `progress`, `progressSpoken` take preformatted values;
  - every `{{count}}` shown as a number becomes `{{count, number}}` in `en` (M6-R9);
  - remove `common:units.*` and `pageSetup:units.*` and their uses.
- [ ] **Step 4: E2E:** the existing suites pass unchanged in English (the English output is identical: `12.5 mm`, `50%`); add F-D1 to `e2e/language.spec.ts`: with the `pt-BR` test bundle unavailable in production, F-D1 checks English formatting of a custom paper of 1200 mm (`1200` in the field, no grouping) and that typing `12,5` into a field gives 12.5 mm.
- [ ] **Step 5: Pre-PR command (7102), PR.**

---

### Task A3: Build every message from one key and name papers per language

**Branch:** `fix/i18n-messages` · **PR title:** `fix(i18n): build every message from one key and name papers per language` · **Depends on:** A2

- [ ] **Step 1: Failing tests:**
  - `ThemeToggle.test.tsx`: the accessible name comes from `app:theme.changeLabel` with `{{current}}`, and contains the visible text (WCAG 2.5.3);
  - `import-notices.test.ts`: each notice is one key: `app:import.noImage` (title and message in one string), `app:import.animatedGif` (`{{name}}`), `app:import.failed` (`{{list}}`, `{{message}}`, where `{{list}}` is built with `Intl.ListFormat` plus `app:import.more`), `joinSentences` only where the two parts are reused elsewhere;
  - `GuidesSection.test.tsx`: the "none found" text is `guides.<kind>.noneWithHint`;
  - `paper-name.test.ts`: `paperName('A4', t)` → `A4`; `Letter`, `Legal`, `Tabloid`, `Custom` → `pageSetup:paper.name.*`;
  - `PageSetupPanel.test.tsx`: the paper options and the suggestion use `paperName`; the `.replace('…', '')` is gone (the select option keeps `paper.custom` "Custom…");
  - `ExportPanel.test.tsx` / `ExportSlot.test.tsx`: the summary shows `paperName`; the default file name still uses the id (`artistica-Custom-…`, M6-R25); `PreviewSlot` uses `paperName` instead of `app:preview.customPaper`;
  - a guard test `no-concatenated-messages.test.ts` scanning `src/**/*.{ts,tsx}` (tests excluded) for a template literal holding two `t(` calls or `t(…) +`, failing on each hit.
- [ ] **Step 2: RED, implement, GREEN.** Remove the keys that become unused (the check of A4 then has no dead keys to translate).
- [ ] **Step 3: Sweep:** `git grep -n -E '\$\{t\(|\)\} \$\{|t\([^)]*\) \+|\+ t\('` and the `i18n.t(` sites in `.ts` files (stores, controllers): every user-visible string is a key; list each site checked in the PR.
- [ ] **Step 4: E2E:** existing English assertions pass (the English texts are unchanged except where a sentence was joined differently; adjust assertions only where the PR lists the text change).
- [ ] **Step 5: Pre-PR command (7103), PR.**

---

### Task A4: Check every locale

**Branch:** `test/i18n-locale-check` · **PR title:** `test(i18n): check every locale for missing keys, variables and plural forms` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`scripts/check-locales.test.ts`, fixtures in `scripts/__fixtures__/locales/<case>/`): one fixture per `LocaleProblem.kind` (`missing-file`, `extra-file`, `missing`, `extra`, `empty`, `variables` (a renamed and a dropped `{{name}}`, a changed `{{count, number}}` format), `tags` (`<1>` lost), `plural-missing` (pt-BR without `_many`), `plural-extra` (ja with `_one`), `stale`); `_zero` allowed in any language; plural categories read from `Intl.PluralRules` (the test injects a fake for the table); `sameAsEnglish` lists equal values not on `SAME_AS_ENGLISH`; landing locales (`landing/locales/*.json`) checked the same way when the folder exists; `stamp` writes hashes for the given keys only and keeps the rest; the real repo passes (`checkLocales` over `src/locales` returns no problems: today only English exists).
- [ ] **Step 2: RED, implement, GREEN.** Hash = first 8 hex characters of SHA-256 of the English value. `src/locales/translated-from.json` starts as `{}`. `package.json` scripts `i18n:check` and `i18n:stamp`. Extend `src/shared/i18n/locales.test.ts` to run over every language folder (one file per namespace, camelCase keys).
- [ ] **Step 3: Pre-PR command (7104), PR.** The PR shows the output of `corepack pnpm i18n:check` on a broken copy (in scratch) and on master.

---

### Task A5: Choose the language in the top bar

**Branch:** `feat/app-language-switcher` · **PR title:** `feat(app): choose the language in the top bar` · **Depends on:** A1, D1

- [ ] **Step 1: Failing tests** (`LanguageSelect.test.tsx`, `TopBar.test.tsx`):
  - a native `<select>` labelled "Language" (`app:language.label`), options in `LANGUAGES` order with `ENDONYMS` text and a `lang` attribute each, the current language selected;
  - choosing an option calls `setLanguage(code)` and `setAppLanguage(code)`; focus stays on the select; while loading, the select is `aria-busy`;
  - a failed load shows the error toast `app:language.loadFailed`, keeps the old language and puts the select back on it;
  - phone width shows only the globe (the endonym is `hidden sm:inline` in a sibling, the select keeps its label); touch target 44 px (`touch:` variant);
  - the home link goes to `../` in English and `../<code>/` otherwise (`TopBar.tsx:28`).
- [ ] **Step 2: RED, implement, GREEN** against `design/workspace.html` and D1's phone and top-bar mockups. Place it before the theme toggle (as mocked).
- [ ] **Step 3: E2E** (`e2e/language.spec.ts`; helper `setLanguage(page, code)` in `e2e/support/l10n.ts`): LANG-S1 `the switcher saves the choice and a reload keeps it`; LANG-S2 `a saved choice beats ?lang`; LANG-S3 `keyboard only: Tab to the select, change it, focus stays`; LANG-S4 axe on the top bar at desktop and phone width, light and dark. A language whose chunk doesn't exist yet is not offered: the select lists `availableLanguages()` (the languages with a loader, plus `en`), so until the first translation merges it holds only English, and each translation task makes its language appear. LANG-S1–S3 use the first non-English language present and skip, with the reason in the skip message, while only English exists (B2–B7 then run them). Record the switch time (overview "Performance budgets") once a language exists (E1 asserts it).
- [ ] **Step 4: Pre-PR command (7105), PR.**

---

## Contract change requests

- **A5 (planned):** `availableLanguages(): readonly LanguageCode[]` in `src/shared/i18n/load.ts` (the codes with a lazy loader, plus `en`, in `LANGUAGES` order). Ruled in this plan, so the switcher never offers a language without strings.

## Open questions for the owner

Q1 (switcher), Q5 (paper names), Q6 (units), Q7 (landing hint), Q8 (Traditional Chinese), Q17 (endonyms) in the overview.
