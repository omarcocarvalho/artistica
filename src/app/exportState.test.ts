import { describe, expect, it } from 'vitest'
import { exportBlock } from './exportState'

describe('exportBlock', () => {
  it('blocks with no images first', () => {
    expect(exportBlock(0, 'idle', false, 0)).toBe('no-images')
    expect(exportBlock(0, 'computing', true, 0)).toBe('no-images')
  })
  it('blocks while the layout is computing or has failed (never export a stale preview)', () => {
    expect(exportBlock(2, 'computing', true, 1)).toBe('updating')
    expect(exportBlock(2, 'error', false, 0)).toBe('error')
  })
  it('blocks as updating only until the first layout arrives', () => {
    expect(exportBlock(2, 'idle', false, 0)).toBe('updating')
  })
  it('says "no room" (never "updating") when a layout arrived with images but no pages (CR-B2)', () => {
    expect(exportBlock(2, 'idle', true, 0)).toBe('no-room')
  })
  it('allows export when images, pages and idle', () => {
    expect(exportBlock(2, 'idle', true, 1)).toBeNull()
    expect(exportBlock(2, 'idle', true, 1, false)).toBeNull()
  })
  it('guides pending blocks export with reason "guides" (M4-R18)', () => {
    expect(exportBlock(2, 'idle', true, 1, true)).toBe('guides')
  })
  it('the layout reasons come before "guides"', () => {
    expect(exportBlock(0, 'idle', true, 0, true)).toBe('no-images')
    expect(exportBlock(2, 'error', true, 1, true)).toBe('error')
    expect(exportBlock(2, 'computing', true, 1, true)).toBe('updating')
    expect(exportBlock(2, 'idle', true, 0, true)).toBe('no-room')
  })
})
