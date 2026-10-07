import type { LineSettings } from './lines'
import type { StudySettings } from './study'
import type { Mm } from './units'

export type ImageId = string & { readonly __brand: 'ImageId' }
export type Rotation = 0 | 90 | 180 | 270

/** Crop in source pixels, in the EXIF-corrected orientation, before rotation and flips. */
export interface CropRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export type CropAspect = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9'

export type SizeMode =
  | { readonly kind: 'auto' }
  | { readonly kind: 'fixed'; readonly axis: 'width' | 'height'; readonly mm: Mm }

export interface ImageEdits {
  /** null = full image */
  readonly crop: CropRect | null
  readonly cropAspect: CropAspect
  /** Clockwise, applied after crop. */
  readonly rotation: Rotation
  /** Applied after rotation. */
  readonly flipH: boolean
  readonly flipV: boolean
  /** Integer 1..MAX_COPIES */
  readonly copies: number
  readonly size: SizeMode
}

export const MAX_COPIES = 50

export const DEFAULT_EDITS: ImageEdits = {
  crop: null,
  cropAspect: 'free',
  rotation: 0,
  flipH: false,
  flipV: false,
  copies: 1,
  size: { kind: 'auto' },
}

/** Everything about an image the pure core needs (no pixels). */
export interface ImageDescriptor {
  readonly id: ImageId
  /** SHA-256 of the source file bytes, lowercase hex. Orders layout ties the same way in every session. */
  readonly contentHash: string
  /** Decoded (possibly downscaled), EXIF-corrected. */
  readonly pxW: number
  readonly pxH: number
  readonly edits: ImageEdits
  /** Which versions print and how (M2-R1). DEFAULT_STUDY prints the original only. */
  readonly study: StudySettings
  /** Composition lines (M3-R1). DEFAULT_LINES prints none. */
  readonly lines: LineSettings
}

/** Pixel size after crop and rotation (what gets printed). */
export function printedPixelSize(img: Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>): {
  pxW: number
  pxH: number
} {
  const w = img.edits.crop?.w ?? img.pxW
  const h = img.edits.crop?.h ?? img.pxH
  const quarterTurn = img.edits.rotation === 90 || img.edits.rotation === 270
  return quarterTurn ? { pxW: h, pxH: w } : { pxW: w, pxH: h }
}

/** Downscale cap on load: longest preset paper side (Tabloid 431.8 mm) at 300 DPI. */
export const MAX_SOURCE_LONG_SIDE_PX = 5100
