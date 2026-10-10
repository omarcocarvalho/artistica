import { MAX_SOURCE_LONG_SIDE_PX } from '../../shared/model/image'
import { ImportFailure } from './errors'
import { orientationTransform, readJpegInfo, type Matrix } from './exif'
import {
  HEAD_BYTES,
  MAX_CANVAS_AREA,
  MAX_DECODED_PIXELS,
  MAX_FILE_BYTES,
  PREVIEW_LONG_SIDE_PX,
  THUMB_LONG_SIDE_PX,
} from './limits'
import {
  isAnimatedGif,
  looksLikeHeicByLabel,
  readDeclaredSize,
  sniffImage,
  type SniffedKind,
} from './sniff'

export interface CanvasLike {
  readonly width: number
  readonly height: number
  /** Fill white, then draw `bitmap` under `matrix`. False if there is no 2D context. */
  paint(bitmap: ImageBitmap, matrix: Matrix): boolean
  toBlob(type: string, quality: number): Promise<Blob | null>
  toBitmap(): Promise<ImageBitmap>
  release(): void
}

export interface DecodeDeps {
  createImageBitmap(blob: Blob, options?: ImageBitmapOptions): Promise<ImageBitmap>
  createCanvas(w: number, h: number): CanvasLike
  browserAppliesExif(): Promise<boolean>
  /** Should a downscaled decode pass `resizeWidth`/`resizeHeight` to createImageBitmap? */
  resizeOnDecode(): Promise<boolean>
  loadHeicConverter(): Promise<(blob: Blob) => Promise<Blob>>
  createObjectURL(blob: Blob): string
}

export interface DecodedImage {
  /** The whole image at most PREVIEW_LONG_SIDE_PX on its long side. */
  readonly preview: ImageBitmap
  /** Decoded size, capped and upright: what decodeFullImage(source) returns. */
  readonly pxW: number
  readonly pxH: number
  readonly originalPxW: number
  readonly originalPxH: number
  readonly thumbUrl: string
  readonly animatedGif: boolean
  /** Compressed bytes that decodeFullImage decodes to pxW x pxH. Kept in memory only. */
  readonly source: Blob
}

interface Oriented {
  readonly bitmap: ImageBitmap
  /** Null when the bitmap is already upright. */
  readonly transform: { matrix: Matrix; width: number; height: number } | null
}

interface Size {
  readonly w: number
  readonly h: number
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export function planDownscale(w: number, h: number): { w: number; h: number; scale: number } {
  const scale = Math.min(
    1,
    MAX_SOURCE_LONG_SIDE_PX / Math.max(w, h),
    Math.sqrt(MAX_CANVAS_AREA / (w * h)),
  )
  if (scale >= 1) return { w, h, scale: 1 }
  return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)), scale }
}

async function decodeStandard(
  blob: Blob,
  kind: SniffedKind,
  head: Uint8Array,
  deps: DecodeDeps,
): Promise<Oriented> {
  const orientation = kind === 'jpeg' ? (readJpegInfo(head)?.orientation ?? 1) : 1
  try {
    if (orientation === 1 || (await deps.browserAppliesExif())) {
      return {
        bitmap: await deps.createImageBitmap(blob, { imageOrientation: 'from-image' }),
        transform: null,
      }
    }
    const bitmap = await deps.createImageBitmap(blob, { imageOrientation: 'none' })
    return { bitmap, transform: orientationTransform(orientation, bitmap.width, bitmap.height) }
  } catch (cause) {
    throw new ImportFailure('decode-failed', { cause })
  }
}

async function decodeHeic(blob: Blob, deps: DecodeDeps): Promise<Oriented & { source: Blob }> {
  try {
    return { bitmap: await deps.createImageBitmap(blob), transform: null, source: blob }
  } catch {
    /* no native HEIC decoder: fall through to the lazy WASM converter */
  }
  try {
    const convert = await deps.loadHeicConverter()
    const jpeg = await convert(blob)
    return {
      bitmap: await deps.createImageBitmap(jpeg, { imageOrientation: 'from-image' }),
      transform: null,
      source: jpeg,
    }
  } catch (cause) {
    throw new ImportFailure('decode-failed', { cause })
  }
}

async function makeThumb(bitmap: ImageBitmap, deps: DecodeDeps): Promise<string> {
  const long = Math.max(bitmap.width, bitmap.height)
  const s = Math.min(1, THUMB_LONG_SIDE_PX / long)
  const w = Math.max(1, Math.round(bitmap.width * s))
  const h = Math.max(1, Math.round(bitmap.height * s))
  const canvas = deps.createCanvas(w, h)
  try {
    if (!canvas.paint(bitmap, [w / bitmap.width, 0, 0, h / bitmap.height, 0, 0])) {
      throw new ImportFailure('decode-failed')
    }
    const blob = await canvas.toBlob('image/jpeg', 0.8)
    if (blob === null) throw new ImportFailure('decode-failed')
    return deps.createObjectURL(blob)
  } finally {
    canvas.release()
  }
}

interface Sniffed {
  readonly kind: SniffedKind
  readonly head: Uint8Array
  readonly declared: Size | null
}

async function sniff(blob: Blob, name: string): Promise<Sniffed> {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer())
  const sniffed = sniffImage(head)
  const kind: SniffedKind | null =
    sniffed?.kind ?? (looksLikeHeicByLabel(blob.type, name) ? 'heic' : null)
  if (kind === null) throw new ImportFailure('unsupported-format')
  const declared = readDeclaredSize(head, kind)
  if (declared !== null && declared.w * declared.h > MAX_DECODED_PIXELS)
    throw new ImportFailure('too-large')
  return { kind, head, declared }
}

/**
 * Decodes straight to `pick(upright size)` in one createImageBitmap call, with the upright size
 * taken from the header. Null when that size is not smaller, the header has no usable size (GIF,
 * WebP, HEIC, or a zero side such as a JPEG whose height is set later by a DNL marker), the browser
 * should not resize, or the browser leaves EXIF rotation to the app.
 */
async function decodeResized(
  blob: Blob,
  { kind, head, declared }: Sniffed,
  pick: (upright: Size) => Size,
  deps: DecodeDeps,
): Promise<{ bitmap: ImageBitmap; upright: Size; size: Size } | null> {
  if (declared === null || declared.w < 1 || declared.h < 1) return null
  const orientation = kind === 'jpeg' ? (readJpegInfo(head)?.orientation ?? 1) : 1
  const upright = orientation >= 5 ? { w: declared.h, h: declared.w } : declared
  const size = pick(upright)
  if (size.w >= upright.w && size.h >= upright.h) return null
  if (!(await deps.resizeOnDecode())) return null
  if (orientation !== 1 && !(await deps.browserAppliesExif())) return null
  try {
    const bitmap = await deps.createImageBitmap(blob, {
      imageOrientation: 'from-image',
      resizeWidth: size.w,
      resizeHeight: size.h,
      resizeQuality: 'high',
    })
    return { bitmap, upright, size }
  } catch (cause) {
    throw new ImportFailure('decode-failed', { cause })
  }
}

/** Upright size of a decode. Closes it and throws when it is too large. */
function uprightSize(oriented: Oriented): { w: number; h: number } {
  const w = oriented.transform?.width ?? oriented.bitmap.width
  const h = oriented.transform?.height ?? oriented.bitmap.height
  if (w * h > MAX_DECODED_PIXELS) {
    oriented.bitmap.close()
    throw new ImportFailure('too-large')
  }
  return { w, h }
}

/**
 * The whole upright image at w x h. Takes ownership of `oriented.bitmap` and closes it exactly once
 * on every path; an upright JPEG already at w x h is returned as is (it has no alpha to flatten).
 */
async function paintUpright(
  oriented: Oriented,
  kind: SniffedKind,
  w: number,
  h: number,
  deps: DecodeDeps,
): Promise<ImageBitmap> {
  let original: ImageBitmap | null = oriented.bitmap
  try {
    const ow = oriented.transform?.width ?? original.width
    const oh = oriented.transform?.height ?? original.height
    if (kind === 'jpeg' && oriented.transform === null && w === ow && h === oh) {
      const same = original
      original = null
      return same
    }
    const canvas = deps.createCanvas(w, h)
    try {
      const m = oriented.transform?.matrix ?? IDENTITY
      const sx = w / ow
      const sy = h / oh
      const scaled: Matrix = [sx * m[0], sy * m[1], sx * m[2], sy * m[3], sx * m[4], sy * m[5]]
      if (!canvas.paint(original, scaled)) throw new ImportFailure('decode-failed')
      original.close()
      original = null
      return await canvas.toBitmap()
    } finally {
      canvas.release()
    }
  } catch (e) {
    throw e instanceof ImportFailure ? e : new ImportFailure('decode-failed', { cause: e })
  } finally {
    original?.close()
  }
}

function previewSize(w: number, h: number): { w: number; h: number } {
  const s = PREVIEW_LONG_SIDE_PX / Math.max(w, h)
  if (s >= 1) return { w, h }
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

const previewTarget = (u: Size): Size => {
  const full = planDownscale(u.w, u.h)
  return previewSize(full.w, full.h)
}

/** The upright preview bitmap, the upright original size, and the compressed bytes to keep. */
async function decodePreview(
  blob: Blob,
  sniffed: Sniffed,
  deps: DecodeDeps,
): Promise<{ preview: ImageBitmap; upright: Size; source: Blob }> {
  const { kind, head } = sniffed
  const resized = await decodeResized(blob, sniffed, previewTarget, deps)
  if (resized !== null) {
    const { bitmap, upright, size } = resized
    const preview = await paintUpright({ bitmap, transform: null }, kind, size.w, size.h, deps)
    return { preview, upright, source: blob }
  }
  const decoded =
    kind === 'heic'
      ? await decodeHeic(blob, deps)
      : { ...(await decodeStandard(blob, kind, head, deps)), source: blob }
  const upright = uprightSize(decoded)
  const size = previewTarget(upright)
  const preview = await paintUpright(decoded, kind, size.w, size.h, deps)
  return { preview, upright, source: decoded.source }
}

/**
 * Import decode: checks the file, then keeps only a preview bitmap, a thumbnail and the compressed
 * source. No full-size bitmap outlives this call.
 */
export async function decodeImage(
  blob: Blob,
  name: string,
  deps: DecodeDeps,
): Promise<DecodedImage> {
  if (blob.size > MAX_FILE_BYTES) throw new ImportFailure('too-large')
  const sniffed = await sniff(blob, name)
  const animatedGif =
    sniffed.kind === 'gif' && isAnimatedGif(new Uint8Array(await blob.arrayBuffer()))
  const { preview, upright, source } = await decodePreview(blob, sniffed, deps)
  const full = planDownscale(upright.w, upright.h)
  try {
    const thumbUrl = await makeThumb(preview, deps)
    return {
      preview,
      pxW: full.w,
      pxH: full.h,
      originalPxW: upright.w,
      originalPxH: upright.h,
      thumbUrl,
      animatedGif,
      source,
    }
  } catch (e) {
    preview.close()
    throw e instanceof ImportFailure ? e : new ImportFailure('decode-failed', { cause: e })
  }
}

/**
 * Decodes an imported image's `source` again at its full pxW x pxH (upright, capped).
 * The caller owns the result and must close it.
 */
export async function decodeFullImage(
  source: Blob,
  name: string,
  deps: DecodeDeps,
): Promise<ImageBitmap> {
  const sniffed = await sniff(source, name)
  const { kind, head } = sniffed
  const target = (u: Size): Size => planDownscale(u.w, u.h)
  const resized = await decodeResized(source, sniffed, target, deps)
  if (resized !== null) {
    const { bitmap, size } = resized
    return paintUpright({ bitmap, transform: null }, kind, size.w, size.h, deps)
  }
  const decoded =
    kind === 'heic'
      ? await decodeHeic(source, deps)
      : await decodeStandard(source, kind, head, deps)
  const full = target(uprightSize(decoded))
  return paintUpright(decoded, kind, full.w, full.h, deps)
}
