import { useEffect, useState, type RefObject } from 'react'

export type ScrollAxis = 'x' | 'y'
export type Nearness = 'unknown' | 'near' | 'far'

/** How far beyond the scroller's visible area a page still counts as near: one viewport (M5-R21). */
export const NEAR_VIEWPORT_MARGIN = '100%'

export function nearRootMargin(axis: ScrollAxis): string {
  return axis === 'y' ? `${NEAR_VIEWPORT_MARGIN} 0px` : `0px ${NEAR_VIEWPORT_MARGIN}`
}

const SCROLLING = new Set(['auto', 'scroll', 'overlay'])

/** The nearest ancestor that scrolls along `axis`, or null for the document viewport. */
export function scrollRootOf(el: Element, axis: ScrollAxis): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const style = getComputedStyle(p)
    if (SCROLLING.has(axis === 'y' ? style.overflowY : style.overflowX)) return p
  }
  return null
}

/**
 * Whether `ref`'s element is within one viewport of its scroller's visible area. 'unknown' until
 * the first observation; always 'near' without IntersectionObserver.
 */
export function useNearViewport(ref: RefObject<Element | null>, axis: ScrollAxis): Nearness {
  const supported = typeof IntersectionObserver !== 'undefined'
  const [seen, setSeen] = useState<Nearness>('unknown')
  useEffect(() => {
    const el = ref.current
    if (!supported || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries.at(-1)
        if (last) setSeen(last.isIntersecting ? 'near' : 'far')
      },
      { root: scrollRootOf(el, axis), rootMargin: nearRootMargin(axis) },
    )
    io.observe(el)
    return () => {
      io.disconnect()
    }
  }, [ref, axis, supported])
  return supported ? seen : 'near'
}
