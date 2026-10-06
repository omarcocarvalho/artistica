# SDD ledger — plan: docs/superpowers/plans/2026-10-03-m1-d-render.md

Spec: docs/spec.md + docs/superpowers/plans/2026-10-03-m1-overview.md (contracts, Ruled CRs, Execution notes). Owner approved 2026-10-04.
Pre-flight scan: done by cross-plan consistency review (34 findings, all fixed/ruled). Shared controller rulings: see A ledger (A-1 PR/worktree per task, controller merges after review; A-4 update-branch before merging when master moved under an approved PR).
Shared helpers: scratchpad/brief.sh (task IDs), scratchpad/merge.sh. E2E ports: B 42xx, C 43xx, D 44xx, E 45xx.

## Progress
D1: dispatched (sonnet) .worktrees/m1-d1 feat/render-page-model BASE 6e8df87
D1: implementer DONE 07b57ee (PR #35), 8/8; +fractional crop test
D1: review — 1 Important (safe-area property vacuous; mutation-proven) → fix round 1 dispatched. Minor: safeAreaRect negative w/h clamp; MIN-drop only caught by example test
D1: fix round 1 pushed (arbShrunkPage + MIN property, mutation-proven); re-review dispatched
D1: fix round 1/5 (addressed; mutation re-verified by reviewer)
D1: minor (deferred): clipping counter only counts drops not shortenings
D1: complete (merged PR #35)
D2: dispatched feat/render-pixels BASE 90b325f
D2: implementer DONE_WITH_CONCERNS (PR #41): fractional sourceRect kept (brief rounded) — matches ruling; tileRenderKey includes fractions
D2: review dispatched
D2: review — 3 Important (canvas cap exceeded after rounding; fractional forCroppedSource contract; vacuous bleed test) → Ruling D-1: worker crops integer-aligned superset via createImageBitmap(floor/ceil box); forCroppedSource returns that integer size + fractional src offset (pixel parity with preview) — fix round 1 dispatched (+ temp-canvas cap, try/finally release, trim<=0 guard)
D2: fix round 1 pushed 8c73e8c; re-review dispatched
D2: fix round 1 re-review — 3 addressed; cap tests not discriminating (mutation survived) → fix round 2 dispatched; NOTE for D4: export worker must use integerCropBox for createImageBitmap crop (no caller yet)
D2: fix round 2/5 (addressed; mutation re-verified by reviewer)
D2: minor (deferred): temp-canvas cap throws vs scale; see earlier list
D2: complete (merged PR #41)
D3: dispatched feat/render-pdf-compose BASE 935eae5
D5: dispatched feat/render-preview BASE 935eae5
D3: implementer DONE (PR #50); verbatim
D5: implementer DONE_WITH_CONCERNS 7276d95 (PR #52); previewScale clamps backing to MAX_CANVAS_AREA_PX
D3: review — 2 Important (mark coords/y-flip unpinned; draw order unpinned) → fix round 1 dispatched (+ inspector SMask double-count, no-date assertion). Ruling D-2: no CreationDate in PDFs (deterministic, privacy)
D5: review — 2 Important (draw effect deps on getBitmap identity; untested cache/token/width logic in components) → Ruling D-3: bitmaps exist for every id in model (images enter store post-decode) → getBitmap via ref, not a redraw trigger; documented in props — fix round 1 dispatched (+ DPR matchMedia, width/height only when changed). Minor: visual check owed (Step 13); 'missing' colour not from tokens
D3: fix round 1 pushed (2 commits); re-review dispatched
D5: fix round 1 pushed b02ffe7; re-review dispatched
D3: fix round 1/5 (addressed; alpha test bite verified)
D3: complete (merged PR #50)
D5: fix round 1/5 (addressed)
D5: NOTE for E7: PagePreview redraws only on model/scale/width/guides/DPR — bitmaps must exist for all ids in model (contract)
D5: minor (deferred): DPR removeEventListener not asserted
D5: complete (merged PR #52)
D4: dispatched feat/render-export BASE 6ab413c
D4: implementer dispatched (sonnet)
D4: implementer cut off by usage limit; PAUSED
D4: implementer DONE_WITH_CONCERNS 4bd17fe (PR #55); integerCropBox per D-1; worker chunk tree-shaken until D6/E9 wire it (verify then)
D4: review (opus) — pipeline correct, pdf-lib confined to worker chunk (wired build verified); 2 Important (D-1 unpinned: 3 mutations survive; abort reason not normalised → 'failed') → fix round 1 dispatched (+ progress final, messageerror, clone close, InvalidStateError→missing-image, filename trim). NOTE for E/final: peak memory ≈ store originals (20×48MB) + worker 80–180MB at save
D4: fix round 1 pushed (dd3a62f, 36f897c); re-review dispatched
D4: fix round 1/5 (addressed; 3 D-1 mutants killed by reviewer)
D4: minor (deferred): messageerror path untested (worker wrapper)
D4: complete (merged PR #55)
Task 6: dispatched feat/render-export-dialog BASE d2dbcef (E2E 4506)
Task 6: implementer DONE_WITH_CONCERNS (PR #60); no auto-start ('Create PDF' click); Download PDF is <a download>; visual check vs design/export.html not done (→ E13 manual/owner)
Task 6: review — 2 Important (stale-run callbacks unguarded; no focus/announce on done/error) → fix round 1 dispatched (+ tests, parent open=false cancel, icon, empty hint)
Task 6: fix round 1 pushed f941e17; re-review dispatched
Task 6: fix round 1/5 (addressed)
Task 6: minor (deferred): parent-close reset in render vs abort in effect — progress between them hits reset state (check reducer ignores progress when not running); visual/dark/keyboard check → E9/owner
Task 6: complete (merged PR #60)
SUB-PLAN D COMPLETE (D1–D6)
