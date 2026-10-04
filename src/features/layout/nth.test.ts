import { describe, expect, it } from 'vitest'
import { nth } from './nth'

describe('nth', () => {
  it('returns the element at an index', () => {
    expect(nth(['a', 'b'], 1)).toBe('b')
  })
  it('throws a RangeError out of range', () => {
    expect(() => nth(['a'], 1)).toThrow(RangeError)
  })
})
