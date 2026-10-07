import type { ImageId } from '../../../../shared/model/image'
import type { TileStudy } from '../../../../shared/model/study'
import { planTilePixels, type PxRect, type TilePixelPlan } from '../../../render/pixels/tile-plan'
import type { StudyTileRequest } from '../../../render/preview/study-tiles'
import { drawTile, id } from '../../../render/test-support/fixtures'
import type { BitmapLike, ProviderDeps, StudyPreviewSource } from '../provider'

/**
 * Every FakeBitmap ever made, and the labels of those closed more than once. A second close throws,
 * but inside the provider's promise chain that throw is swallowed, so tests also check `doubleCloses`.
 */
export const bitmapLog: { created: FakeBitmap[]; doubleCloses: string[] } = {
  created: [],
  doubleCloses: [],
}
export function resetBitmapLog(): void {
  bitmapLog.created.length = 0
  bitmapLog.doubleCloses.length = 0
}

export class FakeBitmap implements BitmapLike {
  readonly width: number
  readonly height: number
  readonly label: string
  closed = 0
  constructor(width: number, height: number, label = '') {
    this.width = width
    this.height = height
    this.label = label
    bitmapLog.created.push(this)
  }
  close(): void {
    this.closed++
    if (this.closed > 1) {
      bitmapLog.doubleCloses.push(this.label)
      throw new Error(`bitmap closed twice: ${this.label}`)
    }
  }
}

export interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}
export function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void // assigned synchronously by the Promise executor
  let reject!: (e: unknown) => void // same
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export interface RenderCall {
  readonly plan: TilePixelPlan
  readonly clone: FakeBitmap
  readonly study: TileStudy
  readonly result: Deferred<FakeBitmap>
}

export const STUDY: TileStudy = { blurPct: 40, values: null }

/** 1 px per mm (dpi 25.4) so canvasW × canvasH = trim w × h; the tile shows the whole 3000 × 2000 image. */
export function request(
  imageName: string,
  key: string,
  { w = 100, h = 100, slot = `${imageName}|blurred|0:0`, study = STUDY } = {},
): StudyTileRequest {
  const tile = drawTile({
    imageId: id(imageName),
    trim: { x: 0, y: 0, w, h },
    crop: { x: 0, y: 0, w: 3000, h: 2000 },
  })
  return { key, slot, plan: planTilePixels(tile, { dpi: 25.4 }), study, imageId: id(imageName) }
}

/** Deps with controllable renders, a manual schedule and per-image preview sources (1000 × 667 previews of 3000 × 2000 images). */
export function fakeDeps(retainBytes?: number) {
  const renders: RenderCall[] = []
  const crops: { box: PxRect; clone: FakeBitmap }[] = []
  const sources = new Map<ImageId, StudyPreviewSource>()
  const ticks: (() => void)[] = []
  const add = (name: string): void => {
    sources.set(id(name), {
      bitmap: new FakeBitmap(1000, 667, `preview ${name}`),
      pxW: 3000,
      pxH: 2000,
    })
  }
  const deps: ProviderDeps<FakeBitmap> = {
    getSource: (imageId) => sources.get(imageId),
    cropBitmap: (_bitmap, box) => {
      const clone = new FakeBitmap(box.w, box.h, `clone ${String(crops.length)}`)
      crops.push({ box, clone })
      return Promise.resolve(clone)
    },
    render: (plan, clone, study) => {
      const result = deferred<FakeBitmap>()
      renders.push({ plan, clone, study, result })
      // The real renderer closes its input; the fake does it when the test settles the render.
      return result.promise.finally(() => {
        clone.close()
      })
    },
    schedule: (cb) => {
      ticks.push(cb)
    },
    ...(retainBytes === undefined ? {} : { retainBytes }),
  }
  /** Run every scheduled notification. */
  const flush = (): void => {
    for (const cb of ticks.splice(0)) cb()
  }
  /** Let the provider's promise chains run to completion (a macrotask drains every microtask). */
  const settle = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  }
  /** Settle, resolve render n with a bitmap of the plan's canvas size, then let the provider react. */
  const finish = async (n: number): Promise<FakeBitmap> => {
    await settle()
    const call = renders[n]
    if (!call) throw new Error(`no render ${String(n)}`)
    const out = new FakeBitmap(call.plan.canvasW, call.plan.canvasH, `result ${String(n)}`)
    call.result.resolve(out)
    await settle()
    return out
  }
  return { deps, renders, crops, sources, add, flush, settle, finish }
}
