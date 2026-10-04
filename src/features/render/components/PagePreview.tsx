import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageId } from '../../../shared/model/image'
import { Badge } from '../../../shared/ui'
import { releaseCanvas, renderTile } from '../pixels/render-tile'
import { planTilePixels, tileRenderKey } from '../pixels/tile-plan'
import { DEFAULT_PAGE_DRAW_COLORS, drawPage, type PageDrawColors } from '../preview/draw-page'
import { previewDpi, previewScale, tileHitAreas } from '../preview/preview-geometry'
import type { PageModel } from '../types'

export interface PagePreviewProps {
  readonly model: PageModel
  readonly getBitmap: (id: ImageId) => ImageBitmap | undefined
  readonly selectedId: ImageId | null
  readonly onSelect: (id: ImageId) => void
  readonly guides: boolean
  /** Accessible + visible label of the page, e.g. "Page 1 of 2 · A4 portrait" (built by the shell). */
  readonly label: string
  /** Image name for tile labels; falls back to preview:tile.fallbackName ("Image N"). */
  readonly getName?: (id: ImageId) => string
}

const createDomCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Guide colours from the design tokens (they are print colours, identical in both themes). */
function readDrawColors(el: Element): PageDrawColors {
  const css = getComputedStyle(el)
  const pick = (name: string, fallback: string): string =>
    css.getPropertyValue(name).trim() || fallback
  const d = DEFAULT_PAGE_DRAW_COLORS
  return {
    paper: pick('--color-paper', d.paper),
    safe: pick('--color-guide-safe', d.safe),
    bleed: pick('--color-guide-bleed', d.bleed),
    cut: pick('--color-guide-cut', d.cut),
    mark: pick('--color-crop-mark', d.mark),
    missing: d.missing,
  }
}

/** CSS width of an element, tracked with ResizeObserver (0 until measured). */
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
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

/**
 * One printed page on the desk: a white sheet (canvas at devicePixelRatio) drawn from the same
 * PageModel and the same tile renderer as the PDF, with a focusable button over every tile (D6).
 * The sheet fills its container's width; the shell controls size/zoom through the container.
 */
export function PagePreview({
  model,
  getBitmap,
  selectedId,
  onSelect,
  guides,
  label,
  getName,
}: PagePreviewProps) {
  const { t } = useTranslation('preview')
  const captionId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cache] = useState(() => new Map<string, HTMLCanvasElement>())
  const width = useElementWidth(sheetRef)
  const dpr = window.devicePixelRatio
  const scale = useMemo(() => previewScale(model.size, width, dpr), [model.size, width, dpr])
  const areas = useMemo(() => tileHitAreas(model), [model])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = width > 0 ? canvas?.getContext('2d') : null
    if (!canvas || !ctx) return // not measured yet, or no 2D canvas (tests): the overlay still works
    canvas.width = scale.deviceW
    canvas.height = scale.deviceH
    const dpi = previewDpi(scale)
    const used = new Set<string>()
    const rendered = model.tiles.map((tile) => {
      const bitmap = getBitmap(tile.imageId)
      if (!bitmap) return null
      const plan = planTilePixels(tile, { dpi })
      const key = tileRenderKey(tile, plan)
      used.add(key)
      let tileCanvas = cache.get(key)
      if (!tileCanvas) {
        tileCanvas = renderTile(bitmap, plan, createDomCanvas)
        cache.set(key, tileCanvas)
      }
      return tileCanvas
    })
    for (const [key, c] of cache) {
      if (!used.has(key)) {
        releaseCanvas(c)
        cache.delete(key)
      }
    }
    drawPage(ctx, model, scale, {
      showGuides: guides,
      colors: readDrawColors(canvas),
      tileImage: (i) => rendered[i] ?? null,
    })
  }, [model, scale, width, guides, getBitmap, cache])

  useEffect(
    () => () => {
      for (const c of cache.values()) releaseCanvas(c)
      cache.clear()
    },
    [cache],
  )

  const nameOf = (id: ImageId, index: number): string =>
    getName?.(id) ?? t('tile.fallbackName', { n: index + 1 })

  return (
    <figure className="m-0 flex w-full flex-col items-center gap-2">
      <div
        ref={sheetRef}
        role="group"
        aria-labelledby={captionId}
        className="bg-paper shadow-paper relative w-full"
        style={{ aspectRatio: `${String(model.size.w)} / ${String(model.size.h)}` }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 block h-full w-full"
        />
        {areas.map((area, i) => {
          const selected = area.imageId === selectedId
          const name = nameOf(area.imageId, i)
          const dpiId = `${captionId}-dpi-${String(i)}`
          const fitId = `${captionId}-fit-${String(i)}`
          return (
            <button
              key={area.key}
              type="button"
              aria-label={name}
              aria-pressed={selected}
              aria-describedby={
                [area.lowDpi ? dpiId : null, area.scaledToFit ? fitId : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onClick={() => {
                onSelect(area.imageId)
              }}
              className="aria-pressed:outline-selection absolute cursor-pointer bg-transparent p-0 aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-solid"
              style={{
                left: `${String(area.leftPct)}%`,
                top: `${String(area.topPct)}%`,
                width: `${String(area.widthPct)}%`,
                height: `${String(area.heightPct)}%`,
              }}
            >
              {selected && (
                <span
                  aria-hidden="true"
                  className="bg-selection text-ink-inverse absolute -top-[22px] left-0 rounded px-1.5 text-[10px] font-bold whitespace-nowrap"
                >
                  {name}
                </span>
              )}
              {area.lowDpi && (
                <>
                  <Badge
                    tone="warning"
                    icon="warning"
                    aria-hidden="true"
                    className="absolute right-1 bottom-1 text-[10px] shadow-xs"
                  >
                    {t('tile.lowDpi', { dpi: area.dpi })}
                  </Badge>
                  <span id={dpiId} className="sr-only">
                    {t('tile.lowDpiLabel', { dpi: area.dpi })}
                  </span>
                </>
              )}
              {area.scaledToFit && (
                <>
                  <Badge
                    tone="warning"
                    icon="warning"
                    aria-hidden="true"
                    className="absolute bottom-1 left-1 text-[10px] shadow-xs"
                  >
                    {t('tile.scaledToFit')}
                  </Badge>
                  <span id={fitId} className="sr-only">
                    {t('tile.scaledToFitLabel')}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <figcaption id={captionId} className="text-ink-muted text-xs">
        {label}
      </figcaption>
    </figure>
  )
}
