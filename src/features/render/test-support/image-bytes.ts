import { crc32, deflateSync } from 'node:zlib'

/** Test-only tiny images: a 2×2 baseline JPEG (metadata stripped) and a 2×2 RGB PNG (no alpha). */
const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))

export const TINY_JPEG = fromBase64(
  '/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwAGBgYGBgYKBgYKDgoKCg4SDg4ODhIXEhISEhIXHBcXFxcXFxwcHBwcHBwcIiIiIiIiJycnJycsLCwsLCwsLCws/9sAQwEHBwcLCgsTCgoTLh8aHy4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4u/90ABAAB/9oADAMBAAIRAxEAPwD3XwfpemTeEtHmmtYXd7C2ZmaNSSTEpJJI5Jro/wCx9I/584P+/S/4Vl+C/wDkTtE/7B9r/wCilrpaAP/Z',
)

export const TINY_PNG = fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAAMIM/////w8AH+4F+7C4l8kAAAAASUVORK5CYII=',
)

/** A 2×2 RGBA PNG with real alpha: pdf-lib embeds it as an image plus an SMask image. */
export const TINY_PNG_ALPHA = fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DQwPAfDCEMADxfBvtDmEI+AAAAAElFTkSuQmCC',
)

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Test-only RGB PNG of vertical stripes, one per colour (exactly colours.length distinct colours). */
export function stripePng(
  colours: readonly (readonly [number, number, number])[],
  stripeW = 2,
  h = 2,
): Uint8Array {
  const w = colours.length * stripeW
  const ihdr = new Uint8Array(13)
  const header = new DataView(ihdr.buffer)
  header.setUint32(0, w)
  header.setUint32(4, h)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type RGB
  const stride = w * 3 + 1 // each row starts with filter byte 0 (none)
  const raw = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      raw.set(colours[Math.floor(x / stripeW)] ?? [0, 0, 0], y * stride + 1 + x * 3)
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array()),
  ]
  // A standalone array, never a pooled Buffer view: pdf-lib's PNG decoder ignores byteOffset.
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
