import { transfer } from 'comlink'
import type { edgeOutline } from './outline'

export type EdgeCore = typeof edgeOutline
export type Outline = { x: number; y: number }[][]

export interface PackedOutline {
  readonly coords: Float64Array
  readonly lengths: Uint32Array
}

export interface EdgeWorkerApi {
  /** Rejects with "edges:unsupported" when this context cannot read pixels. */
  init(): Promise<void>
  /** Takes ownership of `bitmap` (closed on every path). */
  outline(bitmap: ImageBitmap, detailPct: number): Promise<PackedOutline>
}

export interface PixelCtx {
  drawImage(image: ImageBitmap, dx: number, dy: number): void
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData
}

export interface PixelCanvas {
  width: number
  height: number
  getContext(contextId: '2d', settings?: { willReadFrequently?: boolean }): PixelCtx | null
}

export interface EdgeCanvasEnv {
  readonly supported: () => boolean
  readonly createCanvas: (w: number, h: number) => PixelCanvas
}

export function packOutline(lines: Outline): PackedOutline {
  let points = 0
  for (const line of lines) points += line.length
  const coords = new Float64Array(points * 2)
  const lengths = new Uint32Array(lines.length)
  let i = 0
  lines.forEach((line, n) => {
    lengths[n] = line.length
    for (const p of line) {
      coords[i++] = p.x
      coords[i++] = p.y
    }
  })
  return { coords, lengths }
}

export function unpackOutline({ coords, lengths }: PackedOutline): Outline {
  const lines: Outline = []
  let i = 0
  for (const length of lengths) {
    const line: { x: number; y: number }[] = []
    for (let k = 0; k < length; k++) {
      line.push({ x: coords[i] ?? 0, y: coords[i + 1] ?? 0 })
      i += 2
    }
    lines.push(line)
  }
  return lines
}

function readPixels(env: EdgeCanvasEnv, bitmap: ImageBitmap): Uint8ClampedArray {
  const { width: w, height: h } = bitmap
  let canvas: PixelCanvas | undefined
  try {
    canvas = env.createCanvas(w, h)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('edges:unsupported')
    ctx.drawImage(bitmap, 0, 0)
    return ctx.getImageData(0, 0, w, h).data
  } finally {
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}

export function createEdgeWorkerApi(
  env: EdgeCanvasEnv,
  load: () => Promise<EdgeCore>,
): EdgeWorkerApi {
  return {
    init: () =>
      Promise.resolve().then(() => {
        if (!env.supported()) throw new Error('edges:unsupported')
      }),

    async outline(bitmap, detailPct) {
      const { width: w, height: h } = bitmap
      let core: EdgeCore
      let rgba: Uint8ClampedArray
      try {
        core = await load()
        rgba = readPixels(env, bitmap)
      } finally {
        bitmap.close()
      }
      const packed = packOutline(core(rgba, w, h, detailPct))
      return transfer(packed, [packed.coords.buffer, packed.lengths.buffer])
    },
  }
}

export function edgeCanvas2d(): boolean {
  if (typeof OffscreenCanvas !== 'function') return false
  try {
    return new OffscreenCanvas(1, 1).getContext('2d') !== null
  } catch {
    return false
  }
}

export function offscreenEnv(): EdgeCanvasEnv {
  return {
    supported: edgeCanvas2d,
    createCanvas: (w, h) => new OffscreenCanvas(w, h),
  }
}
