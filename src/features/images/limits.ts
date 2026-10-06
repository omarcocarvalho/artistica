export const MAX_FILE_BYTES = 100 * 1024 * 1024
/** Refuse to decode anything declaring more pixels than this (about 14000 x 14000). */
export const MAX_DECODED_PIXELS = 200_000_000
/** Some iOS Safari versions return a blank canvas above this area. */
export const MAX_CANVAS_AREA = 16_777_216
export const THUMB_LONG_SIDE_PX = 256
/** A phone must not decode 20 x 12 MP at once. HEIC WASM decoding is memory-heavy too. */
export const DECODE_CONCURRENCY = 2
/** Links pasted together download this many at a time, so they do not all sit in memory at once. */
export const FETCH_CONCURRENCY = 2
/** A download aborts after this long without progress (no headers, or no new body chunk). */
export const FETCH_TIMEOUT_MS = 30_000
export const PROBE_TIMEOUT_MS = 8_000
export const MAX_PASTED_URLS = 20
/** Bytes read from the start of a file for sniffing and EXIF. */
export const HEAD_BYTES = 262_144
/** Long side of the bitmap kept per image for the preview and crop editor. Export decodes the source again. */
export const PREVIEW_LONG_SIDE_PX = 2048
