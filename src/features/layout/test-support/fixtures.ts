import type { ImageId, SizeMode } from '../../../shared/model/image'
import type { LayoutItemInput } from '../types'

/** One single-tile layout item, keyed `${id}#0`. */
export function item(
  id: string,
  aspect: number,
  maxPrintWidthMm = 1000,
  size: SizeMode = { kind: 'auto' },
  tiles = 1,
): LayoutItemInput {
  return { key: `${id}#0`, imageId: id as ImageId, aspect, maxPrintWidthMm, size, tiles }
}

/** Deterministic pseudo-random generator (mulberry32) for fixtures; never Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ASPECTS = [1.5, 2 / 3, 4 / 3, 3 / 4, 1, 16 / 9, 9 / 16]

/** `n` realistic photos: common aspects, caps from phone-sized (431 mm) down to web-sized (40 mm). */
export function realisticItems(n: number, seed = 1): LayoutItemInput[] {
  const rnd = mulberry32(seed)
  return Array.from({ length: n }, (_, i) => {
    const aspect = ASPECTS[Math.floor(rnd() * ASPECTS.length)] ?? 1.5
    const cap = 40 + rnd() * 391
    const size: SizeMode =
      rnd() < 0.15
        ? { kind: 'fixed', axis: 'width', mm: 50 + Math.floor(rnd() * 100) }
        : { kind: 'auto' }
    return item(`img${String(i).padStart(2, '0')}`, aspect, cap, size)
  })
}
