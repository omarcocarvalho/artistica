import type { ImageId } from '../../../shared/model/image'
import type { TileStudy } from '../../../shared/model/study'
import type { TilePixelPlan } from '../pixels/tile-plan'

/** One study tile the preview needs (C3 builds these; C1's provider renders them). */
export interface StudyTileRequest {
  /** tileRenderKey(tile, plan at preview dpi): includes version + studyKey. */
  readonly key: string
  /** `${imageId}|${version}|${pageIndex}:${tileIndex}`: "the same tile" for stale display (M2-R12). */
  readonly slot: string
  /** Planned against the image's pxW × pxH (not yet scaled to the preview bitmap). */
  readonly plan: TilePixelPlan
  readonly study: TileStudy
  readonly imageId: ImageId
}

export interface StudyTileProvider {
  /** Fresh image for `key`, else the newest stale image held for `slot`, else null. Never blocks. */
  get(key: string, slot: string): CanvasImageSource | null
  /** Replace a consumer's wanted set; queues missing keys in the given order, drops queued keys nobody wants. */
  want(consumer: string, requests: readonly StudyTileRequest[]): void
  /** Called (batched per animation frame) when a wanted key becomes ready. Returns unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Number of `consumer`'s wanted keys not ready yet (drives aria-busy). */
  pending(consumer: string): number
  release(consumer: string): void
  /** M2-R16: stop starting jobs and close retained (unwanted) images; resume restarts the queue. */
  pause(): void
  resume(): void
}
