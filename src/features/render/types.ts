import type { CropRect, ImageId, Rotation } from '../../shared/model/image'
import type { LineType } from '../../shared/model/lines'
import type { SizeMm } from '../../shared/model/paper'
import type { StudyVersion, TileStudy } from '../../shared/model/study'
import type { Mm } from '../../shared/model/units'
import type { RectMm } from '../layout/types'
import type { PathCmd } from '../lines/types'

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
  /** Which study version this tile prints; 'original' for photos without studies. */
  readonly version: StudyVersion
  /** tileStudyFor(version, image.study): null for 'original'. */
  readonly study: TileStudy | null
}

/** A study group's outline on screen, never printed (M2-R14). */
export interface StudyGroupOutline {
  readonly imageId: ImageId
  readonly block: RectMm
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
  /** Placements with ≥ 2 tiles, in placement order. Screen-only. */
  readonly groups: readonly StudyGroupOutline[]
  /** In tile order; a tile whose image draws no line has no entry. */
  readonly lines: readonly TileLines[]
}

export interface LineStroke {
  /** [] = solid; otherwise [dash, gap] in mm. */
  readonly dashMm: readonly Mm[]
  /** How far into the dash pattern each subpath starts; absent = 0. */
  readonly dashPhaseMm?: Mm
  /** Page mm. */
  readonly cmds: readonly PathCmd[]
}

/** One tile's composition lines and guides, replayed as-is by the PDF and the preview (M3-R6, M4-R11). */
export interface TileLines {
  /** Index into PageModel.tiles. */
  readonly tileIndex: number
  /** That tile's trim (M3-R4). */
  readonly clip: RectMm
  /** '#rrggbb'. */
  readonly colour: string
  /** 0..1. */
  readonly opacity: number
  readonly widthMm: Mm
  /** The types drawn, in canonical order. */
  readonly types: readonly LineType[]
  /** The solid batch first, then the dashed batch; an empty batch is omitted (M3-R7). */
  readonly strokes: readonly LineStroke[]
}

/** One tile's pixels (trim + bleed), encoded once and embedded in the PDF. */
export interface EncodedTileImage {
  readonly format: 'jpeg' | 'png'
  readonly bytes: Uint8Array
  readonly pxW: number
  readonly pxH: number
}
