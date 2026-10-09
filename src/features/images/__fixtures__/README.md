# Image fixtures for E2E

Generated, not hand-edited. Regenerate on macOS with:

    node src/features/images/__fixtures__/generate.mjs

- JPEG/PNG/WebP: drawn and encoded by Playwright's Chromium canvas (no metadata, no GPS). EXIF variants only add an orientation tag via `injectExifOrientation`.
- GIFs: written byte by byte by the script.
- `photo.heic`: encoded from `quadrants.png` with macOS `sips -s format heic quadrants.png --out photo.heic`. No third-party sample is used, so there is no external licence. On Linux use `heif-enc quadrants.png -o photo.heic`.
- `mislabelled-heic.jpg` is a copy of `photo.heic`; `notes.pdf` is a stub.
- `value-ramp.png` (900 × 600, about 11 KB): full lightness range for value studies and the studies exit criterion. A grey ramp 0 → 255 on the top half and the same ramp tinted towards ochre on the bottom half, written in pure node by `value-ramp.ts` (regenerate it alone, on any OS, with `--only=value-ramp`). `fixtures.test.ts` pins the file to the generator's bytes.
- `flat-grey.png` (1200 × 900, about 4 KB): every pixel RGB (170, 170, 170), for the composition-lines exit criterion, where a line's colour must stand apart from the photo's on every engine. Written in pure node by `flat-grey.ts` (`--only=flat-grey`) and pinned to the generator's bytes like `value-ramp.png`.

- `portrait.jpg` and `figure.jpg`: public-domain photos, not generated. See "Photos" below.

Every other file is under 1 KB. They are never imported by the app, so they are not bundled.

## Photos

Two public-domain photos for the face and pose guides (owner Q12, 2026-10-09: public-domain photos, not the owner's). Each is the Commons original, scaled to a 2048 px long side with ImageMagick (`magick <original> -auto-orient -colorspace sRGB -filter Lanczos -resize 2048x2048 -strip -sampling-factor 4:2:0 -quality 85 <name>`): sRGB, no EXIF, XMP, ICC or GPS segment (`src/features/lines/guides/fixtures.test.ts` checks this). Their face and pose landmarks, recorded with the real detector, are in `src/features/lines/guides/__fixtures__/`.

| File | Size | Subject | Source page | Author | Licence (as stated on the file page) | Downloaded |
| --- | --- | --- | --- | --- | --- | --- |
| `portrait.jpg` | 1361 × 2048, 358 KB | Official portrait of First Lady Michelle Obama, 2013 (one frontal face) | https://commons.wikimedia.org/wiki/File:Michelle_Obama_2013_official_portrait.jpg (original: https://www.flickr.com/photos/whitehouse/8491445521/) | Official White House Photo by Chuck Kennedy | Public domain, `{{PD-USGov-POTUS}}`: a work of an employee of the Executive Office of the President, made in the course of official duties | 2026-10-09 |
| `figure.jpg` | 1536 × 2048, 151 KB | Full-length portrait of NASA astronaut Jessica Meir, 2016 (standing, every limb visible) | https://commons.wikimedia.org/wiki/File:Jessica_Meir_full_length_portrait_(1).jpg (original: https://www.flickr.com/photos/nasa2explore/25538006340/, NASA id JSC2016-E-016505) | NASA / Robert Markowitz | Public domain, `{{PD-USGov-NASA}}`: a work of NASA | 2026-10-09 |

Commons originals as downloaded: `Michelle_Obama_2013_official_portrait.jpg` 2722 × 4096, SHA-1 `579641da568e6c24d39b48540420f4d095137cee`; `Jessica_Meir_full_length_portrait_(1).jpg` 3000 × 4000, SHA-1 `53e5fa77180a3f7289b12ad65214606d2087990b` (both match the SHA-1 Commons publishes for the file).

Public domain covers the copyright only. Both subjects are public figures photographed for official portraits; `figure.jpg` shows NASA insignia and a US flag on the flight suit, whose use NASA restricts (14 CFR 1221) beyond incidental appearance. The photos are test inputs only: the app never loads or ships them, and no endorsement is implied.
