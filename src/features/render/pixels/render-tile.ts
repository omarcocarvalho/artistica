import { extendEdges, type PixelCtx } from './bleed'
import { MAX_CANVAS_AREA_PX, downscaleSteps, type TilePixelPlan } from './tile-plan'

/** The subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D a tile render needs. */
export interface TileCtx extends PixelCtx {
  fillStyle: string | CanvasGradient | CanvasPattern
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality
  fillRect(x: number, y: number, w: number, h: number): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  resetTransform(): void
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
}

export interface TileCanvas {
  width: number
  height: number
  getContext(contextId: '2d'): TileCtx | null
}

/** Creates a canvas: OffscreenCanvas in the worker, OffscreenCanvas or <canvas> on the main thread. */
export type CanvasFactory<C extends TileCanvas & CanvasImageSource> = (w: number, h: number) => C

export class CanvasUnavailableError extends Error {
  constructor() {
    super('export:unsupported')
    this.name = 'CanvasUnavailableError'
  }
}

function context(canvas: TileCanvas): TileCtx {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new CanvasUnavailableError()
  return ctx
}

/** Free a canvas' backing store now (Safari keeps it until GC otherwise). */
export function releaseCanvas(canvas: TileCanvas): void {
  canvas.width = 0
  canvas.height = 0
}

/**
 * Render one tile (crop → resample → rotate/flip → bleed by edge extension) into a new canvas of
 * plan.canvasW × plan.canvasH. Shared by the preview (main thread) and the PDF export (worker), so
 * both produce the same pixels. `source` must contain plan.src.
 */
export function renderTile<C extends TileCanvas & CanvasImageSource>(
  source: CanvasImageSource,
  plan: TilePixelPlan,
  createCanvas: CanvasFactory<C>,
): C {
  const temps: C[] = []
  let out: C | undefined
  try {
    // 1. Step-down resample in source orientation.
    let from: CanvasImageSource = source
    let rect = plan.src
    for (const step of downscaleSteps(plan.src.w, plan.src.h, plan.scaledW, plan.scaledH)) {
      if (step.w * step.h > MAX_CANVAS_AREA_PX) throw new CanvasUnavailableError()
      const tmp = createCanvas(step.w, step.h)
      temps.push(tmp)
      const tctx = context(tmp)
      tctx.imageSmoothingEnabled = true
      tctx.imageSmoothingQuality = 'high'
      tctx.drawImage(from, rect.x, rect.y, rect.w, rect.h, 0, 0, step.w, step.h)
      from = tmp
      rect = { x: 0, y: 0, w: step.w, h: step.h }
    }

    // 2. Final draw: white background (JPEG has no alpha), then the oriented image inside the bleed ring.
    out = createCanvas(plan.canvasW, plan.canvasH)
    const ctx = context(out)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, plan.canvasW, plan.canvasH)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const [a, b, c, d, e, f] = plan.matrix
    ctx.setTransform(a, b, c, d, e, f)
    ctx.drawImage(from, rect.x, rect.y, rect.w, rect.h, 0, 0, plan.scaledW, plan.scaledH)
    ctx.resetTransform()

    // 3. Bleed.
    extendEdges(ctx, plan.bleedPx, plan.outW, plan.outH)
    return out
  } catch (error) {
    if (out) releaseCanvas(out)
    throw error
  } finally {
    temps.forEach(releaseCanvas)
  }
}
