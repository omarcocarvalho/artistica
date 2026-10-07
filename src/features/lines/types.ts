import type { CompositionLineType } from '../../shared/model/lines'
import type { Mm } from '../../shared/model/units'

export type PathCmd =
  | { readonly op: 'M'; readonly x: Mm; readonly y: Mm }
  | { readonly op: 'L'; readonly x: Mm; readonly y: Mm }
  | {
      readonly op: 'C'
      readonly x1: Mm
      readonly y1: Mm
      readonly x2: Mm
      readonly y2: Mm
      readonly x: Mm
      readonly y: Mm
    }

/** The picture as edited (M3-R2), in mm, origin top left, y down. */
export interface FrameSize {
  readonly w: Mm
  readonly h: Mm
}

export interface FramePath {
  readonly type: CompositionLineType
  readonly dashed: boolean
  /** Subpaths, each starting with 'M', in frame coordinates. */
  readonly cmds: readonly PathCmd[]
}
