/**
 * Keep `cache` in step with the tiles needed right now: create missing entries, reuse the rest,
 * release and evict the unused. Returns the entries in `keys` order.
 */
export function syncTileCanvasCache<C>(
  cache: Map<string, C>,
  keys: readonly (string | null)[],
  create: (index: number) => C,
  release: (canvas: C) => void,
): (C | null)[] {
  const used = new Set<string>()
  const out = keys.map((key, i) => {
    if (key === null) return null
    used.add(key)
    let c = cache.get(key)
    if (c === undefined) {
      c = create(i)
      cache.set(key, c)
    }
    return c
  })
  const stale = [...cache.keys()].filter((k) => !used.has(k))
  for (const k of stale) {
    const c = cache.get(k)
    if (c !== undefined) release(c)
    cache.delete(k)
  }
  return out
}

export function releaseAllTileCanvases<C>(cache: Map<string, C>, release: (canvas: C) => void) {
  const all = [...cache.values()]
  cache.clear()
  for (const c of all) release(c)
}
