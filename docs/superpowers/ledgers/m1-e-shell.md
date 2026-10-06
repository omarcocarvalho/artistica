# SDD ledger — plan: docs/superpowers/plans/2026-10-03-m1-e-shell.md

Spec: docs/spec.md + docs/superpowers/plans/2026-10-03-m1-overview.md (contracts, Ruled CRs, Execution notes). Owner approved 2026-10-04.
Pre-flight scan: done by cross-plan consistency review (34 findings, all fixed/ruled). Shared controller rulings: see A ledger (A-1 PR/worktree per task, controller merges after review; A-4 update-branch before merging when master moved under an approved PR).
Shared helpers: scratchpad/brief.sh (task IDs), scratchpad/merge.sh. E2E ports: B 42xx, C 43xx, D 44xx, E 45xx.

## Progress
E0: dispatched (sonnet) .worktrees/m1-e0 test/smoke-resilient BASE 8f166f3 (E2E 4500)
E1: dispatched (sonnet) .worktrees/m1-e1 feat/page-setup-panel BASE 09f3729 (E2E 4501)
E0: implementer DONE 856cc22 (PR #29), 8/8; font check via toHaveCSS (no DOM lib in e2e tsconfig)
E0: review ✅ approved
E0: minor (deferred): font check proves stylesheet, not Tailwind utilities
E0: complete (merged PR #29)
E1: implementer DONE 3b6572e (PR #32), 8/8; test sets unit mm after reset (locale)
E1: review ✅ approved
E1: minor (deferred): t('paper.custom').replace('…') coupling; thin tests (crop marks/orientation/gutter-off/bleed amount/no-undefined); notes grouped in Cutting section; weak invalid-input test; width>height swaps fields (by design)
E1: complete (merged PR #32)
E2: dispatched (sonnet) .worktrees/m1-e2 feat/app-shell BASE b21a485 (E2E 4502)
E5: dispatched (sonnet) .worktrees/m1-e5 feat/landing-seo BASE b21a485 (E2E 4505)
E5: implementer DONE 4f12984 (PR #37); Q9 wording; simplified hero art; created e2e/support/axe.ts
E2: implementer DONE 5e58df8 (PR #38); rounded-lg for missing sketch token; getState() in handlers
E2/E5: reviews dispatched
E5: review ✅ approved (pending merge — GitHub 504s)
E5: minor (deferred): axe helper lacks include/exclude/disableRules + readable failures (E4/E13); landing CTA test asserts app h1 'Artistica' (brittle); nav hidden on phones; no og:locale
E2: review — 2 Important (rounded-sketch premise wrong; top bar overflows at 320/360px) → fix round 1 dispatched
E2: minor (deferred): persistent live-region wrapper; hex colours in Logo (D11 ok)
E5: complete (merged PR #37)
E2: fix round 1 pushed fd7683c; re-review dispatched
E6: dispatched ci/bundle-budget BASE fca09c0
E2: fix round 1/5 (2 addressed)
E2: minor (deferred): 320px e2e compares scrollWidth to hard-coded 320 (use <= clientWidth)
E2: complete (merged PR #38)
E3: dispatched feat/app-mobile-flow BASE aff89d1 (E2E 4503)
E6: implementer DONE cac3a7d (PR #43); initial JS 109.8 KB gz
E6: review dispatched; E3: dispatched (sonnet)
E6: review ✅ approved (109.8 KB measured on real dist)
E6: minor (deferred): missing entry script with a matching modulepreload undercounts silently; relies on Vite modulePreload (comment); CLI exit paths untested
E6: complete (merged PR #43)
E3: implementer DONE_WITH_CONCERNS (PR #44): ResponsiveSheet renders Done itself (CR-X3) — NOTE for E8: don't add another Done; 44px rule in basics.css under (pointer: coarse),(max-width:959.98px) for all .ds-btn
E3: review ✅ approved (CR-X3 deviation justified; 44px CSS ok)
E3: minor (deferred → final review): form controls (inputs/selects/switches/tabs/chips) still 32px on phones vs design 44px (WCAG AA 24px met); min-width 44 on all text buttons; unused mobile.images.tapToEdit (E8); '0 images are ready' copy; narrow step-walk e2e
E3: complete (merged PR #44)
E4: dispatched feat/app-shell-e2e BASE 2cae5ae (E2E 4504)
E4: dispatched (sonnet)
E4: implementer DONE d585aa6 (PR #47); axe helper extended
E4: review ✅ approved
E4: minor (deferred): weak negative toHaveCount(0) check; axe not run on panel non-default states; dead axe options
E4: complete (merged PR #47)
E PART-1 COMPLETE (E0–E6)
E10: dispatched test/e2e-infrastructure BASE 6ab413c (E2E 4510)
E8: dispatched feat/app-images-wiring BASE 179d5fe (E2E 4508)
E10: implementer DONE_WITH_CONCERNS (PR #57); slot selectors unexercised until E7–E9; export dialog names from brief unverified; png Buffer copy fix
E10: review — 2 Important (network guard misses WebSockets; allow-list drops query) → fix round 1 dispatched. NOTE for E12/E13: export dialog selectors ('Create PDF' button, 'Download PDF' link/button, auto-start?) unverified until D6 — reconcile; AppPage desktop 'main figure' assumed
E10: fix round 1 pushed 59466fb; re-review dispatched
E10: fix round 1/5 (addressed)
E10: minor (deferred): #fragment in typed URL → false violation (strip hash)
E10: complete (merged PR #57)
E8: implementer DONE_WITH_CONCERNS 266442f (PR #58); openEdit action for E7; tapToEdit unused; stale toasts after clear() not filtered (needs C store generation)
E8: review dispatched (sonnet)
E8: review — 2 Important (hardcoded tooLarge limits vs C exports; PasteEffect untested) → fix round 1 dispatched. Minors deferred: stale notices after clear() (Minor; needs C generation); app.json prettier noise. OWNER NOTE: empty state uses compact dropzone (card variant duplicates EmptyState text) — mention at milestone
E8: fix round 1 pushed 2e7b4f5; re-review dispatched
E8: fix round 1/5 (addressed)
E8: minor (deferred → E11/final): phone focus after removing LAST image falls to body (no images panel); add fallback
E8: complete (merged PR #58)
E7: dispatched feat/app-pipeline-preview BASE e157328 (E2E 4507)
E7: implementer DONE (PR #61); PreviewToolbar exported from PreviewSlot for E9
E7: review (opus) ✅ approved
E7: minors (deferred → E9/final): sr list falls back to raw ImageId during remove window (plan-mandated); pipeline recreated per input change; no persistent error callout on layout failure; no SettingsSlot/PipelineEffect unit tests (A4=8 wiring)
E7: complete (merged PR #61)
E9: dispatched feat/app-export-leave-warning BASE c52d089 (E2E 4509)
E9: implementer DONE (PR #62); e2e exportPdf verified desktop+phone via temp spec; screenshots in e9-shots/
E9: review — 3 Important (returnValue missing [plan-mandated]; leave-warning tests miss cleanup/single listener; ExportSlot tests miss transitions/live getBitmap) → fix round 1 dispatched (+ close on 0 images, no-room flash, test hygiene). Visual vs design/export.html: structure matches, no Important mismatch
Ruling: leave-page handler sets returnValue='' in addition to preventDefault — spec privacy (memory-only images) requires the prompt on all target browsers — cost if wrong: one deprecated-API line
E9: fix round 1 pushed 997e9fb; re-review dispatched
E9: fix round 1/5 (addressed)
E9: complete (merged PR #62)
E11: dispatched test/e2e-import BASE 0e4f36c (E2E 4511)
E12: dispatched test/e2e-layout-export BASE 0e4f36c (E2E 4512)
E12: implementer DONE (PR #63); X11 cancel uses 24 images on A6 + dispatchEvent; X12 baseline from CI artifact; default unit follows locale (en-US → in)
E12: review — 1 Important (X14 content-box width unasserted) + Minors (X2 callout/bleed effect, X11 CPU throttle + no-download, X8 direction, guard) → fix round 1 dispatched. Default unit by locale = overview Q8 ruling (spec.md could mention it — final review doc note)
PAUSED by owner 2026-10-05 — see ../RESUME.md (E11 awaiting review; E12 fix round mid-way, uncommitted)
