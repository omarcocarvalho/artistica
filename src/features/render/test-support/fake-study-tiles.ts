import type { StudyTileProvider, StudyTileRequest } from '../preview/study-tiles'

/** Records wants; tests decide what `get` returns and when listeners fire. */
export function fakeStudyTiles() {
  const wants = new Map<string, readonly StudyTileRequest[]>()
  const ready = new Map<string, CanvasImageSource>()
  const stale = new Map<string, CanvasImageSource>()
  const listeners = new Set<() => void>()
  const released: string[] = []
  let paused = false
  const provider: StudyTileProvider = {
    get: (key, slot) => ready.get(key) ?? stale.get(slot) ?? null,
    want: (consumer, requests) => {
      wants.set(consumer, requests)
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    pending: (consumer) => (wants.get(consumer) ?? []).filter((r) => !ready.has(r.key)).length,
    release: (consumer) => {
      wants.delete(consumer)
      released.push(consumer)
    },
    pause: () => {
      paused = true
    },
    resume: () => {
      paused = false
    },
  }
  return {
    provider,
    wants,
    released,
    listenerCount: () => listeners.size,
    isPaused: () => paused,
    /** All requests currently wanted, flattened. */
    wanted: () => [...wants.values()].flat(),
    /** Mark a key ready with an image and notify listeners. */
    resolve(key: string, image: CanvasImageSource) {
      ready.set(key, image)
      for (const l of [...listeners]) l()
    },
    setStale(slot: string, image: CanvasImageSource) {
      stale.set(slot, image)
    },
  }
}
