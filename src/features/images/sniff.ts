import { readJpegInfo } from './exif'

export type SniffedKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic'
export interface Sniffed {
  readonly kind: SniffedKind
  readonly mime: string
}

const MIME: Record<SniffedKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
}
const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
])

const text = (b: Uint8Array, from: number, len: number): string =>
  String.fromCharCode(...b.subarray(from, from + len))

export function sniffImage(b: Uint8Array): Sniffed | null {
  const kind = ((): SniffedKind | null => {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
    if (b.length >= 8 && b[0] === 0x89 && text(b, 1, 3) === 'PNG') return 'png'
    if (b.length >= 6 && (text(b, 0, 6) === 'GIF87a' || text(b, 0, 6) === 'GIF89a')) return 'gif'
    if (b.length >= 12 && text(b, 0, 4) === 'RIFF' && text(b, 8, 4) === 'WEBP') return 'webp'
    if (b.length >= 12 && text(b, 4, 4) === 'ftyp' && HEIC_BRANDS.has(text(b, 8, 4))) return 'heic'
    return null
  })()
  return kind === null ? null : { kind, mime: MIME[kind] }
}

export function isAnimatedGif(b: Uint8Array): boolean {
  if (b.length < 14 || text(b, 0, 3) !== 'GIF') return false
  let pos = 13
  const flags = b[10] ?? 0
  if (flags & 0x80) pos += 3 * 2 ** ((flags & 7) + 1)
  const skipSubBlocks = (): void => {
    while (pos < b.length) {
      const n = b[pos] ?? 0
      pos += 1 + n
      if (n === 0) return
    }
  }
  let frames = 0
  while (pos < b.length) {
    const block = b[pos]
    if (block === 0x3b) return false
    if (block === 0x21) {
      pos += 2
      skipSubBlocks()
    } else if (block === 0x2c) {
      frames += 1
      if (frames > 1) return true
      const f = b[pos + 9] ?? 0
      pos += 10
      if (f & 0x80) pos += 3 * 2 ** ((f & 7) + 1)
      pos += 1
      skipSubBlocks()
    } else {
      return false
    }
  }
  return false
}

/** Pixel size declared in the header, so absurd images are refused before decoding. */
export function readDeclaredSize(
  b: Uint8Array,
  kind: SniffedKind,
): { w: number; h: number } | null {
  if (kind === 'jpeg') {
    const info = readJpegInfo(b)
    return info?.width != null && info.height != null ? { w: info.width, h: info.height } : null
  }
  if (kind === 'png' && b.length >= 24) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { w: v.getUint32(16), h: v.getUint32(20) }
  }
  return null
}

export function looksLikeHeicByLabel(mime: string, name: string): boolean {
  return /^image\/(heic|heif)(-sequence)?$/i.test(mime) || /\.(heic|heif)$/i.test(name)
}
