# SDD ledger — plan: docs/superpowers/plans/2026-10-03-m1-c-images.md

Spec: docs/spec.md + docs/superpowers/plans/2026-10-03-m1-overview.md (contracts, Ruled CRs, Execution notes). Owner approved 2026-10-04.
Pre-flight scan: done by cross-plan consistency review (34 findings, all fixed/ruled). Shared controller rulings: see A ledger (A-1 PR/worktree per task, controller merges after review; A-4 update-branch before merging when master moved under an approved PR).
Shared helpers: scratchpad/brief.sh (task IDs), scratchpad/merge.sh. E2E ports: B 42xx, C 43xx, D 44xx, E 45xx.

## Progress
C1: dispatched (sonnet) .worktrees/m1-c1 feat/images-foundation BASE 8f166f3
C2: dispatched (sonnet) .worktrees/m1-c2 feat/images-sniff-exif BASE 8f166f3
C3: dispatched (sonnet) .worktrees/m1-c3 feat/images-crop-math BASE 8f166f3
C3: implementer DONE 39002e3 (PR #27), 8/8
C2: implementer DONE 01f6211 (PR #30), 8/8
C1: implementer DONE 77cd6c6 (PR #31), 8/8; weak RED
C3: review ✅ approved (200k-run adversarial probe clean)
C3: minor (deferred): sanitizeEdits doesn't validate cropAspect (NaN crop on bogus); invalid rotation reset to 0 not normalised; Q3 tested only for 4:3; size not property-tested; isValidCrop shares cropLimits
C3: NOTE for D2: crops are fractional source px by design — render must handle fractional source rects
C3: complete (merged PR #27)
C2: review — 2 Important (plan-mandated test gaps: hostile EXIF input; orientation matrices not pinned) → fix round 1 dispatched
C2: minor (deferred): readDeclaredSize only JPEG/PNG (null = unknown for consumers); PNG sniff checks 4 bytes; AVIF w/ mif1 major brand → HEIC; orientation tag type/count unchecked; injectExifOrientation in prod module
C4: dispatched (sonnet) .worktrees/m1-c4 feat/images-view-dpi BASE 6e8df87
C2: fix round 1 pushed (tests only); re-review dispatched. C1: review dispatched (was packaged but not sent earlier)
C1: review ✅ approved
C1: minor (deferred → C9/C13): removeAll confirmBody has only _other plural (fine if ≥2 gate); 'any number of photos' vs MAX_PASTED_URLS=20; no test that consumers pass {{maxMb}} etc.; barrel added later (C13)
C1: complete (merged PR #31)
C2: fix round 1/5 (2 addressed, 0 open; tests only)
C2: complete (merged PR #30)
C4: implementer DONE_WITH_CONCERNS (PR #33): local Matrix type pending C2 merge; brief's rotateBy test bug fixed (4 turns)
C5: dispatched (sonnet) .worktrees/m1-c5 feat/images-url-clipboard BASE b21a485
C4: refactor pushed (Matrix import); review dispatched
C4: review — maths correct, rotateBy test fix confirmed; 1 Important (exact pins missing for 180/270 & flips) → fix round 1 dispatched (+minors: test title, exact viewMatrix, named DPI tolerance)
C5: implementer DONE_WITH_CONCERNS 2f6f32d (PR #36): no mid-stream abort without Content-Length
C4: fix round 1 pushed (16-case table, exact viewMatrix, DPI_TOLERANCE)
C4/C5: re-review + review dispatched
C4: fix round 1/5 (addressed; 4 spot-checks by hand)
C4: complete (merged PR #33)
C6: dispatched feat/images-decode BASE 90b325f
C5: review — 1 Important (size limit only via Content-Length; plan-mandated) → Ruling C-1: override plan, stream-count bytes & abort at MAX_FILE_BYTES (phone memory, spec §3) — fix round 1 dispatched (+ trailing punctuation strip)
C5: minor (deferred): AbortSignal.timeout on Safari<16; http on https app → 'network' (consider https upgrade); no type filter on dropped files (sniff rejects)
C4: PR #33 pr-title check failed after update-branch during GitHub 504 outage — rerun pending
C4: complete (merged PR #33 after pr-title rerun — GitHub outage)
C5: fix round 1/5 (2 addressed)
C5: minor (deferred): trailing ')' stripped from wiki-style URLs
C5: complete (merged PR #36)
C6: implementer DONE 16f95cc (PR #42); RED not captured (usage limit)
C6: review — 3 Important test gaps (post-decode too-large; repaint close; assert-nothing) + limiter sync-throw slot leak & max clamp → fix round 1 dispatched
C6: minor (deferred→final/E2E memory test CR-X7): full-size bitmap decoded before downscale (~290MB peak at concurrency 2 for 12MP PNG) — consider createImageBitmap resize options; HEIC no pre-decode size (ispe); GIF arrayBuffer copy; EXIF only for JPEG on probe-false browsers; heic import failure cached; browser-deps untested (E2E)
C6: NOTE for C7: store must revoke thumbUrl on remove/clear
C6: fix round 1 pushed 6d72e5a; re-review dispatched
C6: fix round 1/5 (4 addressed; mutation-verified)
C6: complete (merged PR #42)
C7: dispatched feat/images-store BASE 5e96c93
C12: dispatched test/images-fixtures BASE 5e96c93
C12: implementer DONE 368fa25 (PR #45); 11 fixtures <1KB via sips; README added
C7: implementer DONE_WITH_CONCERNS f041aad (PR #46); lint tweaks; no RED
C12: review ✅ approved (bytes verified)
C12: minor (deferred): generator macOS-only (sips) for HEIC; dims/byte-equality not asserted; README 'no metadata' vs sRGB ICC
C12: complete (merged PR #45)
C7: review ✅ approved (clear-mid-import race handled)
C7: minor (deferred): stale failures after clear() still reported (E toasts — consider null when gen changed); leak if newId/set throws post-decode; module-level selector cache; test gaps (non-selected remove, clear during fetch)
C7: complete (merged PR #46)
C8: dispatched feat/images-dropzone BASE 7ffc22f
C9: dispatched feat/images-list BASE 7ffc22f
C10: dispatched feat/images-crop-editor BASE 7ffc22f
C10: implementer DONE_WITH_CONCERNS fe922ff (PR #48): MAX_STAGE_HEIGHT_PX 420→400 to fit a test (suspicious); describedby test tweak; property-style onChange
C9: implementer DONE 16589a8 (PR #49)
C9: review ✅ approved
C9: minor (deferred): scrollIntoView mock leaks; no close-button test; focus falls to body after remove
C9: complete (merged PR #49)
C10: review — 2 Important (constant bent to fit scale-dependent test; no pointerId/multi-touch guard) → fix round 1 dispatched (+ readout flood, modifier keys). 'Reset crop' → C11
C8: implementer DONE_WITH_CONCERNS 69e46ad (PR #51); lint/type deviations; no visual check
C8: review — 3 Important (live regions inserted with content; over-wide try hides store failures as paste hint; weak paste tests) → fix round 1 dispatched (+ guard tests, submitUrl finally). Minor: visual check owed; section landmark label; duplicate importing announcement with 2 instances
C10: fix round 1 pushed c8da017; re-review dispatched
C10: fix round 1/5 (3 addressed; k mutation verified)
C10: minor (deferred): edge handles clipped by overflow-hidden (mask shadow); swallowed drawImage errors; DPR change not handled
C10: complete (merged PR #48)
C11: dispatched feat/images-edit-sheet BASE 2cd3fa8
C8: fix round 1 pushed 4e6ad21; re-review dispatched
C8: fix round 1/5 (4 addressed)
C8: minor (deferred): no 'unknown' error kind — store rejection shown as decode-failed/network
C8: complete (merged PR #51)
C11: implementer DONE 0d6a35d (PR #53)
C11: review dispatched
C11: review ✅ approved (minors: copies input draft UX; redundant dims check) — NOT merged (owner paused)
RESUMED 2026-10-04 22:30 (owner). C11: complete (merged PR #53)
C13: dispatched feat/images-public-api BASE fdf2ca6
C13: implementer DONE (PR #56); barrel = 8 runtime exports; strict privacy guard; heic chunk to be re-checked after E integration
C13: review ✅ approved (mutations: all guards bite)
C13: minor (deferred): regex comment stripper false negative (contrived); url/store exemption not anchored
C13: complete (merged PR #56)
SUB-PLAN C COMPLETE (C1–C13)
