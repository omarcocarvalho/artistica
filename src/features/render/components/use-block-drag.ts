import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Mm } from '../../../shared/model/units'
import type {
  ArrangeBlock,
  ArrangeCorner,
  ArrangeIntent,
  ArrangeProps,
  ArrangeRect,
} from './arrange-types'

export const DRAG_THRESHOLD_PX = 4
export const SNAP_MM: Mm = 2

export function movedEnough(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
}

function nearest(value: Mm, candidates: readonly Mm[]): Mm {
  let best = value
  let bestDistance = SNAP_MM + 1e-9
  for (const c of candidates) {
    const d = Math.abs(c - value)
    if (d < bestDistance) {
      best = c
      bestDistance = d
    }
  }
  return best
}

/** M5-R10: an edge within SNAP_MM of a content-box edge, or of a neighbour's edge plus the gutter, snaps to it. */
export function snapRect(
  r: ArrangeRect,
  content: ArrangeRect,
  gutter: Mm,
  others: readonly ArrangeRect[],
): ArrangeRect {
  const xs = [content.x, content.x + content.w - r.w]
  const ys = [content.y, content.y + content.h - r.h]
  for (const o of others) {
    xs.push(o.x + o.w + gutter, o.x - gutter - r.w)
    ys.push(o.y + o.h + gutter, o.y - gutter - r.h)
  }
  return { ...r, x: nearest(r.x, xs), y: nearest(r.y, ys) }
}

export const OPPOSITE: Record<ArrangeCorner, ArrangeCorner> = {
  tl: 'br',
  tr: 'bl',
  bl: 'tr',
  br: 'tl',
}

/** Tile width for a corner handle dragged to `pointer` (page mm), the opposite corner fixed. */
export function resizedTileW(
  rect: ArrangeRect,
  tileW: Mm,
  handle: ArrangeCorner,
  pointer: { readonly x: Mm; readonly y: Mm },
): Mm {
  const anchorX = handle === 'tl' || handle === 'bl' ? rect.x + rect.w : rect.x
  const anchorY = handle === 'tl' || handle === 'tr' ? rect.y + rect.h : rect.y
  const w = handle === 'tl' || handle === 'bl' ? anchorX - pointer.x : pointer.x - anchorX
  const h = handle === 'tl' || handle === 'tr' ? anchorY - pointer.y : pointer.y - anchorY
  const scale = (w * rect.w + h * rect.h) / (rect.w * rect.w + rect.h * rect.h)
  return Math.max(0, tileW * scale)
}

/** M5-R11: the block on `page` whose centre the ghost covers. */
export function swapTargetAt(
  blocks: readonly Pick<ArrangeBlock, 'id' | 'page' | 'rect'>[],
  dragged: string,
  page: number,
  ghost: ArrangeRect,
): string | null {
  for (const b of blocks) {
    if (b.id === dragged || b.page !== page) continue
    const cx = b.rect.x + b.rect.w / 2
    const cy = b.rect.y + b.rect.h / 2
    if (cx >= ghost.x && cx <= ghost.x + ghost.w && cy >= ghost.y && cy <= ghost.y + ghost.h)
      return b.id
  }
  return null
}

export interface GhostBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface DragView {
  readonly id: string
  readonly kind: 'move' | 'resize'
  readonly ghost: GhostBox
  readonly valid: boolean
  readonly swapTarget: GhostBox | null
}

interface Session {
  readonly pointerId: number
  readonly block: ArrangeBlock
  readonly corner: ArrangeCorner | null
  readonly startX: number
  readonly startY: number
  origin: DOMRect
  lastX: number
  lastY: number
  readonly grabX: Mm
  readonly grabY: Mm
  active: boolean
  intent: ArrangeIntent | null
}

interface Options {
  readonly arrange: ArrangeProps
  readonly page: number
  readonly pageW: Mm
  readonly sheet: () => HTMLElement | null
}

function toBox(r: ArrangeRect, box: DOMRect, origin: DOMRect, pageW: Mm): GhostBox {
  const ppm = box.width / pageW
  return {
    left: box.left - origin.left + r.x * ppm,
    top: box.top - origin.top + r.y * ppm,
    width: r.w * ppm,
    height: r.h * ppm,
  }
}

/** Pointer moves and resizes. Nothing is committed and nothing redraws until pointer up (M5-R19). */
export function useBlockDrag({ arrange, page, pageW, sheet }: Options) {
  const [view, setView] = useState<DragView | null>(null)
  const [pressed, setPressed] = useState(false)
  const session = useRef<Session | null>(null)
  const arrangeRef = useRef(arrange)
  useEffect(() => {
    arrangeRef.current = arrange
  })

  const end = useCallback(() => {
    session.current = null
    setPressed(false)
    setView(null)
  }, [])

  const track = useCallback(
    (clientX: number, clientY: number) => {
      const s = session.current
      if (!s) return
      s.lastX = clientX
      s.lastY = clientY
      if (!s.active && !movedEnough(clientX - s.startX, clientY - s.startY)) return
      s.active = true
      const now = sheet()?.getBoundingClientRect()
      if (now && now.width > 0) s.origin = now
      const a = arrangeRef.current
      const ppm = s.origin.width / pageW
      if (s.corner !== null) {
        const pointer = { x: (clientX - s.origin.left) / ppm, y: (clientY - s.origin.top) / ppm }
        const intent: ArrangeIntent = {
          kind: 'resize',
          id: s.block.id,
          tileW: resizedTileW(s.block.rect, s.block.tileW, s.corner, pointer),
          anchor: OPPOSITE[s.corner],
        }
        const result = a.onPreview(intent)
        s.intent = intent
        const rect = result.ok ? result.rect : s.block.rect
        setView({
          id: s.block.id,
          kind: 'resize',
          ghost: toBox(rect, s.origin, s.origin, pageW),
          valid: result.ok,
          swapTarget: null,
        })
        return
      }
      const hit = a.sheets.at(clientX, clientY) ?? { page, box: s.origin }
      const hitPpm = hit.box.width / pageW
      const raw = {
        x: (clientX - hit.box.left) / hitPpm - s.grabX,
        y: (clientY - hit.box.top) / hitPpm - s.grabY,
        w: s.block.rect.w,
        h: s.block.rect.h,
      }
      const others = a.blocks.filter((b) => b.page === hit.page && b.id !== s.block.id)
      const rect = snapRect(
        raw,
        a.content,
        a.gutter,
        others.map((b) => b.rect),
      )
      const target = swapTargetAt(a.blocks, s.block.id, hit.page, rect)
      const targetBlock = others.find((b) => b.id === target)
      const intent: ArrangeIntent = targetBlock
        ? { kind: 'swap', id: s.block.id, with: targetBlock.id }
        : {
            kind: 'move',
            id: s.block.id,
            page: hit.page,
            x: rect.x,
            y: rect.y,
            fallback: hit.page !== page,
          }
      const valid = a.onPreview(intent).ok
      s.intent = intent
      setView({
        id: s.block.id,
        kind: 'move',
        ghost: toBox(rect, hit.box, s.origin, pageW),
        valid,
        swapTarget: targetBlock ? toBox(targetBlock.rect, hit.box, s.origin, pageW) : null,
      })
    },
    [page, pageW, sheet],
  )

  useEffect(() => {
    if (!pressed) return
    const onMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId === session.current?.pointerId) track(e.clientX, e.clientY)
    }
    const onUp = (e: globalThis.PointerEvent) => {
      const s = session.current
      if (s?.pointerId !== e.pointerId) return
      end()
      if (s.active && s.intent) arrangeRef.current.onCommit(s.intent)
    }
    const onCancel = (e: globalThis.PointerEvent) => {
      if (e.pointerId === session.current?.pointerId) end()
    }
    const onScroll = () => {
      const s = session.current
      if (s?.active) track(s.lastX, s.lastY)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && session.current) {
        e.preventDefault()
        e.stopPropagation()
        end()
      }
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [pressed, track, end])

  const start = useCallback(
    (e: PointerEvent<HTMLElement>, block: ArrangeBlock, corner: ArrangeCorner | null) => {
      if (e.button !== 0) return
      const el = sheet()
      if (!el) return
      const origin = el.getBoundingClientRect()
      if (origin.width <= 0) return
      const ppm = origin.width / pageW
      session.current = {
        pointerId: e.pointerId,
        block,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        origin,
        lastX: e.clientX,
        lastY: e.clientY,
        grabX: (e.clientX - origin.left) / ppm - block.rect.x,
        grabY: (e.clientY - origin.top) / ppm - block.rect.y,
        active: false,
        intent: null,
      }
      setPressed(true)
    },
    [pageW, sheet],
  )

  return { drag: view, start }
}
