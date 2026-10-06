import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { CropRect } from '../../../shared/model/image'
import { HANDLES, arrowDelta, keyboardStep, moveCrop, resizeCrop, type Handle } from '../crop'
import {
  displaySize,
  mapDeltaToSource,
  mapHandleToSource,
  mapRectToDisplay,
  viewMatrix,
  type ViewTransform,
} from '../view'

export const CROP_STAGE_FALLBACK_PX = 400
const MAX_STAGE_HEIGHT_PX = 420
/** Half of a handle's 44 px hit area: the room a handle needs outside the image at a full crop. */
const HANDLE_REACH_PX = 22

export interface CropEditorProps {
  /** The whole image at any size; it is drawn over pxW x pxH. */
  bitmap: ImageBitmap
  pxW: number
  pxH: number
  crop: CropRect
  ratio: number | null
  view: ViewTransform
  onChange: (crop: CropRect) => void
}

type Drag =
  | { kind: 'move'; id: number; start: CropRect; x0: number; y0: number }
  | { kind: 'resize'; id: number; start: CropRect; x0: number; y0: number; handle: Handle }

const HANDLE_STYLE: Record<Handle, string> = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
}

export function CropEditor({ bitmap, pxW, pxH, crop, ratio, view, onChange }: CropEditorProps) {
  const { t } = useTranslation('images')
  const helpId = useId()
  const readoutId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<CropRect | null>(null)
  const [available, setAvailable] = useState(CROP_STAGE_FALLBACK_PX)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      const w = el.clientWidth
      if (w > 0) setAvailable(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [])

  // Displayed-frame image size in image pixels, and the css size that fits the stage.
  const disp = displaySize(pxW, pxH, view.rotation)
  const fit = Math.min(available / disp.w, MAX_STAGE_HEIGHT_PX / disp.h)
  const cssW = Math.max(1, disp.w * fit)
  const cssH = Math.max(1, disp.h * fit)
  const k = disp.w / cssW // displayed image px per css px

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = Math.max(1, window.devicePixelRatio)
    el.width = Math.round(cssW * dpr)
    el.height = Math.round(cssH * dpr)
    const s = el.width / disp.w
    const [a, b, c, d, e, f] = viewMatrix(view, pxW, pxH)
    try {
      ctx.setTransform(s * a, s * b, s * c, s * d, s * e, s * f)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, pxW, pxH)
    } catch {
      /* the bitmap was closed because the image was removed while editing */
    }
  }, [bitmap, view, pxW, pxH, cssW, cssH, disp.w])

  const shown = draft ?? crop
  const box = mapRectToDisplay(shown, view, pxW, pxH)

  // Text readout of the committed rectangle (CR-E6): the live region ignores drafts so a drag does not flood screen readers.
  const readout = t('editSheet.crop.status', {
    w: Math.round(crop.w),
    h: Math.round(crop.h),
    x: Math.round(crop.x),
    y: Math.round(crop.y),
  })

  const begin = (e: PointerEvent<HTMLElement>, kind: 'move' | 'resize', handle?: Handle): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()
    if (drag.current) return
    if (kind === 'resize' && handle) {
      drag.current = {
        kind,
        id: e.pointerId,
        start: crop,
        x0: e.clientX,
        y0: e.clientY,
        handle: mapHandleToSource(handle, view),
      }
    } else {
      drag.current = { kind: 'move', id: e.pointerId, start: crop, x0: e.clientX, y0: e.clientY }
    }
    if ('setPointerCapture' in e.currentTarget) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic pointer ids have nothing to capture */
      }
    }
  }

  const compute = (e: PointerEvent<HTMLElement>): CropRect | null => {
    const d = drag.current
    if (d?.id !== e.pointerId) return null
    const delta = mapDeltaToSource({ x: (e.clientX - d.x0) * k, y: (e.clientY - d.y0) * k }, view)
    return d.kind === 'move'
      ? moveCrop(d.start, delta.x, delta.y, pxW, pxH)
      : resizeCrop(d.start, d.handle, delta.x, delta.y, pxW, pxH, ratio)
  }

  const onMove = (e: PointerEvent<HTMLElement>): void => {
    const next = compute(e)
    if (next) setDraft(next)
  }
  const onUp = (e: PointerEvent<HTMLElement>): void => {
    const next = compute(e)
    if (!next) return
    drag.current = null
    setDraft(null)
    onChange(next)
  }
  const onCancel = (e: PointerEvent<HTMLElement>): void => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    setDraft(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    const step = keyboardStep(pxW, pxH)
    const d = arrowDelta(e.key, step)
    if (!d || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    const delta = mapDeltaToSource({ x: d.dx, y: d.dy }, view)
    const next = e.shiftKey
      ? resizeCrop(crop, mapHandleToSource('se', view), delta.x, delta.y, pxW, pxH, ratio)
      : moveCrop(crop, delta.x, delta.y, pxW, pxH)
    onChange(next)
  }

  return (
    <div className="flex w-full flex-col items-center">
      <div className="w-full" style={{ padding: HANDLE_REACH_PX }}>
        <div ref={wrap} className="flex w-full justify-center">
          <div className="relative touch-none select-none" style={{ width: cssW, height: cssH }}>
            <div className="bg-surface-sunken absolute inset-0 overflow-hidden rounded-md">
              <canvas
                ref={canvas}
                data-testid="crop-canvas"
                role="img"
                aria-label={t('editSheet.crop.stageLabel')}
                style={{ width: cssW, height: cssH }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute shadow-[0_0_0_999px_rgb(20_14_10/0.55)]"
                style={{ left: box.x / k, top: box.y / k, width: box.w / k, height: box.h / k }}
              />
            </div>
            <div
              role="group"
              tabIndex={0}
              aria-label={t('editSheet.crop.areaLabel')}
              aria-describedby={`${helpId} ${readoutId}`}
              data-testid="crop-area"
              onPointerDown={(e) => {
                begin(e, 'move')
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
              onLostPointerCapture={onCancel}
              onKeyDown={onKeyDown}
              className="focus-visible:outline-secondary absolute cursor-move border-2 border-white outline-offset-2 focus-visible:outline-3"
              style={{ left: box.x / k, top: box.y / k, width: box.w / k, height: box.h / k }}
            >
              {HANDLES.map((h) => (
                <i
                  key={h}
                  data-handle={h}
                  aria-hidden="true"
                  onPointerDown={(e) => {
                    begin(e, 'resize', h)
                  }}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onCancel}
                  onLostPointerCapture={onCancel}
                  className={`absolute size-11 ${HANDLE_STYLE[h]} after:absolute after:top-1/2 after:left-1/2 after:size-3 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-sm after:border-2 after:border-white after:bg-black/40`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <p id={helpId} className="text-ink-muted text-sm">
        {t('editSheet.crop.help')}
      </p>
      <p
        id={readoutId}
        role="status"
        aria-live="polite"
        data-testid="crop-readout"
        className="text-ink-muted mt-1 font-mono text-xs tabular-nums"
      >
        {readout}
      </p>
    </div>
  )
}
