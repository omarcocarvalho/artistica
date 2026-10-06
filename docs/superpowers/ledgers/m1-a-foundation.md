# SDD ledger — plan: docs/superpowers/plans/2026-10-03-m1-a-foundation.md

Spec: docs/spec.md + docs/superpowers/plans/2026-10-03-m1-overview.md (contracts, Ruled CRs, Execution notes). Owner approved M1 plans 2026-10-04; all owner Qs = recommendations.

## Pre-flight scan
Done before execution by the cross-plan consistency review (34 findings across A–E: 2 blocking, 17 important, 15 minor). All fixed in plan text or ruled in overview (CR-E*, CR-C*, CCR-A*, CR-B*, CCR-D*, CR-X1..X8, Execution notes). A-specific: #3 buttonClasses (fixed in A9/A12), #22 stale CR text (fixed), #33 E2E ports 4101–4103 (fixed), Q8 defaultUnitForLocale (fixed). No open conflicts within A: tasks own disjoint files per A's Parallelization section.

## Rulings
- Ruling A-1: per-task PR + worktree, waves per A's Parallelization; implementers open PRs, never merge; controller enables auto-merge after a clean review — consistent with M0 practice and CLAUDE.md — if wrong: an extra step per task.
- Ruling A-2: E2E ports for A: 4101 (A6), 4102 (A7), 4103 (A12); other ports for B–E.

## Progress
A1: dispatched (sonnet), worktree .worktrees/m1-a1, branch chore/m1-deps, BASE 84ce19c
A1: implementer DONE 21d0e6c (PR #14), 8/8 green; removed pnpm-workspace.yaml (eslint exclusion expired); review dispatched (sonnet)
A1: review ✅ approved; minor (deferred): npm-view currency re-check skipped (pins accepted by release-age check)
A1: complete (21d0e6c, merged PR #14)
A2: dispatched (sonnet) .worktrees/m1-a2 chore/m1-tooling BASE 3abc9fb
A3: dispatched (sonnet) .worktrees/m1-a3 feat/m1-model BASE 3abc9fb
A4: dispatched (sonnet) .worktrees/m1-a4 feat/m1-i18n BASE 3abc9fb
Note: zsh doesn't word-split 'set -- $x'; a stray local branch refs/heads/origin/master was created and deleted (remote-tracking ref untouched)
A3: implementer DONE e2a8a2d (PR #15), 8/8 green
A4: implementer DONE 781f89f (PR #16), 8/8 green
A2: implementer DONE 837ae6d (PR #17), 8/8 green
A4: review ✅ approved
A4: minor (deferred): navigator detection step untested; dead vi.unstubAllGlobals; concurrent first-init window; unvalidated lang cast in resources.ts
A4: complete (781f89f, PR #16 auto-merge enabled)
A3: review ✅ approved
A3: minor (deferred): 'rotating twice' test near-vacuous (plan-mandated); arb lacks NaN gutter/bleed; defaultUnitForLocale single '_' replace
A3: complete (e2a8a2d, merged PR #15)
A2: review ✅ approved
A2: minor (deferred): eslint node globals for scripts/** (E6 adds scripts/); dom project ignores tsx tests outside src/; regex-based worker-setup test
A2: complete (837ae6d, merged PR #17)
A5: dispatched (sonnet) .worktrees/m1-a5 feat/m1-settings BASE cfbdc18
A7: dispatched (sonnet) .worktrees/m1-a7 feat/m1-design-tokens BASE cfbdc18 (E2E 4102)
Note: use scratchpad/merge.sh N to merge (shows auto-merge errors; PR17 auto-merge silently failed once)
A7: implementer DONE d61553d (PR #20), 8/8 green; no RED run (tests+code together)
A7: review ✅ approved
A7: minor (deferred): light-token drift test lacks size guard; Icon has no <title> option; reduced-motion lacks transition-duration
A7: minor → forwarded to A9–A11: :focus-visible border-radius squares shapes; body>* z-index may affect Radix portals
A7: complete (d61553d, merged PR #20)
A9: dispatched (sonnet) .worktrees/m1-a9 feat/m1-ui-basics BASE cf8e2be
A10: dispatched (sonnet) .worktrees/m1-a10 feat/m1-ui-forms BASE cf8e2be
A11: dispatched (sonnet) .worktrees/m1-a11 feat/m1-ui-overlays BASE cf8e2be
A5: implementer DONE_WITH_CONCERNS (PR #19), 8/8 green; initialUnitFromNavigator signature → rest tuple (CI vs local navigator)
A5: review ✅ approved; deviation accepted (rest-tuple initialUnitFromNavigator)
A5: minor (deferred, triage at final): setPageSetup patch with explicit undefined overwrites base → invalid PageSetup (strip undefined or re-parse); idempotence untested; partial saved state falls back to mm not locale unit; warnOnce test noise
A5: complete (c37cc31, merged PR #19)
A6: dispatched (sonnet) .worktrees/m1-a6 feat/m1-i18n-lint BASE deea979 (E2E 4101); + scripts/** node globals (A2 minor)
A10: implementer DONE 527342b (PR #21), 8/8 green; no report file (controller transcribed); no RED run
A9: implementer DONE_WITH_CONCERNS 4f33865 (PR #22), 8/8; removed base.css focus border-radius line; added .sr-only; no RED run
A11: implementer DONE_WITH_CONCERNS (PR #23), 8/8; explicit position:fixed + focus radius in overlays.css; no RED run
A6: implementer DONE 1b18540 (PR #24), 8/8
Ruling A-3: after A6 merges, run gh pr update-branch on A9–A11 PRs so their CI runs with the i18n lint rule before merging (strict:false would otherwise let them land unchecked) — if wrong: one extra CI cycle
A9: review ✅ approved; deviations accepted (base.css focus radius line removed; .sr-only added)
A9: minor (deferred): Chip onClick override via rest spread; Callout role overridable; reduced-motion indeterminate bar looks like 40%; ProgressBar class string not via cx; visual check vs design not done (owner at sign-off); cleanup redundant :focus-visible radius overrides in forms/overlays css
A9: complete (4f33865, merged PR #22)
A10: review — 1 Important (NumberField aria-valuetext) → fix round 1 dispatched (resume implementer) + Enter preventDefault
A11: review — 3 Important (tooltip z-index under dialog; 44px tab/close targets; overlay warning/description tests) → fix round 1 dispatched
A11: note for E (e2e): focus return after Esc/X, focus trap, scroll lock, 44px targets at mobile viewport, tooltip-in-dialog visible, axe with dialog open
Ruling A-4: PRs approved later get gh pr update-branch before merge when an earlier merge could affect them (i18n lint, shared CSS) — supersedes A-3 ordering
A6: review ✅ approved (rule verified: no false positives on role/type/aria/className/data-*)
A6: minor (deferred): main.tsx no .catch fallback if initI18n fails (plan-mandated)
A6: complete (updated with A9, CI green, merged PR #24)
A10: fix round 1/5 pushed 1120836 (aria-valuetext + Enter preventDefault); scoped re-review dispatched
A8: dispatched (sonnet) .worktrees/m1-a8 feat/m1-theme BASE 4675a49
A10: fix round 1/5 (2 addressed, 0 open; 527342b..1120836)
A10: minor (deferred): stepMm below display precision does nothing; missing tests for aria-valuenow/min/max, custom stepMm, disabled Slider/Select
A10: complete (merged PR #21 after update-branch + green CI)
A11: fix round 1 pushed (merged origin/master + 2 commits); scoped re-review dispatched
Note for E3 (phone flow): A9 .ds-btn--icon is 32px; phone step flow needs ≥44px targets (design README) — E3 must size icon buttons up on coarse pointers or use .ds-dialog__close-style 44px rule
A8: implementer DONE f263d33 (PR #25), 8/8
A11: fix round 1/5 (3 addressed, 0 open)
A11: minor (deferred): Dialog/BottomSheet ~25 duplicated lines; tab badge/underline hard-coded colour (no dark mode); spies restored after assertions; per-Tooltip Provider
A11: complete (merged PR #23 after update-branch)
A12: dispatched (sonnet) .worktrees/m1-a12 feat/m1-ui-barrel (E2E 4103)
A8: review ✅ approved
A8: minor (deferred): renderHook not explicitly unmounted in test
A8: complete (merged PR #25 after update-branch)
A12: implementer DONE 252a1c9 (PR #26), 8/8; barrel also exports parseDecimal, ICON_NAMES
A12: review ✅ approved; prop table gaps corrected in scratchpad/m1-ui-props.md
A12: complete (merged PR #26)
A: ALL 12 TASKS COMPLETE. Ruling A-5: single M1-wide final whole-branch review at end of M1 (covers A's deferred minors) instead of a per-sub-plan final review — avoids 5 overlapping reviews — if wrong: A-specific issues found later
