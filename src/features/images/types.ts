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
  readonly bitmap: ImageBitmap
  readonly thumbUrl: string
  readonly originalPxW: number
  readonly originalPxH: number
}
