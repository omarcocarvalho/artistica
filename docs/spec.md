# Review round 1: designs + M0 plan

> **Closed 2026-10-03.** Designs and the M0 plan are approved. M0 runs subagent-driven.

> **To review:**
> - Design mockups: open `design/index.html` (repo root) in your browser. Add `?theme=dark` or `?theme=light` to any URL to force a theme.
> - M0 plan: `docs/superpowers/plans/2026-10-03-m0-setup.md`.
>
> **How to answer:** each question below already has my recommendation. Answer "ok" to accept it, or write your own answer after **A:**.
> - **Approval gates:** say whether the designs and the M0 plan are approved, and pick an execution mode (G1–G3).

## Gates

G1. **Designs approved?** If not, list the changes.
   **A:** yes
G2. **M0 plan approved?**
   **A:** yes
G3. **How to run M0.** Subagent-driven: a fresh agent implements each task and a fresh reviewer checks it, with independent tasks run in parallel. The alternative is native: I do all tasks in this session, with one review at the end.
   _Recommendation:_ subagent-driven. A mistake in CI or branch protection would block every later PR.
   **A:** subagent-driven. A mistake in CI or branch protection would block every later PR.

## M0 plan questions

P1. **Release PR checks.** PRs opened by release-please don't trigger CI by themselves. Options: (a) I close and reopen the release PR with `gh` at the end of each milestone, which triggers CI; (b) you create a fine-grained personal access token and store it as a repo secret, so checks run automatically.
   _Recommendation:_ (a). No secrets to manage.
   **A:** a
P2. **Branch protection applies to admins (you) too?**
   _Recommendation:_ yes. It can be switched off for an emergency fix.
   **A:** yes
P3. **Test coverage threshold.**
   _Recommendation:_ start in M1, 80% on the core modules (layout, studies, lines, render).
   **A:** start in M1, 80% on the core modules (layout, studies, lines, render).
P4. **Branch prefixes.** Besides `feat/`, `fix/` and `chore/`, also allow `docs/`, `ci/` and `test/`?
   _Recommendation:_ yes.
   **A:** yes 
P5. ~~Moving `design/`~~: **resolved.** All planning docs and mockups were moved into the repo on 2026-10-03, at your request.
P6. **Placeholder live early.** Use a manual deploy to put the placeholder page live before v0.0.1 is tagged?
   _Recommendation:_ yes.
   **A:** yes

## Design questions

D1. **Lines on phones.** Keep composition lines inside the Studies step (as mocked, 5 steps), or give them their own 6th step?
   _Recommendation:_ inside Studies.
   **A:** inside Studies _(answer was on the D2 line; moved here)_
D2. **Crop marks and bleed inside the safe area?** As mocked. Needed because printers can't print the outer edge.
   _Recommendation:_ yes.
   **A:** _(blank; recommendation applied: yes)_
D3. **Defaults.** Crop marks on, bleed off?
   _Recommendation:_ yes.
   **A:** yes
D4. **Language picker before M6.** Only English exists until M6.
   _Recommendation:_ hide the picker until M6.
   **A:** hide the picker until M6.
D5. **Fonts (self-hosted, all free open-source licences).** Fraunces for headings, Atkinson Hyperlegible for UI text, Caveat for hand-written accents?
   _Recommendation:_ yes.
   **A:** yes
D6. **Click to select.** Clicking an image on the page preview selects it in the side panels?
   _Recommendation:_ yes.
   **A:** yes
D7. **"Apply to all" scope.** Studies and Lines each have their own "apply to all" (they don't copy each other's settings)?
   _Recommendation:_ yes.
   **A:** yes
D8. **Hue picker.** Preset swatches plus a hue slider. Is that enough, or do you also want a full colour picker?
   _Recommendation:_ swatches + slider.
   **A:** yes
D9. **Value ramp range.** From near-black of the hue to its lightest tint (perceptual lightness about 20% → 95%)?
   _Recommendation:_ yes. We tune it on real prints in M2.
   **A:** yes
D10. **PDF file name.** e.g. `artistica-A4-2026-10-03.pdf`?
   _Recommendation:_ yes.
   **A:** yes
D11. **Logo.** Keep the placeholder logo for now and do a proper logo pass in M5?
   _Recommendation:_ yes.
   **A:** yes

_No decision needed:_ the AI model sizes shown in the mockups (4 MB / 9 MB) are placeholders. Real sizes will be measured in M4.

---

# Artistica — Product Spec & Roadmap

> Status: **approved** (review round 1, 2026-10-03) · Last updated: 2026-10-03
> Repo: `omarcocarvalho/artistica` · public · MIT · default branch `master`
> Live URL (planned): `https://omarcocarvalho.github.io/artistica/`
> Decisions come from the Q&A rounds in the appendix at the end of this file (R# = round 2, Q# = round 1).

## 1. What it is

Artistica is a free, static web app for artists. You load reference photos, and it packs them onto printable pages. The output is a print-ready PDF with optional crop marks and bleed. On top of that it can produce **study versions** of each image (squint blur, value studies) and draw **composition and construction lines** over them, some of which use AI that runs entirely in the browser.

### Goals
- Turn a pile of reference photos into well-sized, well-packed, printable sheets in under a minute.
- Help artists *see*: big shapes (blur), values (posterisation), and structure (composition and construction lines).
- Private by design: photos never leave the device and are never stored.
- Works on desktop, tablet and phone, in the latest Chrome, Edge, Firefox and Safari.

### Non-goals (for now)
- Accounts, cloud storage, sharing, or saving images between sessions (R12).
- Printed paper or background colours (dropped in R4; pages are white).
- Captions, page numbers, title pages in the PDF (Q33).
- Analytics of any kind (Q35).
- A proxy for images from links (Q11-a); a custom domain (Q4); containers.

## 2. Functional requirements

### 2.1 Adding images (M1)
- **Sources:** file upload (picker + drag-and-drop), paste from clipboard, image URL.
- **Formats:** JPG, PNG, WebP, GIF (first frame only), HEIC/HEIF. HEIC uses the browser's native decoder when available (Safari). Otherwise a WebAssembly decoder is downloaded only when first needed.
- **URLs:** fetched directly by the browser. If the site blocks this (CORS), show a clear message: "This site doesn't allow other apps to read its images. Download it and upload it instead."
- EXIF orientation is respected. Transparent areas are rendered on white.
- **Images are kept in memory only.** Refreshing or closing the tab clears them. A "leave page?" warning appears while images are loaded (R12).
- **Count:** the user can add as many as they want. The engine *suggests* how many fit comfortably per page (Q9, R1).

### 2.2 Per-image edits (M1)
- Crop (free or fixed aspect ratio), rotate 90°, flip horizontal/vertical.
  - **Crop interaction:**
    - Drag inside the crop box to move it; drag the corner or edge handles to resize it.
    - It is locked to the chosen shape (Free, Original, 1:1, 4:3, 3:2, 16:9) and can't go outside the image.
    - Works with mouse, touch and keyboard: arrow keys move it, Shift + arrows resize it.
    - "Reset crop" restores the full image.
    - (In the mockup the crop box is static; this is the intended behaviour.)
- **Copies:** print the same image N times.
- **Size:** `Auto` (default) or a fixed print size. Setting a fixed size keeps the aspect ratio: you set the width or the height.
- **Resolution warning:** shown when the effective print resolution drops below 300 DPI (Q13).

### 2.3 Page setup (M1)
- **Paper:** A3, A4, A5, A6, Letter, Legal, Tabloid, Custom (width × height).
- **Units:** mm or inches, switchable at any time (values are stored internally in mm).
- **Orientation:** Auto (default; the engine picks whichever gives the better layout), or forced Portrait or Landscape (R2).
- **Safe area (page-edge margin):** default 5 mm. Adjustable, minimum 3 mm, cannot be turned off (R3).
- **Gutter (gap between images, for cutting):** on/off. Default on, 6 mm (R3).
- **Crop marks:** on/off. Printer-style marks at each image's corners (Q23).
- **Bleed:** on/off + amount (default 3 mm) (R5).
  - Bleed is made by **extending the image's edge pixels outward**, so the whole image stays inside the cut lines (Q17).
  - Bleed requires the gutter to be on, with `gutter ≥ 2 × bleed`. The UI enforces this by raising the gutter automatically and showing a short note.
  - Crop marks sit outside the bleed. Where neighbouring images are too close, marks are shortened so they never overlap another image or its bleed.

### 2.4 Layout engine (M1, core)
- **Auto mode (default, R1):**
  1. **Size range for each image.** Find a size range the image can be printed at. The *maximum* is set by resolution: never larger than the image's pixels allow at 300 DPI. The *minimum* is a comfortable reference size: the short side is at least 60 mm, or less if the page is smaller.
     - If the 300 DPI limit is below the comfortable minimum (a low-resolution image), use the minimum and show the resolution warning.
  2. **Pack.** Place images on as few pages as possible, as large as possible within their range. Images may be rotated 90° (Q16) and are never cropped (Q17). Pages are added automatically as needed (Q18).
  3. **Suggest a count.** Report "this paper fits N references comfortably per page".
- **Fixed-size images** are packed at exactly their set size. If a fixed size doesn't fit inside the safe area, it is scaled down to fit and a warning is shown.
- **Study groups:** all versions of one image (original, blurred, values…) are packed **together as one block**, side by side in a row or column, so they always share a page (R6).
- **Algorithm (initial):** MaxRects bin packing with rotation. Auto mode searches over a few candidate scales and orientations and scores each result by:
  1. page count (lower is better)
  2. smallest image size (larger is better)
  3. page fill ratio (higher is better)

  It runs in a Web Worker and must always give the same result for the same input.
- Input order does not need to be kept (Q14).
- **Manual layout** (drag, swap, resize on the page) comes later, in M5 (Q19).

### 2.5 Preview & PDF (M1)
- A live preview shows every page, with the safe area, crop marks and bleed visible (Q32).
- **PDF export:**
  - one page per sheet at the exact paper size
  - images embedded at 300 DPI for their print size (never upscaled past the source)
  - photos as JPEG and flat value studies as PNG
  - lines and marks drawn as vectors, so they stay sharp
- PDF generation works on phones: pages are processed one at a time to limit memory use, and a progress indicator is shown.

### 2.6 Image studies (M2)
- **Versions per image (R6):** Original, Blurred, Values, Blur + Values, in any combination. Each version you pick becomes one printed tile of that image's group.
- **"Apply to all"** copies one image's study settings to every image.
- **Blur (squint study, Q24–25):** 1–100%. The amount scales with the image size (100% ≈ a blur radius of 5% of the image's short side), so the same setting looks similar on every image.
- **Values (Q26–27, R7):**
  - 2–20 values. 2 values = a notan (pure dark/light) study.
  - The user picks **one hue**. The app builds a ramp from a near-black shade of that hue to **its lightest tint** (never the paper colour).
  - The image's lightness is measured in a perceptual colour space and split into N equal steps.
- **Blur + Values** applies the blur first, then posterises.
- All processing runs in a Web Worker. The preview uses a low-resolution version; the PDF is processed at full print resolution.

### 2.7 Composition lines (M3)
- Per image, with "apply to all" (R8). Each line type is optional and off by default (Q29).
- **Types:**
  - grid (N×M, user-chosen)
  - rule of thirds
  - diagonals / armature of the rectangle
  - golden ratio and golden spiral (choose the corner it starts from)
  - centre lines
- **Styling per image:** colour, thickness, opacity (Q31).
- Lines are drawn **on top of the image** on every printed version of that image, as vectors in the PDF.

### 2.8 AI-assisted lines (M4)
All AI runs in the browser. Nothing is uploaded.
- **Edge/contour outline:** a classic edge-detection algorithm (Sobel/Canny, written by us and run in a worker; no AI model needed). Adjustable detail level.
- **Face construction lines:** MediaPipe Face Landmarker finds faces. From its landmarks the app draws Loomis/Asaro-style guides: centre line, brow line, nose line, chin, cranium circle, eye line.
- **Body pose lines:** MediaPipe Pose Landmarker finds the body, and the app draws gesture/stick-figure lines.
- **Models** (about 5–30 MB) are downloaded only when the user first switches on a feature that needs them, then cached (Q30). They are **served from our own site**, not a third-party CDN.
- **Failures are explained:** "No face found in this image."

### 2.9 Settings persistence (M1, presets in M5)
- **M1:** the app remembers the last-used settings (page setup, units, language, default study and line settings) in `localStorage`. Settings are versioned so future changes can migrate old saved settings.
- **M5:** named presets (e.g. "A4 value studies"), plus export and import as a JSON file (Q34).
- Images and anything derived from them are **never** saved.

### 2.10 Languages (support in M1, translations in M6)
- Every piece of UI text goes through the translation system from M1 onward. A lint rule blocks hard-coded text in components.
- **Languages:** English (`en`), Portuguese (`pt-BR`), Japanese (`ja`), Korean (`ko`), Italian (`it`), Spanish (`es`, neutral), Mandarin (`zh-CN`, Simplified) (Q5, R10).
- **Which language is shown:** the saved user choice, otherwise the browser language, otherwise English. The user's choice is saved locally.
- Only English ships until M6. Translations are generated by Claude; review by native speakers is welcome later (R9).

### 2.11 SEO (basic in M1, localized in M6)
- **Landing page (`/`)**, pre-rendered as plain HTML at build time so search engines can read it without running JavaScript. It contains:
  - title, description, how-to, FAQ
  - a social share image (Open Graph / Twitter)
  - `WebApplication` + `FAQPage` structured data
- `sitemap.xml`, `robots.txt`, canonical URLs.
- **The tool itself** lives at `/app/`.
- **M6:** a translated version of the landing page per language (e.g. `/pt-BR/`), with `hreflang` tags linking the language versions (Q36).

### 2.12 Look & feel (design phase before M1)
- **Playful art-studio feel:** paper textures, hand-drawn accents, warm palette (Q37).
- Light and dark mode: follows the system setting by default, with a manual toggle.
- Responsive:
  - **phone:** a step-by-step flow (Images → Page → Studies → Preview → Export)
  - **desktop:** side panels around a live page preview
- Accessibility: WCAG 2.2 AA, fully usable with keyboard alone, visible focus, correct ARIA on controls.

## 3. Non-functional requirements

| Area | Requirement |
|---|---|
| Privacy | No network requests carry photos. The only network requests are the app's own files, AI models, and URL images the user asks for. |
| Performance | Auto layout of 50 images in < 500 ms (worker). Preview updates < 200 ms after a setting change for typical sets (≤ 20 images). |
| Memory | 20 × 12 MP photos → PDF on a recent phone without crashing. Large images are downscaled on load to the largest size any page could need. |
| Bundle | Initial app JS < 250 KB gzipped. HEIC decoder, AI models and heavy processing load only when needed. |
| Browsers | Latest Chrome, Edge, Firefox, Safari (desktop + iOS/Android) (Q8). |
| Reliability | The same input always gives the same layout, for testability and for preview = PDF. |

## 4. Architecture

```
src/
  app/            React shell, routing, layout, theme, i18n setup
  features/
    images/       intake (upload/paste/URL), decode (HEIC, EXIF), per-image edits
    page-setup/   paper sizes, units, safe area, gutter, marks, bleed
    layout/       layout engine (pure TS, no DOM) + worker wrapper
    studies/      blur, values, colour ramps (pure functions on pixel data) + worker
    lines/        composition-line geometry (pure TS); AI lines (M4)
    render/       page model → canvas preview renderer & PDF renderer
    settings/     persisted settings store, schema version + migrations
  shared/         units, colour maths (OKLCH), geometry, UI components
landing/          pre-rendered landing page (SEO)
public/models/    self-hosted MediaPipe models (M4)
```

Key design decisions:
- **One page model, two renderers.** The layout engine outputs a plain-data `PageModel` describing image placements, bleed, crop marks and line segments, in mm. The canvas preview and the PDF exporter both draw from that same model. This keeps the preview and the PDF identical and makes the model easy to test.
- **Pure core, thin UI.** The layout engine, study processing, colour ramps and line geometry are plain TypeScript functions with no browser dependencies. They are unit-tested directly and run in Web Workers through Comlink.
- **State:** Zustand stores. Only the `settings` store is saved (`zustand/persist` → `localStorage`, checked against a Zod schema on load). The image store lives in memory only.
- **PDF:** `pdf-lib` (images embedded, vector lines and marks).
- **Images:** decoded with `createImageBitmap`, processed on `OffscreenCanvas`/`ImageData` in workers.

## 5. Tech stack & tooling

| Concern | Choice |
|---|---|
| Language / runtime | TypeScript (strict), Node 24 LTS, pnpm (version pinned via `packageManager`) |
| App | Vite + React, Tailwind CSS v4, Radix UI primitives (accessible controls) |
| State / validation | Zustand, Zod |
| Workers | Web Workers + Comlink |
| PDF | pdf-lib |
| i18n | i18next + react-i18next + language detector; `eslint-plugin-i18next` to block hard-coded strings |
| AI (M4) | `@mediapipe/tasks-vision` (Face Landmarker, Pose Landmarker) |
| HEIC | native first, lazy `libheif` WASM fallback |
| Lint / format | ESLint (flat config) + typescript-eslint, Prettier |
| Unit tests | Vitest + fast-check (property tests for the layout engine) |
| E2E tests | Playwright on Chromium, Firefox, WebKit + mobile viewports; `@axe-core/playwright` for accessibility; screenshot comparison of the preview |

## 6. Repository, CI/CD & workflow

- **Branches:**
  - `master` is protected: no direct pushes; every change goes through a PR.
  - **Squash merge only.** The PR title becomes the commit message and must follow Conventional Commits (checked by `amannn/action-semantic-pull-request`).
  - Branch naming: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `ci/…`, `test/…`; the prefix matches the Conventional Commit type.
- **Required CI checks** (GitHub Actions, on every PR):
  - lint
  - type-check
  - unit tests (with coverage threshold on `features/*/` core modules)
  - E2E (3 browsers)
  - build
  - PR title check
- **Auto-merge:** Claude opens each PR with auto-merge enabled. It merges as soon as all required checks are green (Q41).
- **Releases:** release-please keeps a release PR open and updates it with each change.
  - That PR is **not** auto-merged. It is merged once **at the end of each milestone** (R11).
  - Versions: M0 → `v0.0.1`, M1 → `v0.1.0`, M2 → `v0.2.0`, M3 → `v0.3.0`, M4 → `v0.4.0`, M5 → `v0.5.0`, M6 → `v1.0.0`.
- **Deployment:** GitHub Pages via `actions/deploy-pages`. **The live site is redeployed when a release is published**, so half-finished milestone work never goes live. Manual deploys are possible with `workflow_dispatch`.
- **Project docs:** a `CLAUDE.md` with conventions, `docs/spec.md` (this document), and `docs/superpowers/plans/` (one implementation plan per milestone).

### 6.1 Working agreement: parallel by default, the owner is the only gate
- **Run work in parallel with agents whenever possible.** Whenever two or more pieces of work don't depend on each other (design screens, independent plan tasks, features, test suites, docs, research), Claude sends them to agents running in parallel instead of doing them one after another. Each agent gets its own git worktree, branch and PR.
- **The owner's review and decisions are the only gate.**
  - Claude doesn't stop to ask permission for routine work that's already in an approved spec or plan.
  - Claude stops and waits only for:
    1. approving specs, plans and designs
    2. product or scope decisions not covered by the spec
    3. milestone sign-off before a release PR is merged
    4. anything destructive or irreversible
- **Questions are batched:** collected and asked together, written into the relevant doc, so they don't interrupt the work one by one.
- **Agents never decide product questions themselves.** An agent that hits an open product question reports it back as a question instead of guessing.
- This agreement goes into the project's `CLAUDE.md` in M0 so every future session follows it.

## 7. Testing strategy

- **Layout engine (property tests):** for random image sets and paper settings, check that:
  - no two placements overlap (including bleed)
  - everything stays inside the safe area
  - gutters are respected
  - no image in auto mode exceeds its 300 DPI size limit
  - groups stay on one page
  - the result is deterministic

  Plus example tests with known optimal packings.
- **Studies:** unit tests on small synthetic `ImageData`:
  - blur keeps the average brightness
  - values output exactly N distinct colours
  - the ramp is monotonic from dark to light
- **Lines:** geometry tests (thirds at 1/3 and 2/3, spiral within bounds, etc.).
- **Render:** `PageModel` snapshot tests. PDF tests parse the exported file back and check page count, page size in points, number of images, and that the vector lines are present.
- **E2E:**
  - upload fixtures (JPG, PNG, HEIC, EXIF-rotated) → set paper → preview → download PDF → check the PDF
  - paste and URL flows; CORS error message
  - mobile step flow
  - axe accessibility scan on each screen
  - preview screenshot comparison (run on Linux in CI only)
- **Edge cases to cover explicitly:**
  - very large images (50 MP)
  - tiny or low-resolution images
  - an image larger than the page at minimum size
  - custom paper smaller than one image
  - gutter < 2 × bleed
  - pasting non-image clipboard content
  - animated GIF
  - transparent PNG
  - 0 images → export disabled
  - switching units back and forth doesn't drift values

## 8. Milestones

Each milestone ends with a release (§6) and a short demo. Every milestone after M0 starts with its own implementation plan in `docs/superpowers/plans/`.

### D — Design (before M1, can run alongside M0)
Clickable HTML mockups, light + dark (Q38). Saved in `design/` in the repo.
- **Screens:**
  - landing page
  - desktop workspace (images panel · page preview · settings panel)
  - mobile step flow
  - per-image edit sheet (crop/rotate/copies/size)
  - page setup
  - studies panel
  - lines panel
  - export/progress
  - empty state and error states
- **Exit:** you approve the mockups. The design tokens (colours, type, spacing, radii) are fixed for Tailwind.

### M0 — Setup → `v0.0.1`
- **Repo:** create the repo (public, MIT, `master`), add branch protection, turn on squash-only merges and auto-merge.
- **Scaffold:** Vite + React + TS + Tailwind + ESLint + Prettier, with Vitest and Playwright set up.
- **CI:** all required checks, PR title check, release-please, Pages deploy on release.
- **Docs:** `CLAUDE.md`, `docs/spec.md`, then move all planning files into the project folder.
- **Exit:** a placeholder page is live on GitHub Pages; a test PR auto-merges after green CI.

### M1 — Collation MVP → `v0.1.0`
- Add images by upload, paste and URL (all formats, including HEIC).
- Per-image crop/rotate/flip/copies/size, with resolution warnings.
- Page setup: paper, units, orientation, safe area, gutter, crop marks, bleed.
- Layout engine: auto + fixed sizes, rotation, multiple pages, "fits N per page" suggestion.
- Live preview and PDF export.
- Last-used settings saved; leave-page warning.
- Translation system in place (English only).
- Landing page with basic SEO, light/dark mode, responsive layout.
- **Exit:**
  - you can print a correctly sized multi-page A4 and Letter PDF with marks and bleed from a phone and from a desktop
  - all tests green

### M2 — Image studies → `v0.2.0`
- Per-image versions: original / blurred / values / blur + values, with "apply to all".
- Blur 1–100%; values 2–20 with a hue ramp.
- Study groups packed together; worker processing; PNG for value studies in the PDF.
- **Exit:** a sheet showing an image next to its blurred version and its 5-value version prints correctly.

### M3 — Composition lines → `v0.3.0`
- Grid, thirds, diagonals/armature, golden ratio/spiral, centre lines.
- Per-image styling, "apply to all", vector lines in the PDF.
- **Exit:** the lines in the PDF match the preview exactly and stay sharp when zoomed.

### M4 — AI-assisted lines → `v0.4.0`
- Edge/contour outline.
- Face construction lines (MediaPipe Face Landmarker), body pose lines (Pose Landmarker).
- Self-hosted models loaded only when needed, with download progress and caching.
- Clear "nothing detected" messages.
- **Exit:**
  - works offline once the models are cached
  - nothing is uploaded (verified by an E2E test that watches network requests)

### M5 — Polish → `v0.5.0`
- Named presets with JSON export/import.
- **Manual layout editing:** drag, swap and resize on the page, with a "re-run auto layout" button.
- Accessibility audit fixes and performance tuning (large sets, mobile memory).
- **Exit:** performance and memory targets in §3 are met and measured.

### M6 — Translations & 1.0 → `v1.0.0`
- Translations for `pt-BR`, `ja`, `ko`, `it`, `es`, `zh-CN`.
- Translated landing pages with `hreflang`, updated sitemap.
- Check that CJK text fits and renders correctly.
- **Exit:** every screen reviewed in all 7 languages; 1.0 released.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| "Optimal" packing is hard in general (NP-hard) | A heuristic (MaxRects + search over scales) is good enough; scoring is tested; manual tweaks come in M5 |
| Phone memory limits during PDF export | Downscale on load, process pages one at a time in a worker, free memory between pages |
| HEIC support outside Safari | Lazy WASM decoder; tested in E2E on Chromium/Firefox |
| Crop marks crowd tight layouts | Marks are shortened near neighbours; the gutter has a minimum when bleed is on |
| MediaPipe model size / browser differences | Loaded only when needed, cached, falls back to the CPU; the feature is optional |
| Release-time deploys hide progress | Manual deploys (`workflow_dispatch`) for demos; PR previews possible if we move to Cloudflare later (Q3) |
| Auto-merge lets a bad change in | Required checks cover lint/types/unit/E2E/build/accessibility; each milestone ends with a review before its release |

## 10. Next steps

1. You review this spec (edit freely, or tell me what to change).
2. **Design phase:** I produce the HTML mockups for your approval.
3. **M0:** I write the M0 implementation plan, create the repo, and move these files into the project folder.

---

# Appendix — Q&A decision log

## Follow-up questions (round 2)

> Only the points where round-1 answers conflict or leave a gap. Same format: answer after **A:**, "ok" accepts the _Suggestion_.

### Layout & sizing (most important)

R1. **Q14 vs Q15 conflict.** In Q14 you picked (c), "every image at a size *I* choose". In Q15 you picked "Auto", "the engine decides the size". And Q9 says "suggest the optimal amount" automatically. Is this what you mean?
   - **Auto mode (default):** the engine picks a print size for each image that works well as a drawing/painting reference: large enough to read detail, never enlarged beyond what the image resolution allows at 300 DPI. It then packs them onto as few pages as possible.
   - **Manual override:** the user can set a size for all images or for one image (e.g. 10×15 cm), and the engine packs around it.
   - "Suggest the optimal amount" = the engine also recommends **how many images per page** for the chosen paper (e.g. "A4 fits 4 references comfortably").
   _Suggestion:_ yes, as described above.
   **A:** yes, as described above.

R2. **Orientation (Q18).** Engine picks portrait/landscape automatically, with the user able to force one. Correct?
   **A:** yes

### Margins, colour, cut marks

R3. **Page-edge margin.** You chose gutters (gaps) *between* images only. Most home printers can't print the outer 3–5 mm of the page, so a small page-edge safe area is needed anyway. Is it okay to have a fixed 5 mm safe area that the user can adjust but not turn off? And is the gutter **on/off + size** (default e.g. 6 mm), as in the original brief?
   _Suggestion:_ yes to both.
   **A:** yes to both.

R4. **Printed colour (Q22).** Does the colour fill **the whole page background** (gutters + edges), or only the gutters? Do you also want **preset palettes** (white, warm cream, cool grey, kraft, black…) next to a free colour picker? (You didn't answer this part.)
   _Suggestion:_ whole page + presets + picker.
   **A:** let's drop this borders with colours entirely.

R5. **Bleed + "keep the whole image".** Bleed means the image is printed slightly *past* the cut line, so a slightly imprecise cut leaves no white sliver. To keep the whole image visible after cutting (Q17), I'd **extend the image's edge pixels outward** into the bleed area (e.g. 3 mm) instead of enlarging the image. The cut marks then sit exactly on the real image border. The gutter must be at least 2× the bleed. Bleed would be on/off with an adjustable amount. Okay?
   _Suggestion:_ yes.
   **A:** yes

### Image studies

R6. **Side-by-side versions (Q25/Q28).** Should each image be able to print as **any combination** of: original, blurred, values, blur + values (blur applied first, then values)? And is this chosen **per image** (consistent with blur/values being per image), with an "apply to all" shortcut?
   _Suggestion:_ yes: per image, any combination, plus "apply to all".
   **A:** yes: per image, any combination, plus "apply to all".

R7. **Value ramp (Q27-A).** The user picks one hue and the app builds a dark-to-light ramp. Should the lightest value be **the paper colour** (so it blends with the sheet) or always the lightest tint of the chosen hue?
   **A:** always the lightest tint of the chosen hue

R8. **Composition lines (Q29/31).** Per image (each image has its own line types and styling), with an "apply to all" shortcut? And lines are always drawn **on top of the image** (no separate tracing sheet)?
   _Suggestion:_ yes, yes.
   **A:** yes, yes.

### Languages

R9. **When do the 7 languages arrive?** The milestone list (Q42) has "more languages" in M5. I'd build translation support into M1 so no text is hard-coded. Should all 7 languages ship **in M1**, or **English in M1 and the other 6 in M5**? The translations would be generated by me. A native speaker reviewing later is welcome but not required. Okay?
   **A:** just add the support for multi languages starting M1. addind the other translations can be done in a later milestone, after the whole application is done.

R10. **Language variants.** Portuguese: Brazilian (pt-BR) or European (pt-PT)? Mandarin: Simplified Chinese (zh-CN) or Traditional (zh-TW)? Spanish: neutral/Latin American or Spain?
   _Suggestion:_ pt-BR, zh-CN (Simplified), neutral Spanish.
   **A:** pt-BR, zh-CN (Simplified), neutral Spanish.

### Workflow

R11. **Releases.** With auto-merge on green CI, release-please opens a "release PR" that bumps the version and changelog. Should that also auto-merge (a release goes out after every change)? Or should I merge it once **at the end of each milestone** (one version per milestone, e.g. M1 = v0.1.0)?
   _Suggestion:_ one release per milestone.
   **A:** one release per milestone

R12. **Images are lost on refresh.** Because photos are never stored (brief requirement), reloading or closing the tab clears the loaded images; only settings survive. The app will warn before leaving the page if images are loaded. Okay?
   **A:** yes

---

## Follow-up questions (round 1)

> Write your answer after each **A:**. Where there's a _Suggestion_, answering "ok" means you accept it.
> Skip anything you don't care about; I'll go with the suggestion.

## 1. Naming, repo & hosting

1. **Name.** Options: `RefSheet`, `RefPrint`, `Studio Sheets`, `Value & Blur`, `PinUp Refs`. Pick one, mix them, or suggest your own. The repo name would be the kebab-case version (e.g. `refsheet`).
   **A:** `Studio Sheets` → later renamed to **Artistica** (repo `artistica`)
2. **Repo visibility & license.** Public or private? Open-source license?
   _Suggestion:_ public + MIT (GitHub Pages is free for public repos).
   **A:** public + MIT
3. **Hosting.** GitHub Pages: everything stays in GitHub, simplest setup. Cloudflare Pages: also free, adds a preview URL for each pull request, a faster global CDN, and free privacy-friendly analytics. It connects to the GitHub repo.
   _Suggestion:_ start on GitHub Pages and move to Cloudflare only if we want PR previews or analytics. Moving later is easy.
   **A:** start on GitHub Pages
4. **Custom domain?** Do you have or want one (e.g. `refsheet.app`), or is `omarcocarvalho.github.io/<repo>` fine?
   **A:** Not now.
5. **UI language(s).** English only, or also Portuguese or other languages? This also affects SEO.
   **A:** English, Portuguese, Japanese, Korean, Italian, Spanish, Mandarin. Default by the browser setting, or English, or whatever the user chooses, saved locally.

## 2. Users & devices

6. **Who is it for?** Just you, or artists in general (public tool)?
   **A:** Atists in general
7. **Devices.** Desktop-first, or must it work well on phones and tablets too (e.g. pasting from the phone's photo gallery)?
   **A:** Work on all devices
8. **Browsers.** Is "latest Chrome, Edge, Firefox, Safari" enough?
   **A:** Yes

## 3. Images in

9. **How many images** per sheet set, roughly? (e.g. up to 10, up to 50, 100+)
   **A:** let the user choose, but have an automatic version that suggests the optimal ammount, taking into consideration that the image will be used as a source to draw or paint.
10. **Formats.** JPG, PNG, WebP, GIF? Do you need **HEIC** (iPhone photos)? That needs an extra decoder.
    **A:** Yes
11. **Images from links.** Many websites block other sites from reading their images (a browser rule called CORS). A purely static app can't get around that. Options: (a) try, and show a clear error suggesting the user download and upload instead; (b) add a tiny proxy (e.g. a Cloudflare Worker), which means the app is no longer purely static.
    _Suggestion:_ (a) for now.
    **A:** A for now
12. **Basic edits before layout.** Should the user be able to crop, rotate, or flip an image? Set copies (print the same image N times)?
    **A:** Yes
13. **Print quality.** Target 300 DPI? Should the app warn when an image is too low-resolution for the size it's printed at?
    _Suggestion:_ yes to both.
    **A:** yes to both

## 4. Layout engine ("optimal collation")

This is the core of milestone 1, so it matters most.

14. **What does "optimal" mean to you?** Rank these:
    - (a) fewest pages / least paper waste
    - (b) images as large as possible
    - (c) every image printed at a size I choose (e.g. 10×15 cm), packed tightly
    - (d) all images roughly the same size
    - (e) keep the order I put them in
    **A:** c
15. **Image size control.** Does the engine decide each image's size, or does the user set a size (per image or for all)? Or both, as an "auto" mode vs a "fixed size" mode?
    **A:** Auto
16. **Rotation.** May the engine rotate images 90° to fit better?
    **A:** yes
17. **Cropping.** Always keep the whole image (aspect ratio preserved), or allow cropping to fill a cell?
    **A:** Always keep the whole image
18. **Pages.** If images don't fit on one page, spill onto more pages automatically? Portrait/landscape chosen automatically, or by the user?
    **A:** Yes, yes
19. **Manual tweaks.** After auto-layout, should the user be able to drag, swap, or resize images on the page? (This adds a lot of work. It could come in a later milestone.)
    **A:** Yes, add it in a later milestone

## 5. Paper, margins, colour, cut marks

20. **Paper sizes.** A3, A4, A5, A6, Letter, Legal, Tabloid + **custom size**? Units: mm and inches, switchable?
    **A:** Yes
21. **Margins.** You mentioned "white margins for cutting". Do you mean (a) a margin around the page edge, (b) a gap (gutter) between images, or (c) a white border around each image? Can it be several of these? Same value on all sides?
    **A:** Between images
22. **Paper/margin colour.** Is the colour **printed** (fills the background/margins with ink), or is it just to **preview** how the sheet looks on coloured paper? Should it come with preset palettes (e.g. neutral greys, toned paper) plus a free colour picker?
    **A:** The colour is printed
23. **Cut marks style.** Printer-style crop marks at each image's corners, dashed cut lines between images, or a choice? Do you need **bleed** (image printed slightly past the cut line so there's no white sliver)?
    **A:** Printer-style crop marks at each image's corners. add bleed marks

## 6. Blur

24. **Per image or global?** Is one blur setting for the whole sheet enough, or does each image need its own?
    **A:** per image
25. **Purpose.** Is it for "squint" studies (seeing big shapes)? Should the sheet also be able to print the **original and the blurred version side by side**?
    **A:** It's a squint study. Create a setting in which the user can choose to have blurred and neat versions together.

## 7. Values (posterisation)

26. **Per image or global** (same as Q24)?
    **A:** Per image
27. **Value colours.** "Choose the colour of the values" could mean: (a) pick one hue and the app builds a dark-to-light ramp from it (e.g. sepia, blue-grey); (b) pick every value's colour individually; (c) a start and end colour, with the steps in between filled in. Which one(s)?
    **A:** A
28. **Original + values side by side**, like Q25? Also, should blur and values combine (blur first, then posterise)?
    **A:** Same answer as Q25

## 8. Tracing / composition lines

29. **Which line types do you want?** Mark all that apply:
    - [X] grid (N×N, user-chosen)
    - [X] rule of thirds
    - [X] diagonals / "Armature of the rectangle"
    - [X] golden ratio / spiral
    - [X] centre lines
    - [X] edge/contour outline (outline drawing from the photo)
    - [X] face construction lines (Loomis/Asaro-style, using in-browser face landmark AI)
    - [X] body pose lines (stick-figure gesture lines from in-browser pose AI)
    **A:** Make them optional to be activated by the user
30. **AI model download.** The in-browser AI models (e.g. MediaPipe face/pose) are a one-time download of about 5–30 MB, cached afterwards, and everything stays on the device. Is that acceptable?
    **A:** YEs
31. **Line styling.** User-chosen line colour, thickness, opacity? Lines on top of the image, or as a separate tracing sheet?
    **A:** User-chosen line colour, thickness, opacity

## 9. PDF output

32. **Preview.** Should there be a live on-screen preview of the pages before downloading the PDF?
    _Suggestion:_ yes.
    **A:** yes
33. **Anything else in the PDF?** Page numbers, a small label or caption per image, a title page?
    **A:** no

## 10. Settings, privacy, analytics

34. **Saved settings.** Only "remember my last settings", or also **named presets** (e.g. "A4 value studies") with export/import as a file?
    _Suggestion:_ last settings in M1, presets later. Stored in `localStorage` / `IndexedDB` (cookies aren't needed for this).
    **A:** last settings in M1, presets later. Stored in `localStorage` / `IndexedDB`
35. **Analytics.** None, or privacy-friendly, cookie-free page-view counts?
    **A:** None

## 11. SEO & design

36. **SEO goals.** Is a good landing section (title, description, how-to, FAQ), social share image, sitemap, and structured data enough? Any keywords you want to rank for (e.g. "printable reference sheets", "value study generator")?
    **A:** It's enough
37. **Visual style.** Any references you like (apps, sites)? Light/dark mode? Brand colours? A "minimal tool" feel vs a "playful art studio" feel?
    **A:** Light/dark mode and playful art studio
38. **Design process.** I plan to produce clickable HTML mockups of the main screens for your approval before coding. Okay?
    **A:** Yes

## 12. Tech & workflow (decisions I can make — tell me if you object)

39. **Stack.**
    _Suggestion:_ Vite + React + TypeScript, Tailwind CSS, Web Workers for image processing, `pdf-lib` for PDF generation, Vitest (unit tests) + Playwright (browser tests), pnpm. Alternative: Svelte (smaller and simpler, slightly less ecosystem). React or Svelte, or no preference?
    **A:** Follow your suggestion
40. **Git workflow.** Main branch protected, every change goes through a pull request with CI (lint, type-check, tests, build) required to pass. Conventional commits checked automatically, and automatic versioning/changelog via release-please. Okay?
    **A:** Use master branch instead. the rest is as you suggested.
41. **Who reviews PRs?** Do you want to review and merge every PR yourself, or may I merge once CI is green?
    **A:** Auto merge if CI is green

## 13. Milestones

42. **Proposed order.** Reorder or adjust:
    - **M0** Setup: repo, CI, deploy pipeline, empty app live
    - **M1** Collation MVP: add images (upload/paste/link) → paper size → margins/gutters → paper colour → cut marks → preview → PDF; saved settings; basic SEO
    - **M2** Image studies: blur + values (posterisation) with colour ramps
    - **M3** Composition lines: grid, thirds, diagonals, etc. (non-AI)
    - **M4** AI-assisted lines: face/pose landmarks, contour outline
    - **M5** Polish: presets, manual layout tweaks, more languages, accessibility, performance
    **A:** let's follow that plan

---

## Original brief

- this tool aims to create printed materials to get used as references for drawing and painting
- Web app; typescript; static; runs on github pages; open to try claudflare hosting solution; suggest project and repository name;
- Images will be sourced by upload/paste/link; 
- Allows to choose paper size (ex. A4, A5, Letter, etc);
- Allows to choose to have white margins for cutting, on/off, if on, how much marging;
- Feature that allows the user to choose the colour of the paper/margin via a colour palete;
- Engine should seek for the optimal image combinations that produce the best collation of those images for the selected paper size, taking the configurations into account;
- the outcome should be a PDF to print those images
- when we select the cutting option, add cutting marks to the page
- add an option to set blurriness of the image; the user can choose a level of bluriness from 1-100%;
- add an option to turn the image into its values; the user can choose from 2-20 values; the user can also choose the colour of the values from a colour selector;
- no storage of any of the photos
- configurations can be stored locally in the browser using its storage, cookies, what works best
- we can use browser workers if needed
- we can use webassembly if needed
- add an option that adds tracing lines to help seeing the composition or facial outlines -- seek opportunities to run in browser AI models to deal with that
- you need to install and configure gh in this machine, alongside any needed dependency
- you will create the repo
- we will use conventional commits
- code and tests will be stored and run in github
- hosting can be github pages or claudflare hosting (I don't know anything from the later tgo make a decision) 
- add support for SEO

evolve this document into a proper detailed plan to code, test and ship this app

ask as many follow up questions needed so we can well define the scope and features

use claude to generate the designs for this app

organise the idea in milestones, so we can have the collation app first, and on top of it add the other features
