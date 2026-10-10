import type { TileStudy } from '../../../shared/model/study'
import { applyStudyToContext } from '../../studies/apply-study'
import { extendEdges, type PixelCtx } from './bleed'
import { MAX_CANVAS_AREA_PX, downscaleSteps, type PxRect, type TilePixelPlan } from './tile-plan'

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

/** A step-down level of `src` in `source`: the result of `depth` exact halvings. */
export interface StepLevel<C> {
  readonly source: CanvasImageSource
  readonly src: PxRect
  readonly depth: number
  readonly canvas: C
}

/**
 * Step-down levels kept between renders of one tile: the halvings depend on the source and crop
 * only, so a render at another size reuses them. After each render the slot holds the deepest
 * level that render used and the one above it; the slot's owner releases what is left.
 */
export interface StepLevelSlot<C> {
  levels: readonly StepLevel<C>[]
}

export function releaseStepLevels(slot: StepLevelSlot<TileCanvas>): void {
  for (const l of slot.levels) releaseCanvas(l.canvas)
  slot.levels = []
}

const sameRect = (a: PxRect, b: PxRect): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** How many leading steps halve the previous size exactly, so the output size did not shape them. */
function exactHalvings(src: PxRect, steps: readonly { w: number; h: number }[]): number {
  let w = src.w
  let h = src.h
  let n = 0
  for (const step of steps) {
    if (step.w !== Math.ceil(w / 2) || step.h !== Math.ceil(h / 2)) break
    w = step.w
    h = step.h
    n++
  }
  return n
}

/**
 * Render one tile (crop → resample → rotate/flip → study → bleed by edge extension) into a new
 * canvas of plan.canvasW × plan.canvasH. Shared by the preview and the PDF export, so both produce
 * the same pixels. `source` must contain plan.src. With `slot`, the step-down starts from the
 * deepest kept level this render needs, which gives the same pixels as starting from the source.
 */
export function renderTile<C extends TileCanvas & CanvasImageSource>(
  source: CanvasImageSource,
  plan: TilePixelPlan,
  createCanvas: CanvasFactory<C>,
  study: TileStudy | null = null,
  slot?: StepLevelSlot<C>,
): C {
  const temps: C[] = []
  let keep: readonly StepLevel<C>[] = []
  let out: C | undefined
  try {
    // 1. Step-down resample in source orientation.
    const steps = downscaleSteps(plan.src.w, plan.src.h, plan.scaledW, plan.scaledH)
    const exact = slot ? exactHalvings(plan.src, steps) : 0
    const valid = (slot?.levels ?? []).filter(
      (l) => l.source === source && sameRect(l.src, plan.src),
    )
    let start: StepLevel<C> | null = null
    for (const l of valid) if (l.depth <= exact && l.depth > (start?.depth ?? 0)) start = l
    const made: StepLevel<C>[] = []
    let from: CanvasImageSource = start?.canvas ?? source
    let rect = start ? { x: 0, y: 0, w: start.canvas.width, h: start.canvas.height } : plan.src
    for (let i = start?.depth ?? 0; i < steps.length; i++) {
      const step = steps[i]
      if (!step) break
      if (step.w * step.h > MAX_CANVAS_AREA_PX) throw new CanvasUnavailableError()
      const tmp = createCanvas(step.w, step.h)
      temps.push(tmp)
      const tctx = context(tmp)
      tctx.imageSmoothingEnabled = true
      tctx.imageSmoothingQuality = 'high'
      tctx.drawImage(from, rect.x, rect.y, rect.w, rect.h, 0, 0, step.w, step.h)
      from = tmp
      rect = { x: 0, y: 0, w: step.w, h: step.h }
      made.push({ source, src: plan.src, depth: i + 1, canvas: tmp })
    }
    const next = [...valid, ...made]
      .filter((l) => l.depth === exact || l.depth === exact - 1)
      .sort((x, y) => x.depth - y.depth)

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

    // 3. Study on the image area only, so the bleed replicates studied pixels (M2-R5).
    if (study !== null) applyStudyToContext(ctx, plan, study)

    // 4. Bleed.
    extendEdges(ctx, plan.bleedPx, plan.outW, plan.outH)
    if (slot) {
      for (const l of slot.levels) if (!next.includes(l)) releaseCanvas(l.canvas)
      slot.levels = next
      keep = next
    }
    return out
  } catch (error) {
    if (out) releaseCanvas(out)
    throw error
  } finally {
    for (const t of temps) if (!keep.some((l) => l.canvas === t)) releaseCanvas(t)
  }
}
