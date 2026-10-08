import { describe, expect, it, vi } from 'vitest'
import { pageHasWebGL } from './detection-actions'

type Ctx = 'webgl2' | 'webgl'

function fakeDoc(available: readonly Ctx[], { throws = false } = {}) {
  const loseContext = vi.fn()
  const asked: string[] = []
  const gl = {
    getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null),
  }
  const getContext = (kind: string) => {
    asked.push(kind)
    if (throws) throw new Error('blocked')
    return available.includes(kind as Ctx) ? gl : null
  }
  const doc = {
    createElement: () => ({ getContext }) as unknown as HTMLCanvasElement,
  }
  return { doc, loseContext, asked }
}

describe('pageHasWebGL (owner Q15, default)', () => {
  it('is true with WebGL 2, and releases the context it made', () => {
    const { doc, loseContext, asked } = fakeDoc(['webgl2'])
    expect(pageHasWebGL(doc)).toBe(true)
    expect(asked).toEqual(['webgl2'])
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('falls back to WebGL 1, as MediaPipe does', () => {
    const { doc, loseContext, asked } = fakeDoc(['webgl'])
    expect(pageHasWebGL(doc)).toBe(true)
    expect(asked).toEqual(['webgl2', 'webgl'])
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('is false when the browser gives neither', () => {
    const { doc, loseContext } = fakeDoc([])
    expect(pageHasWebGL(doc)).toBe(false)
    expect(loseContext).not.toHaveBeenCalled()
  })

  it('is false when asking throws', () => {
    expect(pageHasWebGL(fakeDoc(['webgl2'], { throws: true }).doc)).toBe(false)
  })

  it('works without the lose-context extension', () => {
    const doc = {
      createElement: () =>
        ({ getContext: () => ({ getExtension: () => null }) }) as unknown as HTMLCanvasElement,
    }
    expect(pageHasWebGL(doc)).toBe(true)
  })

  it('reads the real document by default', () => {
    expect(typeof pageHasWebGL()).toBe('boolean')
  })
})
