import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeIntersectionObserver } from '../test-support/fake-intersection-observer'
import {
  NEAR_VIEWPORT_MARGIN,
  nearRootMargin,
  scrollRootOf,
  useNearViewport,
  type ScrollAxis,
} from './use-near-viewport'

afterEach(() => {
  vi.unstubAllGlobals()
})

function Probe({ axis }: { axis: ScrollAxis }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useNearViewport(ref, axis)
  return (
    <div ref={ref} data-testid="target">
      {seen}
    </div>
  )
}

function inScrollers(axis: ScrollAxis) {
  return render(
    <div data-testid="outer" style={{ overflowY: 'auto' }}>
      <div data-testid="carousel" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <div>
          <Probe axis={axis} />
        </div>
      </div>
    </div>,
  )
}

describe('nearRootMargin', () => {
  it('extends the root by one viewport on each side along the scroll axis only (M5-R21)', () => {
    expect(NEAR_VIEWPORT_MARGIN).toBe('100%')
    expect(nearRootMargin('y')).toBe('100% 0px')
    expect(nearRootMargin('x')).toBe('0px 100%')
  })
})

describe('scrollRootOf', () => {
  it('finds the nearest ancestor that scrolls along the axis', () => {
    inScrollers('y')
    const target = screen.getByTestId('target')
    expect(scrollRootOf(target, 'x')).toBe(screen.getByTestId('carousel'))
    expect(scrollRootOf(target, 'y')).toBe(screen.getByTestId('outer'))
  })

  it('accepts overflow: scroll and falls back to the document viewport (null)', () => {
    render(
      <div data-testid="s" style={{ overflowY: 'scroll' }}>
        <span data-testid="in" />
      </div>,
    )
    expect(scrollRootOf(screen.getByTestId('in'), 'y')).toBe(screen.getByTestId('s'))
    expect(scrollRootOf(screen.getByTestId('in'), 'x')).toBeNull()
  })
})

describe('useNearViewport', () => {
  it('reports near without IntersectionObserver (M1–M4 behaviour)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    inScrollers('y')
    expect(screen.getByTestId('target')).toHaveTextContent('near')
  })

  it('is unknown until the first observation, then follows the target', () => {
    const io = installFakeIntersectionObserver()
    inScrollers('y')
    const target = screen.getByTestId('target')
    expect(target).toHaveTextContent('unknown')
    io.set(target, false)
    expect(target).toHaveTextContent('far')
    io.set(target, true)
    expect(target).toHaveTextContent('near')
    io.set(target, false)
    expect(target).toHaveTextContent('far')
  })

  it('follows the newest entry when one callback carries several', () => {
    const io = installFakeIntersectionObserver()
    inScrollers('y')
    const target = screen.getByTestId('target')
    io.batch(target, [false, true])
    expect(target).toHaveTextContent('near')
    io.batch(target, [true, false])
    expect(target).toHaveTextContent('far')
  })

  it.each([
    ['y', 'outer', '100% 0px'],
    ['x', 'carousel', '0px 100%'],
  ] as const)(
    'observes against the %s scroller with the near margin',
    (axis, rootId, rootMargin) => {
      const io = installFakeIntersectionObserver()
      inScrollers(axis)
      const [options] = io.optionsFor(screen.getByTestId('target'))
      expect(options?.root).toBe(screen.getByTestId(rootId))
      expect(options?.rootMargin).toBe(rootMargin)
    },
  )

  it('re-observes when the axis changes and disconnects on unmount', () => {
    const io = installFakeIntersectionObserver()
    const { rerender, unmount } = render(<Probe axis="y" />)
    const target = screen.getByTestId('target')
    expect(io.optionsFor(target).map((o) => o.rootMargin)).toEqual(['100% 0px'])
    rerender(<Probe axis="x" />)
    expect(io.optionsFor(target).map((o) => o.rootMargin)).toEqual(['0px 100%'])
    expect(io.liveCount()).toBe(1)
    unmount()
    expect(io.liveCount()).toBe(0)
  })
})
