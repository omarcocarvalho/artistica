import { planTilePixels, tileRenderKey } from '../pixels/tile-plan'
import type { DrawTile, PageModel } from '../types'
import type { StudyTileRequest } from './study-tiles'

/** "The same tile" across re-keys (M2-R12): same image, same version, same place on the same page. */
export function tileSlot(pageIndex: number, tileIndex: number, tile: DrawTile): string {
  return `${tile.imageId}|${tile.version}|${String(pageIndex)}:${String(tileIndex)}`
}

export interface IndexedStudyRequest {
  readonly tileIndex: number
  readonly request: StudyTileRequest
}

/** One request per study tile of the page, in tile order, planned at the preview's dpi. */
export function indexedStudyRequests(model: PageModel, dpi: number): IndexedStudyRequest[] {
  const out: IndexedStudyRequest[] = []
  model.tiles.forEach((tile, i) => {
    if (tile.study === null) return
    const plan = planTilePixels(tile, { dpi })
    out.push({
      tileIndex: i,
      request: {
        key: tileRenderKey(tile, plan),
        slot: tileSlot(model.index, i, tile),
        plan,
        study: tile.study,
        imageId: tile.imageId,
      },
    })
  })
  return out
}

export function studyRequestsFor(model: PageModel, dpi: number): StudyTileRequest[] {
  return indexedStudyRequests(model, dpi).map((r) => r.request)
}
