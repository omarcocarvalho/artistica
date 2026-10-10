# M5-C: Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every accessibility item deferred to M5 by the M1–M4 ledgers, then run a fresh WCAG 2.2 AA audit of the whole app, including the new Presets dialog and Arrange mode, and fix what it finds.

**Architecture:** Fixes stay in the shared UI (`src/shared/ui/**`) and the few app components that own the announcements. The audit (C3) adds E2E checks that would have caught the deferred items: axe `incomplete` results are reviewed and allow-listed by rule and target, not ignored; a keyboard walk covers every screen; forced colours are checked on every control family.

**Tech Stack:** React 19, Radix `RadioGroup`, CSS, Testing Library, Playwright 1.63 with `@axe-core/playwright` 4.13. No new dependencies.

**Spec:** `docs/spec.md` §2.12 (WCAG 2.2 AA, keyboard only, visible focus, correct ARIA), §7 (axe on each screen), `CLAUDE.md` (every screen gets an axe scan) **and** the overview (M5-R24–R26; "Deferred items: triage"). Ledgers: `m2.md` "Deferred" (forced-colours leftovers), `m3.md` "Deferred" (Up/Down arrows, role-less spans), `m4.md` "Final review", part 3 notes ("Updating layout…" with each guide result; reduced-motion progress), `m1-a-foundation.md` A7/A9/A11 minors.

## Global Constraints

As in the overview. E2E ports 67xx. A fix that changes a shared component lists every usage site in its PR (`git grep`), with a check of each.

## Review Focus

1. **Arrow keys:** the segmented controls follow the ARIA radio pattern on all four arrows, and Home and End select (C1). No usage regresses (five sites).
2. **One announcement per change:** a line or guide change is announced once, by its own panel, not also by "Updating layout…" (C2, M5-R24).
3. **The audit checks `incomplete`:** an `incomplete` result fails unless its rule and target are on the reviewed allow-list with a reason (C3).

## File map

| File | Task | Purpose |
|---|---|---|
| `src/shared/ui/SegmentedControl.tsx`, `forms.css` (+ tests) | C1 | Up/Down/Home/End; forced-colours underline |
| `src/features/images/components/ImageList.tsx` (+ test) | C2 | role-less `aria-label` spans |
| `src/app/slots/PreviewSlot.tsx`, `src/app/use-delayed-flag.ts` (+ tests) | C2 | "Updating layout…" only when slow (M5-R24) |
| `src/shared/ui/ProgressBar.tsx`, `src/shared/ui/css/basics.css` (+ tests) | C2 | indeterminate bar under reduced motion (M5-R25) |
| `src/shared/ui/Callout.tsx`, `src/app/components/NoticeRegion.tsx` (+ tests) | C2 | live regions mounted before their content |
| `src/shared/ui/css/overlays.css` | C2 | the selected-tab underline in dark mode and forced colours |
| `e2e/support/axe.ts`, `e2e/a11y.spec.ts`, `e2e/a11y-audit.spec.ts` | C3 | the audit |
| `src/features/images/crop-step.ts`, `components/CropEditor.tsx` (+ tests), `e2e/crop-single-pointer.spec.ts`, `design/image-edit.html`, `design/mobile-flow.html`, `src/shared/ui/ModalSurface.tsx` | C4 | crop without dragging (2.5.7, Q21) |

---

### Task C1: Segmented controls on all four arrows

**Branch:** `fix/a11y-segmented-arrows` · **PR title:** `fix(ui): move segmented controls with all four arrows, Home and End` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`forms.test.tsx`):
  - `ArrowDown and ArrowRight select the next option; ArrowUp and ArrowLeft the previous; both wrap` (the ARIA APG radio group pattern);
  - `Home selects the first enabled option and End the last` (today they only move focus);
  - `disabled options are skipped by every key`;
  - `Tab enters on the checked option and leaves the group` (roving tabindex unchanged);
  - `in RTL, Left and Right swap; Up and Down don't` (`dir="rtl"` on a wrapper);
  - `forced colours: the checked option has no accent underline` (computed `box-shadow: none` under `forced-colors: active`, M2 deferred item).
- [ ] **Step 2: RED, implement, GREEN.** Radix drops Up/Down for `orientation="horizontal"`, so the root takes `orientation={undefined}` (Radix then handles all four) and an `onKeyDown` handles Home/End by calling `onValueChange` for the focused option; or the control handles the keys itself and keeps Radix for the roving tabindex. Pick the smaller change and say which in the PR.
- [ ] **Step 3:** check the five usage sites (`PageSetupPanel` units and orientation, `LinesPanel` spiral corner, `ImageEditSheet` size mode and axis) by a test each, or the existing ones extended.
- [ ] **Step 4: Pre-PR command (6701), PR.**

---

### Task C2: Announcements, labels and motion

**Branch:** `fix/a11y-announcements` · **PR title:** `fix(app): announce layout updates only when slow, and label image details` · **Depends on:** —

- [ ] **Step 1: Failing tests:**
  - `ImageList.test.tsx`: the pixel size, copies and low-DPI details have no `aria-label` on a role-less element; each is plain text with a `VisuallyHidden` expansion ("4032 × 3024 pixels", "3 copies", "Low resolution for its print size"), and the visible short text is `aria-hidden`, so a screen reader reads each once;
  - `PreviewSlot.test.tsx` (M5-R24): the status region says "Updating layout…" only when the layout has been computing for `UPDATING_ANNOUNCE_DELAY_MS` (500 ms); a run that ends sooner announces nothing; a run that announced says "Layout updated." when it ends; `aria-busy` is unchanged (immediate);
  - `ProgressBar.test.tsx` (M5-R25): under `prefers-reduced-motion: reduce` the indeterminate fill spans the whole track with a static stripe pattern and the class `ds-progress__fill--indeterminate-static`, never a partial width;
  - `Callout.test.tsx`, `NoticeRegion.test.tsx`: a live callout's region element is mounted (empty) before its message is inserted, so the first message is announced in Safari and VoiceOver (the M1 #70 rule applied to `Callout live` and error toasts);
  - `overlays.css` (a computed-style test in `basics.test.tsx`): the selected-tab underline uses `currentColor` or a token, not a hard-coded hex, so it follows dark mode and forced colours.
- [ ] **Step 2: RED, implement, GREEN.** `use-delayed-flag.ts` is a small hook (a timer started when the flag turns on, cleared when it turns off).
- [ ] **Step 3: E2E update:** tests that waited for "Updating layout…" (`grep -rn "preview.updating\|Updating layout" e2e`) wait for `aria-busy` instead.
- [ ] **Step 4: Pre-PR command (6702), PR.**

---

### Task C3: The M5 accessibility audit

**Branch:** `test/a11y-audit` · **PR title:** `test(e2e): the M5 accessibility audit` (fix PRs as needed) · **Depends on:** A4, B5, B6, C1, C2, E3, E4

The audit is a fresh pass, by a reviewer who did not build the UI, against WCAG 2.2 AA. It records each criterion's result in the M5 ledger ("Accessibility audit"), with the evidence.

- [ ] **Step 1: Make axe stricter** (`e2e/support/axe.ts`): `expectNoA11yViolations` also fails on `incomplete` results unless the rule id and target selector are on `REVIEWED_INCOMPLETE` (each entry has a reason, e.g. `color-contrast` on text over the page canvas image, which axe can't compute). The allow-list starts empty; each entry is added with the reviewer's check in the PR.
- [ ] **Step 2: Every screen and state** (`e2e/a11y-audit.spec.ts`, chromium, firefox, webkit; phone on mobile-chromium and mobile-webkit; light and dark): empty state; images with every badge; the edit dialog in each size mode; Page tab with bleed, custom paper and the gutter note; Studies with each version; Lines with every line and guide state reachable without a real detection; the Presets dialog in each state (A3); Arrange mode with a picked-up block and a refusal (B4, B5); the export dialog in each state; the phone inline export (E3); the landing page; the new logo (E4) as an image with a name.
- [ ] **Step 3: Criteria axe can't check,** each a test or a recorded manual check:
  - 2.1.1 / 2.1.2 keyboard walk of every screen with no trap (a Tab loop test per screen: every interactive element is reached, and focus comes back to the start);
  - 2.4.7 / 2.4.11 / 2.4.13 focus visible, not obscured by the sticky top bar, toolbars or the phone footer (bounding-box test at every Tab stop), and the focus ring at least 2 px with 3:1 contrast;
  - 2.5.7 every drag has an alternative (Arrange, crop editor, sliders): listed with the alternative's test id;
  - 2.5.8 targets ≥ 24 × 24 px on desktop, ≥ 44 × 44 px on phones (owner H1) for every control (a scan of every `button, input, select, [role=slider], [role=switch], [role=radio], a` in each state);
  - 1.4.10 reflow at 320 px wide with no horizontal scroll (existing 320 px test extended to every phone step and dialog); 1.4.12 text spacing (inject the WCAG spacing CSS: no clipped text);
  - 1.4.11 non-text contrast of the Arrange ghost, handles and the danger outline (computed colours against the page);
  - 4.1.3 status messages: the live-region log for a scripted session (add photos, change a study, toggle a line, arrange, apply a preset, export) has each expected message once and nothing else;
  - forced colours (chromium emulation) on every control family, Arrange included;
  - 1.3.4 orientation: the phone flow works in landscape.
- [ ] **Step 4: Screen reader pass (manual, recorded):** VoiceOver on macOS Safari for desktop and the Presets dialog and Arrange mode (rotor, announcements, roledescription). The iPhone VoiceOver pass is on the v1.0.0 sign-off checklist (overview).
- [ ] **Step 5: Fixes:** each finding is fixed in this PR when small (≤ 50 lines), else in its own `fix:` PR with a failing test first; each is listed in the ledger with its PR.
- [ ] **Step 6: Pre-PR command (6703), PR.**

---

### Task C4: Move and resize the crop without dragging

**Branch:** `fix/crop-single-pointer` · **PR title:** `fix(images): move and resize the crop without dragging` · **Depends on:** C3 (added by the controller after the C3 audit found the 2.5.7 gap; Q21, accepted default)

WCAG 2.5.7: in the edit dialog the crop box moves and resizes only by dragging or by the arrow keys. Under the crop, a group "Crop position and size" adds single-pointer buttons, like Arrange's Position group (B4, B5).

- [ ] **Step 1: Failing tests:**
  - `crop-step.test.ts`: `stepCrop(crop, step, { pxW, pxH, ratio, view })` is one `keyboardStep` in the displayed frame for each of `left`, `up`, `down`, `right` (move) and `narrower`, `wider`, `shorter`, `taller` (resize, displayed top-left fixed); it keeps a locked shape, stops at the image edge and at the minimum size, follows rotation and flips, and (property) always returns a valid crop, the same one for the same inputs; `cropStepForKey` maps arrows and Shift + arrows to those steps.
  - `CropEditor.test.tsx`: the group holds "Position" (Move left, up, down, right) and "Size" (Narrower, Wider, Shorter, Taller) as plain buttons outside the draggable area; each click commits once; each button gives exactly the crop its key gives, over four views and three ratios; the status readout announces the new crop as for a key press.
- [ ] **Step 2: RED, implement, GREEN.** The keyboard handler and the buttons both call `stepCrop`, so the two paths cannot disagree. Buttons are `IconButton`s: 32 px on desktop, 44 px on coarse pointers and the phone layout (`basics.css`).
- [ ] **Step 3: E2E** `e2e/crop-single-pointer.spec.ts`: clicks alone on desktop (three engines) and taps alone on both phones move and resize the crop with no drag and no key, at ≥ 24 px and ≥ 44 px; the buttons give the same crop as the keys; axe clean in light and dark.
- [ ] **Step 3b: Focus not obscured (2.4.11):** the taller crop area pushes the Copies field to the bottom of the phone edit sheet, where mobile WebKit leaves a focused text field under the footer; `ModalSurface`'s body scrolls a focused field into view (`block: 'nearest'`), with a unit test, and C3's phone keyboard walk passes.
- [ ] **Step 4: Mockups** `design/image-edit.html` and `design/mobile-flow.html` show the group.
- [ ] **Step 5: Pre-PR command (4781), PR.**

---

## Contract change requests

None yet.

## Open questions for the owner

None of its own. The audit may raise some; they go to the overview's "Questions for the owner" with a recommended default.
