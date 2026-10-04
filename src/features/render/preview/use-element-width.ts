import { useEffect, useState, type RefObject } from 'react'

/** CSS width of an element, tracked with ResizeObserver (0 until measured). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [ref])
  return width
}

/** devicePixelRatio, following changes (zoom, moving between screens) via matchMedia. */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(`(resolution: ${String(dpr)}dppx)`)
    const onChange = () => {
      setDpr(window.devicePixelRatio)
    }
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
    }
  }, [dpr])
  return dpr
}
