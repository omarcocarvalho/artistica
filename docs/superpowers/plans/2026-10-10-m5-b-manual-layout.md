# M5-B: Manual Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In an explicit **Arrange** mode, the user can drag a photo to another place or another page, drop it on another photo to swap them, and resize it by its corner, with the mouse, by touch or from the keyboard. A **Re-run auto layout** button goes back to the automatic layout. Manual edits are explicit state layered over the deterministic auto layout, so the same photos, settings and edits always give the same pages, and the preview still equals the PDF.

**Architecture:** A manual layout is plain data, `ManualLayout`: one `ManualBlock` per photo copy (page, top-left corner, tile width, turned), keyed by `blockId = ${imageId}#${copy}` (M5-R7). The layout worker gains one optional argument: `computeLayout(setup, items, manual?)`. With no manual layout it is the M1–M4 engine, byte for byte. With one, it **reconciles** the manual layout against the current photos and settings (drop, refit, pack new photos around the arranged ones, M5-R14) and returns an ordinary `LayoutResult` plus a `manual` outcome. The edit operations (`moveBlock`, `swapBlocks`, `resizeBlock`, `moveToPage`) are pure functions on `ManualLayout`, run on the main thread for instant feedback and validated with the same rule as the packer (M5-R9). The arrange store keeps the manual layout and an undo stack in memory only. The renderers and `buildPageModels` don't change.

**Tech Stack:** TypeScript 6, zustand 5, React 19 Pointer Events, Comlink, Vitest 5, fast-check 4, Playwright 1.63 (mouse, touchscreen, keyboard). No new dependencies (no drag-and-drop library, M5-R1).

**Spec:** `docs/spec.md` §2.4 (manual layout in M5, Q19; determinism; groups pack together, R6), §2.5 (preview = PDF), §2.12 (keyboard, WCAG 2.2 AA), §3 (reliability), §8 M5 **and** the overview (M5-R7–R19; Shared contracts → Manual layout; questions Q5–Q9). **Design:** `design/arrange.html` and the Arrange part of `design/mobile-flow.html` (added by E1; there was no mockup before M5). WCAG 2.2 SC 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 2.4.11 Focus Not Obscured, 4.1.2, 4.1.3.

## Global Constraints

As in the overview. E2E ports 66xx (B1 6601 … B6 6606). `src/features/layout/manual*.ts` are under the existing `src/features/layout/**` coverage glob. Pure modules (`manual.ts`, `manual-ops.ts`, `manual-reconcile.ts`) have no DOM access.

## Review Focus

1. **The auto path is unchanged.** `computeLayout(setup, items)` and `computeLayout(setup, items, null)` give results deep-equal to master's, and `golden.test.ts` is unchanged.
2. **Every manual result is valid:** blocks inside the content box, trim boxes at least the gutter apart, every block's tiles on one page (property test over random operation sequences).
3. **Determinism:** the same `(setup, items, manual)` gives a deep-equal result in any input order (property).
4. **Preview = PDF after edits:** E2E B-X1 compares the preview hit areas, the PDF image placements and the crop marks for an arranged layout.
5. **WCAG 2.5.7:** every drag (move, swap, resize, move to another page) has a keyboard path **and** a single-pointer path (tap, then a button). E2E B-D6 and B-P3 do each without a drag.
6. **No photo data persisted:** the manual layout and the undo stack never reach `localStorage`, a preset or a file (it holds image ids, so it is session state).

## File map

| File | Task | Purpose |
|---|---|---|
| `src/features/layout/manual.ts` (+ tests) | B1 | `ManualLayout`, `ManualBlock`, `blockIdOf`, `manualFromLayout`, `layoutFromManual`, `isValidPlacement`, `MIN_MANUAL_SHORT_MM` |
| `src/features/layout/manual-ops.ts` (+ tests, property tests) | B1 | `moveBlock`, `swapBlocks`, `resizeBlock`, `moveToPage`, `nudge`, results with a refusal reason |
| `src/features/layout/manual-reconcile.ts` (+ tests) | B2 | `reconcileManual` (M5-R14), `packAround` |
| `src/features/layout/compute-layout.ts`, `worker-api.ts`, `layout-client.ts`, `types.ts`, `index.ts` | B2 | the optional `manual` argument and the `manual` outcome |
| `src/app/arrange-store.ts` (+ test) | B3 | `useArrange`: mode, manual layout, undo stack |
| `src/app/pipeline.ts`, `src/app/effects/PipelineEffect.tsx`, `src/app/pages-store.ts` (+ tests) | B3 | manual layout in, outcome and notes out |
| `src/locales/en/preview.json` | B3, B4 | arrange strings |
| `src/features/render/components/ArrangeLayer.tsx`, `use-block-drag.ts`, `arrange.css` (+ tests) | B4 | blocks, handles, pointer and keyboard |
| `src/features/render/components/PagePreview.tsx` | B4 | renders `ArrangeLayer` in Arrange mode, the tile buttons otherwise |
| `src/app/slots/PreviewSlot.tsx`, `src/app/components/ArrangeToolbar.tsx` (+ tests) | B4 | toolbar: Arrange, Undo, Re-run auto layout, Move to page, Swap, Width |
| `src/app/mobile/MobileFlow.tsx`, the phone Preview step | B5 | Arrange on the phone |
| `e2e/arrange.spec.ts`, `e2e/support/arrange.ts` | B5 (phone), B6 (desktop and exit) | E2E |

---

### Task B1: Manual layout model and operations

**Branch:** `feat/layout-manual-model` · **PR title:** `feat(layout): add the manual layout model and its edit operations` · **Depends on:** —

- [ ] **Step 1: Failing tests** (`manual.test.ts`, `manual-ops.test.ts`, node):
  - `blockIdOf(item)` is `${imageId}#${copy}`, where `copy` is the number after `#` in the item key (`'abc~0#2'` → copy 2);
  - `manualFromLayout(result, items, setup)` then `layoutFromManual(manual, items, setup)` gives back `result` deep-equal, except that `scaled-to-fit` is not carried over (a manual size is the user's choice): tiles via `tileRects`, `low-dpi` recomputed as `tileW > maxPrintWidthMm + EPS_MM`, placements sorted as `assemble` sorts them;
  - `isValidPlacement` (M5-R9): inside the content box; gutter-inflated boxes (right and bottom, as `packPages`) disjoint from every other block on that page; tile short side ≥ `MIN_MANUAL_SHORT_MM` (20 mm, lowered as in the overview's ruling B1-1; none for fixed sizes); table of 12 cases including touching at exactly the gutter (valid) and 0.01 mm closer (invalid);
  - `moveBlock(m, id, page, x, y)` returns `{ ok: true, manual }` or `{ ok: false, reason: 'overlap' | 'outside' }`; a valid move changes only that block;
  - `nudge(m, id, dx, dy)` moves by whole millimetres and stops at the last valid position on the way (it never jumps over another photo): `reason: 'blocked'` when it cannot move at all;
  - `resizeBlock(m, id, tileW, anchor)` keeps the aspect; `anchor` is the corner that stays put (`'tl' | 'tr' | 'bl' | 'br'`); it clamps to the minimum and to the largest valid size along the way (`reason: 'min' | 'blocked'` when unchanged); a fixed-size block is refused (`'fixed'`, M5-R12);
  - `swapBlocks(m, a, b)` (M5-R11): each block takes the other's box, fitted inside it (largest tile width at either turn, ties keep the current turn), anchored at the box's top-left; a fixed-size block keeps its size and the swap is refused (`'does-not-fit'`) when it does not fit the other box;
  - `moveToPage(m, id, page)` places the block on that page at its current size, at the spot `findSpot(…, 'bssf', 'free')` picks among the page's free rects; `page === pageCount` makes a new page; `reason: 'does-not-fit'` when no spot holds it;
  - empty pages are removed and pages renumbered after every operation (M5-R16);
  - every operation is pure (the input is deep-frozen in tests).
  `manual-ops.property.test.ts` (fast-check): from a valid manual layout, any sequence of up to 30 random operations leaves it valid (M5-R9), and refused operations return the input unchanged (same object).
- [ ] **Step 2: RED, implement, GREEN.** Reuse `occupy`, `findSpot` (`maxrects.ts`), `blockSize`, `tileRects`, `maxFitTileWidth` (`geometry.ts`). Validity uses the `packPages` invariant (inflated boxes disjoint inside the bin grown by the gutter), so the packer and the manual checks cannot disagree.
- [ ] **Step 3: Pre-PR command (6601), PR.**

---

### Task B2: Reconciling manual edits in the engine

**Branch:** `feat/layout-manual-reconcile` · **PR title:** `feat(layout): keep manual edits through photo and setting changes` · **Depends on:** B1

- [ ] **Step 1: Failing tests** (`manual-reconcile.test.ts`, `compute-layout.test.ts`):
  - `computeLayout(setup, items)` and `computeLayout(setup, items, null)` equal master's results for every golden case (the golden snapshot file is unchanged);
  - `reconcileManual` (M5-R14), one test per row of the M5-R14 table:
    - a block whose photo copy is gone is dropped; the gap stays (no other block moves);
    - a new item (a photo or copy added) is packed around the arranged blocks: existing pages first, then new pages; its size is the size the auto search gives the new items alone on an empty page of this setup, scaled down until it fits the free space, but never below `MIN_MANUAL_SHORT_MM`; else it goes on a new page (`packAround`);
    - an item whose aspect or tile count changed (crop, rotation, study versions) is refitted inside its old block box, anchored at the box's top-left, at the larger of its two turns; a fixed-size item keeps its size if it fits there, else it is packed again like a new item;
    - a fixed size changed in the edit sheet: the block takes the new size at its corner if valid, else is packed again;
    - paper, custom size or orientation changed (the page size differs from `manual.pageSize`): the manual layout is dropped and the auto layout returned, `outcome: { kind: 'dropped', reason: 'paper' }`;
    - safe area, gutter, crop marks or bleed changed (the content box or gutter differs): kept when every block is still valid (`outcome: { kind: 'kept' }`), else dropped (`reason: 'no-longer-fits'`);
    - no item left: `outcome: { kind: 'dropped', reason: 'empty' }`;
  - `the reconciled layout is valid` and `deterministic in any item order` (property);
  - `the outcome's manual layout is manualFromLayout(result)`, so the arrange store can keep it as the new state.
  `worker-api.test.ts` and `layout-client.test.ts`: the worker API and the latest-call-wins client pass `manual` through; a superseded call still rejects with `AbortError`.
- [ ] **Step 2: RED, implement, GREEN.** `computeLayout(setup, items, manual?: ManualLayout | null): LayoutResult` keeps its return type and adds an optional `manual?: ManualOutcome` field to `LayoutResult` (absent on the auto path, so auto results stay deep-equal).
- [ ] **Step 3: Pre-PR command (6602), PR.**

---

### Task B3: Arrange state and the pipeline

**Branch:** `feat/app-arrange-state` · **PR title:** `feat(app): wire manual layout into the pipeline` · **Depends on:** B1, B2

- [ ] **Step 1: Failing tests** (`arrange-store.test.ts`, `pipeline.test.ts`, `PipelineEffect.test.tsx`):
  - `useArrange` holds `{ mode: boolean, manual: ManualLayout | null, undo: ManualLayout[] }`, never persisted (no `persist`; `privacy.test.ts` lists its keys as memory-only);
  - `apply(op)` runs a `manual-ops` function on the current manual layout (or on `manualFromLayout(usePages.layout)` when there is none yet, M5-R8), pushes the previous state onto `undo` (at most `MAX_UNDO` = 50), and returns the refusal reason when refused (nothing pushed);
  - `undoLast()` restores the previous state; with an empty stack it does nothing;
  - `rerunAuto()` sets `manual: null` and clears `undo`; `clear` of the images store (Remove all) does the same;
  - the pipeline passes `manual` to `deps.layout(setup, items, manual)`; the memo key includes it (`JSON.stringify([setup, items, manual])`);
  - a pipeline result with `manual.kind === 'kept'` or `'adjusted'` replaces the store's manual layout with the outcome's (so later edits start from what is shown), without pushing undo;
  - `kind === 'dropped'` sets `manual: null`, clears undo, and posts a notice through `useNotices` (M5-R14): `paper` → "The paper changed, so the photos were arranged automatically again."; `no-longer-fits` → "Your arrangement no longer fits the new margins, so the photos were arranged automatically again."; `empty` → no notice;
  - `describePage` and the export use `usePages` exactly as before (no change; a test pins that an arranged layout reaches `ExportSlot` unchanged).
- [ ] **Step 2: RED, implement, GREEN.**
- [ ] **Step 3: Pre-PR command (6603), PR.**

---

### Task B4: Arrange on the page (desktop, pointer and keyboard)

**Branch:** `feat/preview-arrange` · **PR title:** `feat(render): drag, swap and resize photos on the page` · **Depends on:** B3, D1, E1 (mockup)

- [ ] **Step 1: Failing tests** (`ArrangeLayer.test.tsx`, `ArrangeToolbar.test.tsx`, `use-block-drag.test.ts`, happy-dom with synthetic pointer events):
  - **Toolbar** (in `PreviewToolbar`): a toggle button "Arrange" (`aria-pressed`), "Undo" (disabled with an empty stack), "Re-run auto layout" (disabled while the layout is automatic); Re-run asks "Re-run auto layout? Your moves and size changes will be lost." with "Re-run" and "Cancel" (owner Q6 default), then announces "Photos arranged automatically.";
  - **Outside Arrange mode** the preview is exactly M4's (tile buttons select; pinned by the existing `PagePreview` tests);
  - **In Arrange mode** each block (a photo copy with all its study versions, R6) is one focusable element, `role="button"`, `aria-roledescription="movable photo"`, named "portrait.jpg, 120 × 160 mm, page 1", with `aria-describedby` pointing at the instructions ("Use the arrow keys to move, Shift and the arrow keys to resize, Enter to swap with another photo."), and the tile buttons are not rendered; Tab order is reading order across pages;
  - **Pointer move:** pointer down on a block, move ≥ 4 px (a smaller move is a click that selects), the ghost follows the pointer in mm (`previewScale` px per mm), pointer up commits `moveBlock`; while the ghost overlaps another block's centre the target is outlined and pointer up commits `swapBlocks`; an invalid spot shows the ghost in the danger colour and pointer up returns it with the announcement "Can't place it there: it would overlap another photo." (or "…it would go past the margin."); Esc cancels a drag; `pointercancel` cancels;
  - **Snapping (pointer only):** an edge within 2 mm of a content-box edge or of another block's edge plus the gutter snaps to it;
  - **Across pages:** dropping over another page's sheet commits `moveBlock` on that page at the drop point (falls back to `moveToPage` placement when the point is invalid);
  - **Resize:** the selected block shows four corner handles (CSS 12 px, hit area 24 × 24 px; 44 × 44 px on coarse pointers, WCAG 2.5.8); dragging one resizes with the opposite corner fixed; a fixed-size photo shows no handles and its description adds "Fixed size: change it in Edit.";
  - **Keyboard** (focus on a block): Arrow keys `nudge` 1 mm; Shift + Arrow keys resize by 1 mm of tile width (Right and Down grow, Left and Up shrink, top-left fixed), as the crop editor (spec §2.2); Enter or Space picks the block up for a swap ("Picked up portrait.jpg. Move to another photo and press Enter to swap, or Escape to cancel."), Enter on another block swaps, Esc cancels; Delete does nothing; each committed change announces the new state once in one polite region ("portrait.jpg, 118 × 157 mm, page 1, 12 mm from the left, 30 mm from the top."); a refused step announces its reason once and repeats nothing while the key is held;
  - **Single-pointer alternatives** (WCAG 2.5.7), in the toolbar for the selected block: "Move to page" (a select of "Page 1 … Page N" and "New page"), "Swap with…" (a select of the other photos by name and page), and "Width" (a number field in the user's unit, applied on Enter or blur through `resizeBlock`);
  - **Focus:** after any operation focus stays on the moved block (re-found by `blockId` after the re-render); after a refused drop it returns to the block; the focused block is scrolled into view and not hidden under the sticky toolbar (WCAG 2.4.11);
  - **Performance:** a drag never runs the pipeline or redraws the canvas until pointer up (the ghost is a CSS transform; test: no `computeLayout` call and no `drawPage` call during 50 pointer moves).
- [ ] **Step 2: RED, implement, GREEN.** `touch-action: none` only on blocks and handles in Arrange mode, so the page can still be scrolled from the gaps.
- [ ] **Step 3: Visual check** against `design/arrange.html` (light, dark, forced colours; 1280 px), screenshots in the PR.
- [ ] **Step 4: Pre-PR command (6604), PR.**

---

### Task B5: Arrange on the phone

**Branch:** `feat/mobile-arrange` · **PR title:** `feat(app): arrange photos on the phone` · **Depends on:** B4

- [ ] **Step 1: Failing tests** (`MobileFlow.test.tsx`, `ArrangeToolbar.test.tsx`):
  - the Preview step has the Arrange toggle, Undo and Re-run auto layout in a toolbar under the pages (44 px), as `design/mobile-flow.html` (E1);
  - in Arrange mode the page carousel does not change page while a block is dragged (`touch-action: none` on blocks; the carousel's snap scrolling still works from the gaps and the page dots);
  - moving to another page on the phone uses "Move to page" (dragging across a horizontal carousel is not offered: the drop target is off screen);
  - the toolbar's "Swap with…" and "Width" are a bottom sheet for the selected block.
- [ ] **Step 2: RED, implement, GREEN.**
- [ ] **Step 3: E2E** in `e2e/arrange.spec.ts` (mobile-chromium, mobile-webkit), all with the strict network guard:
  - **B-P1** touch drag a block (`page.touchscreen` / CDP touch events on chromium; WebKit through `dispatchEvent` of pointer events with `pointerType: 'touch'`), the PDF matches the preview;
  - **B-P2** controls and handles ≥ 44 × 44 px; axe in Arrange mode, light and dark;
  - **B-P3** every operation without a drag: tap a block, then "Move to page", "Swap with…", "Width";
  - **B-P4** a long press does not open the browser's image menu or select text on a block (`-webkit-touch-callout: none`, `user-select: none`).
- [ ] **Step 4: Pre-PR command (6605), PR.**

---

### Task B6: Manual layout E2E and exit check (desktop)

**Branch:** `test/e2e-arrange` · **PR title:** `test(e2e): manual layout, preview equals PDF and keyboard-only arranging` · **Depends on:** B4

All tests install the strict network guard; chromium, firefox and webkit.

- [ ] **B-X1 preview = PDF after edits:** 6 photos (two with 3 study versions), move one, swap two, resize one, move one to page 2; the PDF's image placements (`e2e/support/pdf.ts`) equal the preview's hit areas within 0.01 mm; crop marks in the PDF match `cropMarksForTiles` for the arranged tiles; lines and guides follow the moved tiles.
- [ ] **B-D1 determinism:** the same photos and the same operation script in two fresh contexts give byte-identical PDFs (no CreationDate, D-2).
- [ ] **B-D2 re-run:** Re-run auto layout (confirm) gives the auto layout's PDF byte for byte (as before any edit).
- [ ] **B-D3 photos added and removed (M5-R14):** arrange, add 2 photos (they fill free space and then a new page; arranged blocks don't move), remove one arranged photo (a gap stays).
- [ ] **B-D4 settings:** change the gutter within what fits (arrangement kept), raise the safe area until a block no longer fits (notice, automatic again), change the paper (notice, automatic again), change study versions of an arranged photo (refitted in its box).
- [ ] **B-D5 refusals:** drop onto the margin, resize into a neighbour, swap a fixed-size photo that doesn't fit: each refused with its announcement, nothing changes, Undo stays as it was.
- [ ] **B-D6 keyboard only:** Tab to Arrange, arrange with arrows, Shift + arrows, Enter-swap and the toolbar selects; focus is visible and not obscured at every step; the announcements in order (`e2e/support/app.ts` `liveRegionLog`); axe in Arrange mode (light, dark) and forced colours (chromium).
- [ ] **B-D7 timing:** with 20 photos, a committed move updates the preview in < 200 ms (performance marks of M5-R27; CI bound 1000 ms, recorded).
- [ ] Pre-PR command (6606), PR.

---

## Contract change requests

None yet.

## Open questions for the owner

Q5 (the arrange model), Q6 (what happens to edits when photos or settings change; re-run confirmation), Q7 (undo), Q8 (fixed-size photos), Q9 (arranged photos past 300 DPI) in the overview.
