# Artistica: design mockups (phase D)

Clickable HTML mockups for every screen in spec §8 "D — Design". Open `index.html` in a browser. No build step, no network requests.

- **Theme:** the theme button cycles Auto (system), Light and Dark, and is saved in `localStorage`. For reviews and screenshots, `?theme=light` or `?theme=dark` in the URL forces a theme.
- **Not real:** there is no image processing. Placeholder "photos" are CSS gradients; blur, values and lines are simulated.

## Files

| File | What it is |
|---|---|
| `tokens.css` | Design tokens as CSS custom properties (colour light/dark, type, spacing, radii, shadows, focus, motion, z-index, textures). Source for the Tailwind v4 `@theme`. |
| `mockup.css` | Shared component styles, plus the millimetre-accurate print preview and placeholder art. |
| `mockup.js` | Small vanilla interactions: theme, tabs, step flow, dialogs/sheets, sliders, toggles, hue ramp, units, the bleed/gutter rule, and fake export and model-download progress. |
| `index.html` | Gallery of all screens and the palette. |
| `landing.html` | Public landing page (`/`): hero, how it works, features, privacy, FAQ. |
| `workspace.html` | Desktop workspace: images panel · live page preview · settings tabs. |
| `mobile-flow.html` | Phone flow (390 × 844) in a device frame: Images → Page → Studies → Preview → Export, plus the edit bottom sheet. Preview has the Arrange toolbar under the pages; two more phones show Arrange mode (44 px handles) and the selected photo's sheet (Move to page, Swap with…, Width, Position). Export is inline in its step. |
| `image-edit.html` | Per-image edit dialog: crop and aspect, rotate, flip, copies, Auto/Fixed size, DPI meter and low-DPI warning. |
| `page-setup.html` | Page tab with bleed on: guide legend, shortened crop marks, and the "gutter raised" note. |
| `studies.html` | Studies tab: versions, blur, values 2–20, single-hue picker, generated ramp, apply to all; study groups on the page. |
| `lines.html` | Lines tab: grid, thirds, armature, golden ratio/spiral (start corner), centre, edge outline, face, pose; style; model download notice. |
| `export.html` | Export dialog: summary → page-by-page progress → download, with a "print at 100%" tip. |
| `empty-state.html` | First run with no images. Export is disabled and the reason is given. |
| `errors.html` | CORS link, unsupported file / non-image paste / animated GIF, no face, low resolution, oversized fixed size, model download failure, export with 0 images. |
| `presets.html` | Presets: the top-bar button; the dialog empty and with three presets; saving (no name, a taken name, a full list); renaming; the apply and delete confirmations; Export all and Import… with every result and error; the phone bottom sheet. |
| `arrange.html` | Arrange mode: the preview toolbar off and on (Undo, Re-run auto layout, and Move to page, Swap with…, Width and Position for the selected photo); a keyboard-driven desk; drag ghosts (valid, invalid), a swap target, a keyboard pick-up, a fixed-size photo, the re-run confirmation, the "arranged automatically again" notices and what a screen reader hears. |
| `logo.html` | Three logo directions on the sketchbook concept, recommended one first, at 512, 180, 32 and 16 px, in light, dark, forced colours and one colour. |

## Visual concept: "a sketchbook on a warm studio desk"

The app canvas is warm, grainy paper (an SVG `feTurbulence` grain over cream). Hand-made touches frame the tool: pencil-scribble underlines, washi-tape strips, wobbly "sketch" borders, Caveat-style margin notes ("tip!", "squint!"). They are used sparingly. Controls stay plain, high-contrast and familiar: clear labels, standard switches, segmented controls and sliders.

The **printed page is always pure white** in both themes and sits on the desk with a paper shadow. Screen-only guides (safe area in blue, bleed in magenta, cut line in grey, crop marks in black) are drawn in print-industry colours, and a "Guides" toggle hides them. Dark mode is "the studio at night": warm charcoal, with the white sheets glowing on it like paper under a lamp.

### Print preview accuracy

`.sheet` is a CSS size container. Inside it, `1mm = 100cqw / paper-width`, and every tile is placed with `--x --y --w --h` in millimetres. A4 is exactly 210 × 297, landscape is 297 × 210. The preview shows:

- the safe area (5 mm),
- gutters (6 mm),
- bleed (3 mm, drawn as extended edge art with a magenta boundary),
- printer crop marks outside the bleed. On sides that face a neighbour, marks are **shortened** to `gutter/2 − bleed − offset`. With 6 mm gutter and 3 mm bleed they disappear, as the spec requires (§2.3).

Study groups (§2.4, R6) get a dashed group outline on screen.

In Arrange mode (`arrange.html`) each photo with its study versions is one block with a dashed outline; the selected block has four corner handles (24 px hit areas, 44 px on phones). The sheet is white in both themes, so these outlines use fixed colours with at least 3:1 on white instead of theme tokens, and forced colours switch them to system colours.

## Palette

The accent is terracotta (burnt sienna), the secondary is ultramarine, and decorative pigments are ochre, sap green and rose. These are all familiar paint colours. Decorative pigments are never used for text.

### Contrast (WCAG 2.2 AA)

Text needs 4.5:1. UI boundaries and focus need 3:1 (1.4.11).

| Pair | Light | Dark |
|---|---|---|
| ink on canvas | 13.1 | 14.8 |
| ink on surface | 14.9 | 13.4 |
| ink-muted on canvas | 6.6 | 8.9 |
| ink-muted on surface | 7.5 | 8.0 |
| ink-subtle on canvas / surface / sunken | 5.2 / 5.9 / 4.7 | 6.0 / 5.4 / 6.3 |
| on-accent on accent (primary button) | 5.7 | 7.2 |
| accent text on surface | 5.6 | 6.5 |
| on-secondary on secondary | 7.9 | 8.5 |
| secondary (links) on canvas | 6.8 | 8.5 |
| success / warning / danger on their soft bg | 5.9 / 5.8 / 5.6 | 7.2 / 7.9 / 6.8 |
| line-strong (control borders) on surface | 4.1 (≥3) | 3.7 (≥3) |
| focus ring on surface | 7.7 | 7.7 |
| safe-area guide / bleed guide on white paper | 4.6 / 4.4 | same (paper is white) |

The focus ring is 3 px with a 2 px offset in ultramarine (periwinkle in dark), on every interactive element via `:focus-visible`.

## Typography

These are the intended fonts. They are self-hosted in the real app; the mockups fall back to system fonts.

- **UI:** *Atkinson Hyperlegible Next*. It is very legible and covers a wide range of glyphs. Fallbacks: `system-ui`, then Hiragino Sans, PingFang SC, Apple SD Gothic Neo and Noto Sans CJK for ja/ko/zh-CN.
- **Display:** *Fraunces*, a soft, slightly "wonky" serif with an art-school feel. Used for headings only.
- **Hand:** *Caveat*. Decorative notes only (tip!, squint!). **Never essential text.** It has no CJK glyphs, so in ja/ko/zh-CN it will fall back to the UI font.
- **Mono:** used for numbers and dimensions (tabular figures), e.g. `210 × 297 mm`, `135 DPI`.
- **Scale:** 11 / 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 px, with a fluid display size. Dense panels use 14 px. Inputs on phones use 16 px so iOS doesn't zoom. Line height is 1.5–1.65 to give CJK room.

## Spacing, radii, elevation

- **Spacing:** 4 px base (`--space-1` … `--space-24`).
- **Radii:** 3 / 6 / 10 / 16 / 24 / pill, plus `--radius-sketch`, an asymmetric hand-drawn box.
- **Shadows:** warm-tinted shadows `xs`–`lg`, `--shadow-paper` for sheets, and `--shadow-sticker` (a hard offset shadow) for primary buttons and sketch cards.
- **Motion:** 120/200/320 ms with a gentle overshoot. `prefers-reduced-motion` turns it off.

## Component inventory

- **Buttons:** primary, secondary, ghost, danger, icon, large, block.
- **Form controls:**
  - inputs with a unit suffix (mm/in)
  - select
  - segmented control (radio)
  - switch (`role="switch"`)
  - checkbox chips and radio chips
  - range slider with live `<output>`
  - number stepper
  - colour input
  - hue swatches, plus a generated value ramp (OKLCH, from near-black to the lightest tint of the hue)
- **Feedback:**
  - notes (info / warning / danger / success / quiet)
  - badges
  - toasts
  - privacy pill
  - suggestion pill ("A4 fits 4 per page")
  - progress bar, page checklist, DPI meter
- **Structure:** tabs (WAI-ARIA, arrow keys), panels and panel sections, dialog (native `<dialog>`, which traps focus and closes on Esc), mobile bottom sheet, popover, card, sketch card, tape, scribble underline, highlight.
- **Preview:** desk, sheet, tile, bleed, crop marks, safe-area guide, group outline, selection tag, DPI warning chip, study label chip, line overlays (SVG with `vector-effect: non-scaling-stroke`, thickness in mm).
- **Images list:** thumbnail, name, pixel size, size mode, copies and low-DPI badges, edit and remove buttons.
- **Device frame:** for the mobile mockups.

## Responsive behaviour

- **≥ 1200 px:** three columns: images (288 px) · preview · settings (352 px).
- **960–1200 px:** narrower side panels (248 / 320 px).
- **< 960 px (tablet portrait and phones):** the real app switches to the **step flow** in `mobile-flow.html`. That flow has one task per screen, a tappable step bar, Back/Next in a thumb-reach footer, a swipeable page carousel, bottom sheets for per-image edits, and ≥ 44 px targets. (In the mockup CSS, the desktop workspace simply stacks below 960 px.)
- **Text length:** copy is short, and controls allow wrapping (segmented labels, chips, buttons) so pt-BR, it and es strings ~30% longer still fit.

## Accessibility notes

- Real `<button>`, `<label>`, `<fieldset>`/`<legend>`; switches use `role="switch"`.
- Tabs follow the WAI-ARIA pattern.
- Live regions announce progress and status.
- Disabled Export uses `aria-describedby` to give the reason.
- The page preview is `role="img"` with a text label. In the real app, each page should also expose a text list of what is on it.
- Colour is never the only signal: warnings always have an icon and text.

## Open design questions for the owner

1. **Where do Lines live on phones?** The spec's phone flow has five steps (Images → Page → Studies → Preview → Export) and no Lines step. The mockup puts Lines inside the Studies step as a collapsible section. Alternative: a sixth "Lines" step.
2. **Do crop marks and bleed sit inside the safe area?** The mockup keeps all printed content inside it: images, bleed and marks. This costs about 5 mm of image space per edge. The other option is to let marks run into the safe area.
3. **Default state of crop marks and bleed.** The spec gives no on/off defaults. The mockup assumes crop marks **on** and bleed **off**.
4. **Language picker placement.** Only English ships until M6. The mockup shows a language select in the app top bar and the landing footer. Should it be hidden until other languages exist?
5. **Brand fonts.** Is the Atkinson Hyperlegible + Fraunces + Caveat trio OK to self-host? These are OFL licences, roughly 150–250 KB of WOFF2 with subsetting. CJK uses system fonts.
6. **Model sizes in the copy.** The mockup says "4 MB" (face) and "9 MB" (pose) as placeholders. Real numbers come from the chosen MediaPipe models.
7. **Selection model.** Studies and Lines edit the image selected in the left list. Should clicking a tile on the page preview also select it? The mockup assumes yes (preview-click is visual only here).
8. **"Apply to all" scope.** Should it also include Lines when pressed in Studies, or stay separate per tab (as mocked)?
9. **Hue picker.** The mockup has 7 pigment swatches + neutral grey + a 0–360° hue slider. Is a full colour picker wanted instead, or is this enough?
10. **Values preview with N ≠ 5.** The mockup always shows 5 tones on the page. The real preview shows exactly N. Confirm the ramp ends: near-black (L ≈ 0.20) to lightest tint (L ≈ 0.95).
11. **Export file name.** The mockup proposes `artistica-<paper>-<date>.pdf`, editable before export.
12. **Logo.** Answered (review round 1, D11: a proper logo pass in M5). The three directions are in `logo.html`; direction A, "Sheet and spiral", is recommended for v0.5.0, and the owner chooses at the v1.0.0 sign-off.
