# M6-B: Translations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app UI and the landing page in Portuguese (Brazil), Spanish (neutral), Italian, Japanese, Korean and Chinese (Simplified), written by Claude (spec R9) with one terminology, one register per language, and text that fits.

**Architecture:** B1 writes the rules every translator follows: a style guide (register, punctuation, numbers, key names), a glossary of artist and print terms per language, a context file saying where each key appears and how much room it has, and the privacy-claims list (M6-R23). B2–B7 each add one language: `src/locales/<code>/*.json` (ten namespaces), `landing/locales/<code>.json`, and that language's stamps in `src/locales/translated-from.json`. They start from the frozen English (M6-R13) and run in parallel; nothing else changes.

**Tech Stack:** JSON locale files, the A4 locale check, D3's probes, Playwright screenshots. No new dependencies; no translation service (M6-R27).

**Spec:** `docs/spec.md` §2.10 (languages; R9, R10) **and** the overview (M6-R9–R13, R23, R27; questions Q2, Q13, Q16).

## Global Constraints

As in the overview. E2E ports 72xx (B1 7201 … B7 7207). A translation task changes only its own language's files and its own object in `translated-from.json`; an English problem found while translating is reported to the controller, never fixed in a B task (freeze, M6-R13).

## Review Focus

1. **Meaning, not words:** every string says what the English says, at the same strength; the privacy claims in particular neither soften nor strengthen (M6-R23).
2. **The glossary is followed** for every term in it, in every namespace and on the landing page.
3. **The register is one** (Q2) across the whole language.
4. **It fits:** D3's overflow probe passes in the language at desktop and phone width; tight keys (context file) stay within their limit.
5. **The check is clean:** keys, variables, `<n>` tags, plural categories (pt-BR, it, es need `_many`; ja, ko, zh-CN only `_other`), stamps.

## File map

| File | Task | Purpose |
|---|---|---|
| `docs/i18n/README.md` | B1 | how the translations are made and how to propose a correction |
| `docs/i18n/style-guide.md` | B1 | register, punctuation, numbers, capitalisation, key names, length, per language |
| `docs/i18n/glossary.md` | B1 | terms per language, with "do not translate" |
| `docs/i18n/context.md` | B1 | where each key appears; tight keys with a length limit |
| `docs/i18n/privacy-claims.md` | B1 | the numbered privacy claims and the tests behind each |
| `src/locales/<code>/*.json`, `landing/locales/<code>.json`, `src/locales/translated-from.json` | B2–B7 | one language each |

---

### Task B1: Style guide, glossary and string context

**Branch:** `docs/i18n-style-glossary` · **PR title:** `docs: add the translation style guide, glossary and string context` · **Depends on:** —

- [ ] **Step 1: `style-guide.md`**, one section per language plus common rules:
  - **Common:** sentence case as in English; keep the English UI's plain, short voice; product names and file formats untranslated (`Artistica`, `PDF`, `JPG`, `PNG`, `WebP`, `GIF`, `HEIC`, `MediaPipe`, `MIT`, `GitHub`, ISO paper sizes); keyboard key names as printed (Shift, Ctrl, ⌘, Page Up, Page Down, Enter, Esc; Q16); variables and `<n>` tags never translated or reordered across tags; no numbers written into strings (they come formatted, M6-R7); plural forms per M6-R9 with `_zero` where count 0 reads wrong.
  - **pt-BR:** você; imperative in the 3rd person for buttons and instructions ("Adicione fotos"); “curly quotes”; Brazilian vocabulary (arquivo, tela, celular → prefer "telefone" in UI text).
  - **es:** tú; neutral Latin American vocabulary, no *vos*, no Spain-only words (ordenador, móvil); “curly quotes”; opening ¿ and ¡.
  - **it:** tu; «caporali» quotes; imperatives in the 2nd person ("Aggiungi foto").
  - **ja:** です・ます in sentences; buttons as short noun or verb forms ("写真を追加", "PDF を作成"); full-width 。、「」！？; a half-width space between Japanese and Latin words or numbers is not used (no spaces); katakana for loanwords per the glossary.
  - **ko:** 해요체 in messages, short noun forms on buttons ("사진 추가"); spaces between words as in normal Korean; half-width punctuation.
  - **zh-CN:** 你; full-width ，。：“”！？; no spaces between Chinese and numbers or Latin words except around product names where the glossary says so.
  - **Length:** a tight key (context file) stays within its stated limit; other strings aim for the English length + 30% in pt-BR, es and it.
- [ ] **Step 2: `glossary.md`**: a table per term with en, pt-BR, es, it, ja, ko, zh-CN, a definition and a source note (art-education or print-industry usage), covering at least: reference photo, sheet, page, paper, safe area, gutter, bleed, crop marks, trim, DPI, low resolution, scaled to fit, study, value(s) / tonal value, value study, blur / squint study, hue, ramp, composition lines, rule of thirds, grid, diagonals, armature, golden ratio, golden spiral, centre lines, guides, edge outline, face construction lines, pose figure, landmarks (not shown), preset, arrange, swap, re-run auto layout, undo, crop, rotate, flip, copies, fixed size, export, create PDF, download, import, paste, link, offline, model download. Starting proposals to confirm or correct with sources in the PR:

  | en | pt-BR | es | it | ja | ko | zh-CN |
  |---|---|---|---|---|---|---|
  | bleed | sangria | sangrado | abbondanza | 塗り足し | 도련 | 出血 |
  | crop marks | marcas de corte | marcas de corte | segni di taglio | トンボ | 재단선 | 裁切标记 |
  | safe area | margem de segurança | margen de seguridad | margine di sicurezza | 安全マージン | 안전 여백 | 安全边距 |
  | gutter (between images) | espaço entre imagens | espacio entre imágenes | spazio tra le immagini | 画像の間隔 | 이미지 간격 | 图片间距 |
  | value study | estudo de valores | estudio de valores | studio dei valori tonali | 明度スタディ | 명도 스터디 | 明暗习作 |
  | values | valores (tonais) | valores (tonales) | valori tonali | 明度 | 명도 | 明暗层次 |
  | blur (squint study) | desfoque | desenfoque | sfocatura | ぼかし | 흐림 | 模糊 |
  | composition lines | linhas de composição | líneas de composición | linee di composizione | 構図線 | 구도선 | 构图线 |
  | face construction lines | linhas de construção do rosto | líneas de construcción del rostro | linee di costruzione del volto | 顔のアタリ線 | 얼굴 구조선 | 面部结构线 |
  | preset | predefinição | ajuste predefinido | preimpostazione | プリセット | 프리셋 | 预设 |
  | arrange | organizar | organizar | disponi | 配置 | 배치 | 排列 |
  | DPI | DPI | DPI | DPI | DPI | DPI | DPI |

- [ ] **Step 3: `context.md`**: generated by a small script in the PR's scratch (not committed) from the English E2E screen captures and a `git grep` of each key's call sites, then written by hand: per namespace, each key's screen, its control type, and a limit in characters for tight keys (top-bar buttons, tabs, phone step labels, segmented options, chips, badges); English screenshots of each screen attached as links to the CI artifact of the PR.
- [ ] **Step 4: `privacy-claims.md`**: the numbered claims (M6-R23) as they will read after C2, each with the test file and test name that backs it (`e2e/privacy.spec.ts`, the strict network guard `e2e/support/network-guard.ts`, `e2e/offline.spec.ts`, the host audit); `README.md` explains how translations are made (Claude, R9), the files, the check and stamps, and how a native speaker proposes a fix (issue or PR; re-stamp after editing).
- [ ] **Step 5: Approval:** the controller reviews B1 and records "approved under the owner's delegation, <date>" in the ledger. B2–B7 wait for it.

---

### Tasks B2–B7: One language each

| Task | Branch | PR title | Language |
|---|---|---|---|
| B2 | `feat/i18n-pt-br` | `feat(i18n): add Portuguese (Brazil)` | `pt-BR` |
| B3 | `feat/i18n-es` | `feat(i18n): add Spanish` | `es` |
| B4 | `feat/i18n-it` | `feat(i18n): add Italian` | `it` |
| B5 | `feat/i18n-ja` | `feat(i18n): add Japanese` | `ja` |
| B6 | `feat/i18n-ko` | `feat(i18n): add Korean` | `ko` |
| B7 | `feat/i18n-zh-cn` | `feat(i18n): add Chinese (Simplified)` | `zh-CN` |

**Depends on (each):** B1 (approved), A3, A4, A5, C2, D3 (the freeze commit recorded in the ledger). The six run in parallel from the same master commit.

Steps for one language (`<code>`):

- [ ] **Step 1: Failing check.** Create `src/locales/<code>/` with the ten namespace files copied from English and every value emptied, and `landing/locales/<code>.json` likewise: `corepack pnpm i18n:check` fails with `empty` for every key (record the count in the PR). Add the language's sample test `src/locales/<code>.test.tsx`: renders `TopBar`, `PageSetupPanel`, `StudiesPanel`, `PresetsDialog` (with presets) and `ExportPanel` (ready) in `<code>` and asserts no English word from a list of 30 frequent English UI words appears, and that the plural keys give the right form for 0, 1, 2, 5 and 1,000,000 (a table written by the translator).
- [ ] **Step 2: Translate**, namespace by namespace, following the style guide, the glossary and the context file; then the landing JSON (title, description, how-to, features, FAQ, privacy claims, footer, theme labels, share-image texts).
- [ ] **Step 3: Stamp and check:** `corepack pnpm i18n:stamp <code>`, then `corepack pnpm i18n:check` clean; review every `sameAsEnglish` warning (keep only terms the glossary keeps in English).
- [ ] **Step 4: Fit and leaks in the language:** run D3's probes for `<code>` (`E2E_LANG=<code> corepack pnpm e2e e2e/l10n.spec.ts --project=chromium --project=mobile-chromium`, ports 72x2 per task): no overflow, no untranslated text, axe clean. A string that overflows is shortened (never the CSS changed in a B task; a layout that can't hold any reasonable translation is reported to the controller as a D-fix).
- [ ] **Step 5: Self-review with screenshots:** run `E2E_LANG=<code> corepack pnpm e2e:screens` (the capture spec and contact sheet come from D3), read every screen, fix what reads wrong, and attach the contact sheet artifact to the PR.
- [ ] **Step 6: Back-translation note in the PR:** every privacy claim and 40 keys spread over every namespace, back-translated into English by the implementer, side by side with the English source.
- [ ] **Step 7: Pre-PR command (72x), PR.** The reviewer is a fresh agent working in that language (overview, "Execution → Translation reviews").

---

## Contract change requests

None yet.

## Open questions for the owner

Q2 (register per language), Q13 (native-speaker review), Q16 (key names) in the overview.
