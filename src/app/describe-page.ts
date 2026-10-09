import type { PageModel } from '../features/render'
import type { ImageId } from '../shared/model/image'
import {
  activeLineTypes,
  GUIDE_LINE_TYPES,
  type LineSettings,
  type LineType,
} from '../shared/model/lines'
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

const isGuide = (type: LineType): boolean =>
  (GUIDE_LINE_TYPES as readonly LineType[]).includes(type)

/**
 * Text alternative for a page (design/README accessibility notes). Composition types are those the
 * tile draws; guide types are those switched on, found or not (M4-R22).
 */
export function describePage(
  model: PageModel,
  names: ReadonlyMap<ImageId, string>,
  linesOf: ReadonlyMap<ImageId, LineSettings> = new Map(),
): TileDescription[] {
  const lines = new Map(model.lines.map((l) => [l.tileIndex, l.types]))
  return model.tiles.map((t, index) => {
    const settings = linesOf.get(t.imageId)
    return {
      imageId: t.imageId,
      name: names.get(t.imageId) ?? t.imageId,
      version: t.version,
      widthMm: round1(t.trim.w),
      heightMm: round1(t.trim.h),
      lines: [
        ...(lines.get(index) ?? []).filter((type) => !isGuide(type)),
        ...(settings ? activeLineTypes(settings).filter(isGuide) : []),
      ],
    }
  })
}
