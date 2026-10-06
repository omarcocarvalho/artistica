import { MAX_SOURCE_LONG_SIDE_PX } from '../../shared/model/image'
import { ImportFailure } from './errors'
import { orientationTransform, readJpegInfo, type Matrix } from './exif'
import {
  HEAD_BYTES,
  MAX_CANVAS_AREA,
  MAX_DECODED_PIXELS,
  MAX_FILE_BYTES,
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
  loadHeicConverter(): Promise<(blob: Blob) => Promise<Blob>>
  createObjectURL(blob: Blob): string
}

export interface DecodedImage {
  readonly bitmap: ImageBitmap
  readonly pxW: number
  readonly pxH: number
  readonly originalPxW: number
  readonly originalPxH: number
  readonly thumbUrl: string
  readonly animatedGif: boolean
}

interface Oriented {
  readonly bitmap: ImageBitmap
  /** Null when the bitmap is already upright. */
  readonly transform: { matrix: Matrix; width: number; height: number } | null
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

async function decodeHeic(blob: Blob, deps: DecodeDeps): Promise<Oriented> {
  try {
    return { bitmap: await deps.createImageBitmap(blob), transform: null }
  } catch {
    /* no native HEIC decoder: fall through to the lazy WASM converter */
  }
  try {
    const convert = await deps.loadHeicConverter()
    const jpeg = await convert(blob)
    return {
      bitmap: await deps.createImageBitmap(jpeg, { imageOrientation: 'from-image' }),
      transform: null,
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

export async function decodeImage(
  blob: Blob,
  name: string,
  deps: DecodeDeps,
): Promise<DecodedImage> {
  if (blob.size > MAX_FILE_BYTES) throw new ImportFailure('too-large')
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer())
  const sniffed = sniffImage(head)
  const kind: SniffedKind | null =
    sniffed?.kind ?? (looksLikeHeicByLabel(blob.type, name) ? 'heic' : null)
  if (kind === null) throw new ImportFailure('unsupported-format')
  const declared = readDeclaredSize(head, kind)
  if (declared !== null && declared.w * declared.h > MAX_DECODED_PIXELS)
    throw new ImportFailure('too-large')
  const animatedGif = kind === 'gif' && isAnimatedGif(new Uint8Array(await blob.arrayBuffer()))

  const oriented =
    kind === 'heic' ? await decodeHeic(blob, deps) : await decodeStandard(blob, kind, head, deps)
  let original: ImageBitmap | null = oriented.bitmap
  let final: ImageBitmap | null = null
  try {
    const ow = oriented.transform?.width ?? oriented.bitmap.width
    const oh = oriented.transform?.height ?? oriented.bitmap.height
    if (ow * oh > MAX_DECODED_PIXELS) throw new ImportFailure('too-large')
    const plan = planDownscale(ow, oh)
    // A decoded, upright, full-size JPEG has no alpha and needs no copy. Everything else is repainted
    // onto white (flattening transparency, applying manual orientation, downscaling).
    if (kind !== 'jpeg' || oriented.transform !== null || plan.scale < 1) {
      const canvas = deps.createCanvas(plan.w, plan.h)
      try {
        const m = oriented.transform?.matrix ?? IDENTITY
        const sx = plan.w / ow
        const sy = plan.h / oh
        const scaled: Matrix = [sx * m[0], sy * m[1], sx * m[2], sy * m[3], sx * m[4], sy * m[5]]
        if (!canvas.paint(original, scaled)) throw new ImportFailure('decode-failed')
        original.close()
        original = null
        final = await canvas.toBitmap()
      } finally {
        canvas.release()
      }
    } else {
      final = original
      original = null
    }
    const thumbUrl = await makeThumb(final, deps)
    return {
      bitmap: final,
      pxW: final.width,
      pxH: final.height,
      originalPxW: ow,
      originalPxH: oh,
      thumbUrl,
      animatedGif,
    }
  } catch (e) {
    original?.close()
    final?.close()
    throw e instanceof ImportFailure ? e : new ImportFailure('decode-failed', { cause: e })
  }
}
