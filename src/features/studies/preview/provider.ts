import type { ImageId } from '../../../shared/model/image'
import type { TileStudy } from '../../../shared/model/study'
import {
  forCroppedSource,
  forScaledSource,
  integerCropBox,
  type PxRect,
  type TilePixelPlan,
} from '../../render/pixels/tile-plan'
import type { StudyTileProvider, StudyTileRequest } from '../../render/preview/study-tiles'
import { ByteLru } from './lru'

export const STUDY_PREVIEW_CONCURRENCY = 1
/** Results no consumer wants are kept, least recently used closed first, up to this many bytes (w × h × 4). */
export const STUDY_RETAIN_BYTES = 32 * 1024 * 1024

export interface BitmapLike {
  readonly width: number
  readonly height: number
  close(): void
}
export interface StudyPreviewSource {
  readonly bitmap: BitmapLike
  readonly pxW: number
  readonly pxH: number
}
export interface ProviderDeps<B extends BitmapLike> {
  /** The image's preview bitmap, or undefined once the image is removed. Never owned by the provider. */
  getSource(id: ImageId): StudyPreviewSource | undefined
  cropBitmap(bitmap: BitmapLike, box: PxRect): Promise<B>
  /** Takes ownership of `clone` and closes it on every path; the provider owns the result. */
  render(plan: TilePixelPlan, clone: B, study: TileStudy): Promise<B>
  schedule(callback: () => void): void
  retainBytes?: number
}
export interface StudyPreviewProvider<B extends BitmapLike> extends StudyTileProvider {
  get(key: string, slot: string): B | null
  stats(): {
    wantedBytes: number
    retainedBytes: number
    /** Slot images no entry holds any more, drawn until their slot's fresh tile arrives. */
    staleBytes: number
    queued: number
    running: number
  }
  dispose(): void
}

interface Entry<B> {
  readonly bitmap: B
  readonly imageId: ImageId
  readonly bytes: number
}

const bytesOf = (b: BitmapLike): number => b.width * b.height * 4

/** `error.name` of a render that failed only because its renderer was replaced. Matched by name: errors lose their class across Comlink. */
export const RENDERER_RESTARTED = 'StudyRendererRestarted'
/** `error.name` of a render its renderer gave up on after `STUDY_JOB_TIMEOUT_MS` (M5-R22). */
export const STUDY_TIMEOUT = 'StudyTimeout'
/** Room for createStudyRenderer's two recoveries: a fresh worker, then the main thread (M5-R22). */
const TIMEOUT_RETRIES = 2
const named = (e: unknown, name: string): boolean =>
  typeof e === 'object' && e !== null && 'name' in e && e.name === name

export function createStudyPreviewProvider<B extends BitmapLike>(
  deps: ProviderDeps<B>,
): StudyPreviewProvider<B> {
  const cap = deps.retainBytes ?? STUDY_RETAIN_BYTES
  const wants = new Map<string, readonly StudyTileRequest[]>()
  const entries = new Map<string, Entry<B>>()
  const retained = new ByteLru()
  const slots = new Map<string, Entry<B>>()
  const holders = new Map<B, number>()
  const failed = new Set<string>()
  const retried = new Set<string>()
  const timeouts = new Map<string, number>()
  const queue: StudyTileRequest[] = []
  const listeners = new Set<() => void>()
  let running: string | null = null
  let paused = false
  let notifyScheduled = false
  let disposed = false

  const hold = (b: B): void => {
    holders.set(b, (holders.get(b) ?? 0) + 1)
  }
  const letGo = (b: B): void => {
    const n = (holders.get(b) ?? 0) - 1
    if (n > 0) {
      holders.set(b, n)
      return
    }
    holders.delete(b)
    b.close()
  }
  const dropEntry = (key: string): void => {
    const e = entries.get(key)
    if (!e) return
    entries.delete(key)
    retained.delete(key)
    letGo(e.bitmap)
  }
  const dropSlot = (slot: string): void => {
    const e = slots.get(slot)
    if (!e) return
    slots.delete(slot)
    letGo(e.bitmap)
  }

  const wantedKeys = (): Set<string> => {
    const out = new Set<string>()
    for (const reqs of wants.values()) for (const r of reqs) out.add(r.key)
    return out
  }
  const wantedSlots = (): Set<string> => {
    const out = new Set<string>()
    for (const reqs of wants.values()) for (const r of reqs) out.add(r.slot)
    return out
  }
  const imageGone = (id: ImageId): boolean => deps.getSource(id) === undefined

  const notify = (): void => {
    if (notifyScheduled || disposed) return
    notifyScheduled = true
    deps.schedule(() => {
      notifyScheduled = false
      for (const l of [...listeners]) l()
    })
  }

  const reconcile = (): void => {
    const keys = wantedKeys()
    const slotSet = wantedSlots()
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i]
      if (q && !keys.has(q.key)) queue.splice(i, 1)
    }
    for (const [key, e] of [...entries]) {
      if (imageGone(e.imageId)) dropEntry(key)
      else if (keys.has(key)) retained.delete(key)
      else if (!retained.has(key)) retained.set(key, e.bytes)
    }
    for (const key of retained.evictOver(paused ? 0 : cap)) dropEntry(key)
    for (const [slot, e] of [...slots]) {
      if (!slotSet.has(slot) || imageGone(e.imageId)) dropSlot(slot)
    }
    for (const key of [...failed]) if (!keys.has(key)) failed.delete(key)
    for (const key of [...retried]) if (!keys.has(key)) retried.delete(key)
    for (const key of [...timeouts.keys()]) if (!keys.has(key)) timeouts.delete(key)
  }

  const stillWanted = (job: StudyTileRequest): boolean =>
    !disposed && wantedKeys().has(job.key) && !imageGone(job.imageId)
  const discard = (job: StudyTileRequest, bitmap?: B): void => {
    bitmap?.close()
    if (wantedKeys().has(job.key)) notify()
  }

  const nextJob = (): { job: StudyTileRequest; source: StudyPreviewSource } | undefined => {
    const keys = wantedKeys()
    let job: StudyTileRequest | undefined
    while ((job = queue.shift()) !== undefined) {
      if (!keys.has(job.key) || entries.has(job.key)) continue
      const source = deps.getSource(job.imageId)
      if (source) return { job, source }
    }
    return undefined
  }

  const pump = (): void => {
    if (paused || disposed || running !== null) return
    const next = nextJob()
    if (!next) return
    const { job, source } = next
    running = job.key
    const scaled = forScaledSource(
      job.plan,
      source.bitmap.width / source.pxW,
      source.bitmap.height / source.pxH,
    )
    void deps
      .cropBitmap(source.bitmap, integerCropBox(scaled.src))
      .then((clone) => {
        if (!stillWanted(job)) {
          discard(job, clone)
          return null
        }
        if (paused) {
          clone.close()
          queue.unshift(job)
          return null
        }
        return deps.render(forCroppedSource(scaled), clone, job.study)
      })
      .then(
        (result) => {
          if (result !== null) accept(job, result)
        },
        (error: unknown) => {
          if (!stillWanted(job)) {
            discard(job)
            return
          }
          if (named(error, RENDERER_RESTARTED) && !retried.has(job.key)) {
            retried.add(job.key)
            queue.unshift(job)
            return
          }
          const timedOut = timeouts.get(job.key) ?? 0
          if (named(error, STUDY_TIMEOUT) && timedOut < TIMEOUT_RETRIES) {
            timeouts.set(job.key, timedOut + 1)
            queue.unshift(job)
            return
          }
          failed.add(job.key)
          notify()
        },
      )
      .finally(() => {
        running = null
        pump()
      })
  }

  const accept = (job: StudyTileRequest, result: B): void => {
    if (!stillWanted(job)) {
      discard(job, result)
      return
    }
    const entry: Entry<B> = { bitmap: result, imageId: job.imageId, bytes: bytesOf(result) }
    dropEntry(job.key)
    entries.set(job.key, entry)
    hold(result)
    for (const reqs of wants.values()) {
      for (const r of reqs) {
        if (r.key !== job.key || slots.get(r.slot)?.bitmap === result) continue
        dropSlot(r.slot)
        slots.set(r.slot, entry)
        hold(result)
      }
    }
    notify()
  }

  return {
    get(key, slot) {
      const fresh = entries.get(key)
      if (fresh) return fresh.bitmap
      if (failed.has(key)) return null
      return slots.get(slot)?.bitmap ?? null
    },

    want(consumer, requests) {
      if (disposed) return
      wants.set(consumer, requests)
      const queued = new Set(queue.map((q) => q.key))
      for (const r of requests) {
        if (entries.has(r.key) || failed.has(r.key) || r.key === running || queued.has(r.key))
          continue
        if (imageGone(r.imageId)) continue
        queue.push(r)
        queued.add(r.key)
      }
      reconcile()
      pump()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    pending(consumer) {
      const reqs = wants.get(consumer) ?? []
      return reqs.filter((r) => !entries.has(r.key) && !failed.has(r.key) && !imageGone(r.imageId))
        .length
    },

    release(consumer) {
      if (!wants.delete(consumer)) return
      reconcile()
    },

    pause() {
      paused = true
      for (const key of retained.clear()) dropEntry(key)
    },

    resume() {
      paused = false
      pump()
    },

    stats() {
      const keys = wantedKeys()
      let wantedBytes = 0
      for (const [key, e] of entries) if (keys.has(key)) wantedBytes += e.bytes
      const held = new Set<B>()
      for (const e of entries.values()) held.add(e.bitmap)
      const stale = new Map<B, number>()
      for (const e of slots.values()) if (!held.has(e.bitmap)) stale.set(e.bitmap, e.bytes)
      let staleBytes = 0
      for (const bytes of stale.values()) staleBytes += bytes
      return {
        wantedBytes,
        retainedBytes: retained.bytes,
        staleBytes,
        queued: queue.length,
        running: running === null ? 0 : 1,
      }
    },

    dispose() {
      disposed = true
      queue.length = 0
      wants.clear()
      listeners.clear()
      for (const key of [...entries.keys()]) dropEntry(key)
      for (const slot of [...slots.keys()]) dropSlot(slot)
    },
  }
}
