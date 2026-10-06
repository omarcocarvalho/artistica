import type { ImageDescriptor, ImageId } from '../../shared/model/image'

export const IMPORT_ERROR_CODES = [
  'cors',
  'network',
  'not-an-image',
  'unsupported-format',
  'decode-failed',
  'too-large',
] as const
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number]

/** Non-fatal notes about a successful import (additive to the overview contract; ruled: see overview CR-C3). */
export type ImportWarning = 'animated-gif'

export type ImportOutcome =
  | { ok: true; id: ImageId; warnings?: readonly ImportWarning[] }
  | { ok: false; source: string; error: ImportErrorCode }

export interface LoadedImage extends ImageDescriptor {
  readonly name: string
  /** The whole image, at most PREVIEW_LONG_SIDE_PX on its long side (pxW x pxH maps onto it). */
  readonly preview: ImageBitmap
  /** Compressed bytes that decode to pxW x pxH again; in memory only, never persisted or sent. */
  readonly source: Blob
  readonly thumbUrl: string
  readonly originalPxW: number
  readonly originalPxH: number
}
