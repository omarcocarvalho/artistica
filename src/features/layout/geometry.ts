import type { SizeMm } from '../../shared/model/paper'
import type { Mm } from '../../shared/model/units'
import type { RectMm } from './types'

export type Arrangement = 'row' | 'column'

/** Portrait or square tiles go side by side (row); landscape tiles stack (column). Keeps blocks closer to square. */
export function arrangementFor(aspect: number): Arrangement {
  return aspect <= 1 ? 'row' : 'column'
}

/** Unturned size of a block of `tiles` tiles of width `tileW`. */
export function blockSize(tileW: Mm, aspect: number, tiles: number, gutter: Mm): SizeMm {
  const tileH = tileW / aspect
  const gaps = (tiles - 1) * gutter
  return arrangementFor(aspect) === 'row'
    ? { w: tiles * tileW + gaps, h: tileH }
    : { w: tileW, h: tiles * tileH + gaps }
}

export function fitUnturned(aspect: number, tiles: number, gutter: Mm, boxW: Mm, boxH: Mm): Mm {
  const gaps = (tiles - 1) * gutter
  return arrangementFor(aspect) === 'row'
    ? Math.min((boxW - gaps) / tiles, boxH * aspect)
    : Math.min(boxW, ((boxH - gaps) * aspect) / tiles)
}

/**
 * Largest tile width whose block fits a `box`, unturned or turned 90°.
 * ≤ 0 means the block cannot fit at any size (gutters alone are too wide).
 */
export function maxFitTileWidth(aspect: number, tiles: number, gutter: Mm, box: SizeMm): Mm {
  return Math.max(
    fitUnturned(aspect, tiles, gutter, box.w, box.h),
    fitUnturned(aspect, tiles, gutter, box.h, box.w),
  )
}

/** Short side of a tile of width `tileW`. */
export function tileShortSide(tileW: Mm, aspect: number): Mm {
  return tileW / Math.max(1, aspect)
}

/**
 * Printed trim boxes of each tile, for a block whose top-left corner is (x, y).
 * Turned = the whole block rotated 90° clockwise: tile i of a row ends up i-th from the top;
 * tile i of a column ends up i-th from the RIGHT. Printed tiles are tileH wide and tileW tall.
 */
export function tileRects(
  x: Mm,
  y: Mm,
  tileW: Mm,
  aspect: number,
  tiles: number,
  gutter: Mm,
  turned: boolean,
): RectMm[] {
  const tileH = tileW / aspect
  const row = arrangementFor(aspect) === 'row'
  const rects: RectMm[] = []
  for (let i = 0; i < tiles; i++) {
    if (!turned) {
      rects.push(
        row
          ? { x: x + i * (tileW + gutter), y, w: tileW, h: tileH }
          : { x, y: y + i * (tileH + gutter), w: tileW, h: tileH },
      )
    } else {
      rects.push(
        row
          ? { x, y: y + i * (tileW + gutter), w: tileH, h: tileW }
          : { x: x + (tiles - 1 - i) * (tileH + gutter), y, w: tileH, h: tileW },
      )
    }
  }
  return rects
}
