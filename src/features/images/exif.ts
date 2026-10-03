export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
/** Canvas `setTransform(a, b, c, d, e, f)` order: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = readonly [number, number, number, number, number, number]

export interface JpegInfo {
  readonly orientation: ExifOrientation
  readonly width: number | null
  readonly height: number | null
}

const isOrientation = (v: number): v is ExifOrientation => Number.isInteger(v) && v >= 1 && v <= 8
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
const hasExifHeader = (b: Uint8Array, at: number): boolean =>
  EXIF_HEADER.every((v, i) => b[at + i] === v)
const isSof = (m: number): boolean =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc

function readTiffOrientation(view: DataView, tiff: number, end: number): ExifOrientation | null {
  if (tiff + 8 > end) return null
  const order = view.getUint16(tiff)
  const le = order === 0x4949
  if (!le && order !== 0x4d4d) return null
  if (view.getUint16(tiff + 2, le) !== 0x002a) return null
  const ifd = tiff + view.getUint32(tiff + 4, le)
  if (ifd + 2 > end) return null
  const count = view.getUint16(ifd, le)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return null
    if (view.getUint16(entry, le) === 0x0112) {
      const v = view.getUint16(entry + 8, le)
      return isOrientation(v) ? v : null
    }
  }
  return null
}

export function readJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let orientation: ExifOrientation = 1
  let width: number | null = null
  let height: number | null = null
  let pos = 2
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) break
    const marker = bytes[pos + 1] ?? 0
    if (marker === 0xff) {
      pos += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      pos += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break
    const len = view.getUint16(pos + 2)
    if (len < 2) break
    if (marker === 0xe1 && hasExifHeader(bytes, pos + 4)) {
      orientation =
        readTiffOrientation(view, pos + 10, Math.min(bytes.length, pos + 2 + len)) ?? orientation
    } else if (isSof(marker) && pos + 9 <= bytes.length) {
      height = view.getUint16(pos + 5)
      width = view.getUint16(pos + 7)
    }
    pos += 2 + len
  }
  return { orientation, width, height }
}

function buildExifSegment(o: ExifOrientation): Uint8Array {
  const seg = new Uint8Array(36)
  const dv = new DataView(seg.buffer)
  dv.setUint16(0, 0xffe1)
  dv.setUint16(2, 34)
  seg.set(EXIF_HEADER, 4)
  const t = 10
  dv.setUint16(t, 0x4d4d)
  dv.setUint16(t + 2, 0x002a)
  dv.setUint32(t + 4, 8)
  dv.setUint16(t + 8, 1)
  dv.setUint16(t + 10, 0x0112)
  dv.setUint16(t + 12, 3)
  dv.setUint32(t + 14, 1)
  dv.setUint16(t + 18, o)
  dv.setUint32(t + 22, 0)
  return seg
}

/** Returns a copy of `jpeg` whose only EXIF segment declares `orientation` (placed after any JFIF APP0). */
export function injectExifOrientation(jpeg: Uint8Array, orientation: ExifOrientation): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG')
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength)
  const chunks: Uint8Array[] = [jpeg.subarray(0, 2)]
  let inserted = false
  const insert = (): void => {
    if (!inserted) {
      chunks.push(buildExifSegment(orientation))
      inserted = true
    }
  }
  let pos = 2
  while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff) {
    const marker = jpeg[pos + 1] ?? 0
    if (marker === 0xda || marker === 0xd9) break
    const end = pos + 2 + view.getUint16(pos + 2)
    const seg = jpeg.subarray(pos, end)
    if (marker === 0xe0) {
      chunks.push(seg)
    } else {
      insert()
      if (!(marker === 0xe1 && hasExifHeader(jpeg, pos + 4))) chunks.push(seg)
    }
    pos = end
  }
  insert()
  chunks.push(jpeg.subarray(pos))
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** Affine transform that draws a (w x h) source upright, plus the output size. */
export function orientationTransform(
  o: ExifOrientation,
  w: number,
  h: number,
): { matrix: Matrix; width: number; height: number } {
  switch (o) {
    case 1:
      return { matrix: [1, 0, 0, 1, 0, 0], width: w, height: h }
    case 2:
      return { matrix: [-1, 0, 0, 1, w, 0], width: w, height: h }
    case 3:
      return { matrix: [-1, 0, 0, -1, w, h], width: w, height: h }
    case 4:
      return { matrix: [1, 0, 0, -1, 0, h], width: w, height: h }
    case 5:
      return { matrix: [0, 1, 1, 0, 0, 0], width: h, height: w }
    case 6:
      return { matrix: [0, 1, -1, 0, h, 0], width: h, height: w }
    case 7:
      return { matrix: [0, -1, -1, 0, h, w], width: h, height: w }
    case 8:
      return { matrix: [0, -1, 1, 0, 0, w], width: h, height: w }
  }
}
