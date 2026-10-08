import { describe, expect, it } from 'vitest'
import { NO_GUIDES } from './types'

describe('NO_GUIDES', () => {
  it('knows nothing: every kind is null, not an empty result', () => {
    expect(NO_GUIDES).toStrictEqual({ faces: null, poses: null, edges: null })
  })
})
