# Artistica

Printable reference sheets for artists: pack your reference photos onto print-ready PDF pages, with crop marks, bleed, squint/value studies and composition lines. Runs entirely in your browser — your photos never leave your device.

**1.0 highlights.** Turn reference photos into print-ready sheets: crop, rotate and pack them onto pages, and export a PDF with crop marks and bleed. Print a blurred (squint) or value study next to each photo. Draw composition lines on it (grid, thirds, diagonals, golden ratio and spiral, centre lines), or guides found from the photo itself (an edge outline, face construction lines, a body pose figure). Save presets, and arrange the photos by hand when the automatic layout isn't what you want. The app and the landing page come in seven languages (English, Portuguese, Spanish, Italian, Japanese, Korean and Simplified Chinese). Everything runs in your browser and works offline once loaded; your photos are never uploaded or stored.

Live: https://omarcocarvalho.github.io/artistica/

## Development

Requires Node 24 and pnpm (via corepack).

    corepack enable
    pnpm install
    pnpm dev    # http://localhost:5173/artistica/

All commands and project conventions are in [CLAUDE.md](CLAUDE.md); the product spec is [docs/spec.md](docs/spec.md).

## Translations

Claude wrote the translations, and each language was reviewed against its glossary and style guide. Corrections from native speakers are welcome as GitHub issues or pull requests. [docs/i18n/README.md](docs/i18n/README.md) explains how.

Contributors are listed in [CONTRIBUTORS.md](CONTRIBUTORS.md). Picking up the work? Start with [HANDOVER.md](HANDOVER.md).

Licensed under the [MIT License](LICENSE).
