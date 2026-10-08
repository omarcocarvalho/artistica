import type { PageModel } from '../features/render'
import type { ImageId } from '../shared/model/image'
import type { LineType } from '../shared/model/lines'
import type { StudyVersion } from '../shared/model/study'

export interface TileDescription {
  imageId: ImageId
  name: string
  version: StudyVersion
  widthMm: number
  heightMm: number
  lines: readonly LineType[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Text alternative for a page (design/README accessibility notes). */
export function describePage(
  model: PageModel,
  names: ReadonlyMap<ImageId, string>,
): TileDescription[] {
  const lines = new Map(model.lines.map((l) => [l.tileIndex, l.types]))
  return model.tiles.map((t, index) => ({
    imageId: t.imageId,
    name: names.get(t.imageId) ?? t.imageId,
    version: t.version,
    widthMm: round1(t.trim.w),
    heightMm: round1(t.trim.h),
    lines: lines.get(index) ?? [],
  }))
}
