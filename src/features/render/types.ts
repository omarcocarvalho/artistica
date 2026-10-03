import type { CropRect, ImageId, Rotation } from '../../shared/model/image'
import type { SizeMm } from '../../shared/model/paper'
import type { Mm } from '../../shared/model/units'
import type { RectMm } from '../layout/types'

export interface DrawTile {
  readonly imageId: ImageId
  readonly trim: RectMm // page coords
  readonly bleedMm: Mm // 0 when bleed off
  readonly crop: CropRect // resolved (full image when edits.crop is null)
  readonly rotation: Rotation // edits.rotation + (turned ? 90 : 0), mod 360
  readonly flipH: boolean
  readonly flipV: boolean
  readonly lowDpi: boolean
  /** True when B scaled a fixed-size placement down to fit the page (placement warning 'scaled-to-fit', CR-X1, spec §2.4). */
  readonly scaledToFit: boolean
}

export interface Segment {
  readonly x1: Mm
  readonly y1: Mm
  readonly x2: Mm
  readonly y2: Mm
}

export interface PageModel {
  readonly index: number
  readonly size: SizeMm // oriented
  readonly safeArea: RectMm
  readonly tiles: readonly DrawTile[]
  readonly cropMarks: readonly Segment[] // already shortened so they never cross another tile's trim+bleed
}

/** One tile's pixels (trim + bleed), encoded once and embedded in the PDF. */
export interface EncodedTileImage {
  readonly format: 'jpeg' | 'png'
  readonly bytes: Uint8Array
  readonly pxW: number
  readonly pxH: number
}
