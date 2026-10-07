import type { ImageId, SizeMode } from '../../shared/model/image'
import type { SizeMm } from '../../shared/model/paper'
import type { Mm } from '../../shared/model/units'

/** One layout unit: one copy of an image, with one tile per selected study version. */
export interface LayoutItemInput {
  readonly key: string // `${contentHash}~${occurrence}#${copyIndex}` — unique, stable across sessions
  readonly imageId: ImageId
  readonly aspect: number // printed width / height of ONE tile (after crop & rotation)
  readonly maxPrintWidthMm: Mm // 300-DPI cap for ONE tile's width
  readonly size: SizeMode // from edits
  readonly tiles: number // ≥ 1, the image's selected study versions; tiles of a group are placed side by side (row or column), separated by the gutter
}
export type PlacementWarning = 'low-dpi' | 'scaled-to-fit'
export interface RectMm {
  readonly x: Mm
  readonly y: Mm
  readonly w: Mm
  readonly h: Mm
}
export interface Placement {
  readonly key: string
  readonly imageId: ImageId
  readonly block: RectMm // trim box of the whole group, page coords
  readonly tiles: readonly RectMm[] // trim box of each tile, page coords, as printed
  readonly turned: boolean // true = the engine turned this item 90° clockwise to pack it
  readonly warnings: readonly PlacementWarning[]
}
export interface LayoutResult {
  readonly orientation: 'portrait' | 'landscape' // resolved (never 'auto')
  readonly pageSize: SizeMm // oriented
  readonly pages: readonly { readonly placements: readonly Placement[] }[]
  readonly suggestedPerPage: number // "this paper fits N references comfortably per page"
}
