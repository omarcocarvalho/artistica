import { describe, expect, it } from 'vitest'
import * as api from './index'

describe('public API', () => {
  it('exports exactly the runtime contract', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'ImageEditSheet',
        'ImageList',
        'ImportDropzone',
        'MAX_DECODED_PIXELS',
        'MAX_FILE_BYTES',
        'decodeFull',
        'decodedPixelLimit',
        'importErrorKeys',
        'removalFocusTarget',
        'selectImageDescriptors',
        'useImages',
      ].sort(),
    )
  })

  it('exports working values', () => {
    expect(api.ImportDropzone).toBeTypeOf('function')
    expect(api.ImageList).toBeTypeOf('function')
    expect(api.ImageEditSheet).toBeTypeOf('function')
    expect(api.useImages.getState().images).toEqual([])
    expect(api.selectImageDescriptors({ images: [] })).toEqual([])
    expect(api.decodeFull).toBeTypeOf('function')
    expect(api.importErrorKeys('cors').title).toBe('errors:images.cors.title')
    expect(api.MAX_FILE_BYTES).toBe(100 * 1024 * 1024)
    expect(api.MAX_DECODED_PIXELS).toBe(200_000_000)
    expect(api.decodedPixelLimit).toBeTypeOf('function')
  })
})
