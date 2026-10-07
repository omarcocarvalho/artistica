# Image fixtures for E2E

Generated, not hand-edited. Regenerate on macOS with:

    node src/features/images/__fixtures__/generate.mjs

- JPEG/PNG/WebP: drawn and encoded by Playwright's Chromium canvas (no metadata, no GPS). EXIF variants only add an orientation tag via `injectExifOrientation`.
- GIFs: written byte by byte by the script.
- `photo.heic`: encoded from `quadrants.png` with macOS `sips -s format heic quadrants.png --out photo.heic`. No third-party sample is used, so there is no external licence. On Linux use `heif-enc quadrants.png -o photo.heic`.
- `mislabelled-heic.jpg` is a copy of `photo.heic`; `notes.pdf` is a stub.
- `value-ramp.png` (900 × 600, about 11 KB): full lightness range for value studies and the studies exit criterion. A grey ramp 0 → 255 on the top half and the same ramp tinted towards ochre on the bottom half, written in pure node by `value-ramp.ts` (regenerate it alone, on any OS, with `--only=value-ramp`). `fixtures.test.ts` pins the file to the generator's bytes.

Every other file is under 1 KB. They are never imported by the app, so they are not bundled.
