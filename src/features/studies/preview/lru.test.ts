import { describe, expect, it } from 'vitest'
import { ByteLru } from './lru'

describe('ByteLru', () => {
  it('tracks bytes and evicts least recently used first, down to the cap', () => {
    const lru = new ByteLru()
    lru.set('a', 10)
    lru.set('b', 10)
    lru.set('c', 10)
    lru.touch('a')
    expect(lru.bytes).toBe(30)
    expect(lru.evictOver(15)).toEqual(['b', 'c'])
    expect(lru.bytes).toBe(10)
    expect([...lru.keys()]).toEqual(['a'])
  })
  it('evicts nothing at or under the cap', () => {
    const lru = new ByteLru()
    lru.set('a', 10)
    expect(lru.evictOver(10)).toEqual([])
  })
  it('replaces the size of an existing key and moves it to the newest end', () => {
    const lru = new ByteLru()
    lru.set('a', 10)
    lru.set('b', 5)
    lru.set('a', 20)
    expect(lru.bytes).toBe(25)
    expect(lru.evictOver(20)).toEqual(['b'])
  })
  it('touching a missing key adds nothing', () => {
    const lru = new ByteLru()
    lru.touch('a')
    expect(lru.has('a')).toBe(false)
    expect(lru.bytes).toBe(0)
  })
  it('deletes and clears', () => {
    const lru = new ByteLru()
    lru.set('a', 10)
    expect(lru.delete('a')).toBe(true)
    expect(lru.delete('a')).toBe(false)
    lru.set('b', 1)
    expect(lru.clear()).toEqual(['b'])
    expect(lru.bytes).toBe(0)
  })
})
