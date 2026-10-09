import { describe, expect, it } from 'vitest'
import { EDGE_ANALYSIS_LONG_SIDE, fromCrop, fromRotated } from '../features/lines'
import { resolveCrop } from '../features/render'
import {
  DEFAULT_EDITS,
  type ImageDescriptor,
  type ImageEdits,
  type ImageId,
  type Rotation,
} from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { DEFAULT_STUDY } from '../shared/model/study'
import { createBitmapFor, type BitmapCanvas } from './detections'

/** A bitmap whose pixels are labels (one number per pixel, row-major). */
interface LabelBitmap {
  width: number
  height: number
  labels: number[]
  closed: boolean
  close(): void
}

function labelBitmap(width: number, height: number): LabelBitmap {
  const b: LabelBitmap = {
    width,
    height,
    labels: Array.from({ length: width * height }, (_, i) => i),
    closed: false,
    close: () => {
      b.closed = true
    },
  }
  return b
}

type Matrix = readonly [number, number, number, number, number, number]

interface DrawCall {
  readonly src: readonly [number, number, number, number]
  readonly dst: readonly [number, number, number, number]
  readonly matrix: Matrix
}

/**
 * A canvas with real 2D semantics for setTransform + the 9-argument drawImage, sampled at pixel
 * centres with nearest-neighbour: each output pixel holds the label of the source pixel it shows.
 */
function labelCanvas(created: { w: number; h: number; draws: DrawCall[] }[]) {
  return (w: number, h: number): BitmapCanvas => {
    const record = { w, h, draws: [] as DrawCall[] }
    created.push(record)
    let matrix: Matrix = [1, 0, 0, 1, 0, 0]
    const out: number[] = new Array<number>(w * h).fill(-1)
    return {
      ctx: {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'low',
        setTransform(a, b, c, d, e, f) {
          matrix = [a, b, c, d, e, f]
        },
        drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
          record.draws.push({ src: [sx, sy, sw, sh], dst: [dx, dy, dw, dh], matrix })
          const src = image as unknown as LabelBitmap
          const [a, b, c, d, e, f] = matrix
          const det = a * d - b * c
          for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
              const X = px + 0.5 - e
              const Y = py + 0.5 - f
              const u = (d * X - c * Y) / det
              const v = (a * Y - b * X) / det
              if (u < dx || v < dy || u >= dx + dw || v >= dy + dh) continue
              const x = Math.floor(sx + ((u - dx) / dw) * sw)
              const y = Math.floor(sy + ((v - dy) / dh) * sh)
              out[py * w + px] = src.labels[y * src.width + x] ?? -1
            }
          }
        },
      },
      toBitmap: () => {
        const b = labelBitmap(w, h)
        b.labels = out.slice()
        return b
      },
    }
  }
}

function descriptor(edits: Partial<ImageEdits>, pxW: number, pxH: number): ImageDescriptor {
  return {
    id: 'a' as ImageId,
    contentHash: 'h',
    pxW,
    pxH,
    edits: { ...DEFAULT_EDITS, ...edits },
    study: DEFAULT_STUDY,
    lines: DEFAULT_LINES,
  }
}

function setup(preview: LabelBitmap | undefined) {
  const created: { w: number; h: number; draws: DrawCall[] }[] = []
  const bitmapFor = createBitmapFor({
    previewOf: () => preview,
    canvas: labelCanvas(created),
  })
  return { bitmapFor, created }
}

const asLabels = (b: ImageBitmap) => b as unknown as LabelBitmap

describe('bitmapFor(img, "face" | "pose")', () => {
  it.each([90, 180, 270] as const)(
    'rotates the preview %i° clockwise so fromRotated maps every pixel back to its source centre',
    async (rotation: Rotation) => {
      const preview = labelBitmap(4, 3)
      const { bitmapFor } = setup(preview)
      const out = asLabels(await bitmapFor(descriptor({ rotation }, 4, 3), 'face'))
      expect([out.width, out.height]).toEqual(rotation === 180 ? [4, 3] : [3, 4])
      expect([...out.labels].sort((p, q) => p - q)).toEqual(preview.labels)
      for (let y = 0; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
          const label = out.labels[y * out.width + x] ?? -1
          const src = fromRotated({ x: (x + 0.5) / out.width, y: (y + 0.5) / out.height }, rotation)
          expect(src.x).toBeCloseTo(((label % 4) + 0.5) / 4, 12)
          expect(src.y).toBeCloseTo((Math.floor(label / 4) + 0.5) / 3, 12)
        }
      }
    },
  )

  it('analyses the whole preview: never cropped or flipped (owner Q9)', async () => {
    const preview = labelBitmap(4, 3)
    const { bitmapFor } = setup(preview)
    const edits = { crop: { x: 1, y: 1, w: 2, h: 1 }, flipH: true, flipV: true }
    const out = asLabels(await bitmapFor(descriptor(edits, 4, 3), 'pose'))
    expect([out.width, out.height]).toEqual([4, 3])
    expect(out.labels).toEqual(preview.labels)
  })

  it('never hands out the store’s preview itself (the scheduler closes what it gets)', async () => {
    const preview = labelBitmap(4, 3)
    const { bitmapFor } = setup(preview)
    const out = await bitmapFor(descriptor({}, 4, 3), 'face')
    expect(out).not.toBe(preview)
    expect(preview.closed).toBe(false)
  })
})

describe('bitmapFor(img, "edges")', () => {
  it('crops with resolveCrop(img) scaled to the preview, then fits the long side to EDGE_ANALYSIS_LONG_SIDE', async () => {
    const preview = labelBitmap(2048, 1366)
    const { bitmapFor, created } = setup(preview)
    const img = descriptor({ crop: { x: 300, y: 200, w: 2400, h: 1200 } }, 3000, 2000)
    const out = asLabels(await bitmapFor(img, 'edges'))
    expect(EDGE_ANALYSIS_LONG_SIDE).toBe(1024)
    expect([out.width, out.height]).toEqual([1024, 512])
    const sx = 2048 / 3000
    const sy = 1366 / 2000
    expect(created[0]?.draws[0]?.src).toEqual([300 * sx, 200 * sy, 2400 * sx, 1200 * sy])
    expect(created[0]?.draws[0]?.matrix).toEqual([1, 0, 0, 1, 0, 0])
    const crop = resolveCrop(img)
    for (const [x, y] of [
      [0, 0],
      [1023, 0],
      [0, 511],
      [1023, 511],
      [517, 263],
    ] as const) {
      const p = fromCrop({ x: (x + 0.5) / 1024, y: (y + 0.5) / 512 }, crop, 3000, 2000)
      const label = Math.floor(p.y * 1366) * 2048 + Math.floor(p.x * 2048)
      expect(out.labels[y * 1024 + x]).toBe(label)
    }
  })

  it('keeps a small crop at its preview size (never upscaled)', async () => {
    const preview = labelBitmap(800, 600)
    const { bitmapFor } = setup(preview)
    const out = asLabels(
      await bitmapFor(descriptor({ crop: { x: 100, y: 50, w: 400, h: 300 } }, 1600, 1200), 'edges'),
    )
    expect([out.width, out.height]).toEqual([200, 150])
  })

  it('a portrait source larger than 1024 px gets a 1024 px tall bitmap', async () => {
    const preview = labelBitmap(1365, 2048)
    const { bitmapFor } = setup(preview)
    const out = asLabels(await bitmapFor(descriptor({}, 4000, 6000), 'edges'))
    expect(Math.max(out.width, out.height)).toBe(1024)
    expect(out.height).toBe(1024)
    expect(out.width).toBe(Math.round((1365 * 1024) / 2048))
  })

  it('is unrotated and unflipped (the mapping back uses only the crop)', async () => {
    const preview = labelBitmap(40, 30)
    const { bitmapFor, created } = setup(preview)
    await bitmapFor(descriptor({ rotation: 90, flipH: true }, 40, 30), 'edges')
    expect(created[0]?.draws[0]?.matrix).toEqual([1, 0, 0, 1, 0, 0])
    expect([created[0]?.w, created[0]?.h]).toEqual([40, 30])
  })
})

describe('bitmapFor and the descriptor', () => {
  it('uses the edits of the descriptor it is given, never newer ones from the store', async () => {
    const preview = labelBitmap(4, 3)
    const created: { w: number; h: number; draws: DrawCall[] }[] = []
    const newer = descriptor({ rotation: 90, crop: { x: 0, y: 0, w: 1, h: 1 } }, 4, 3)
    const bitmapFor = createBitmapFor({
      previewOf: (id) => (id === newer.id ? preview : undefined),
      canvas: labelCanvas(created),
    })
    const older = descriptor({}, 4, 3)
    expect([asLabels(await bitmapFor(older, 'face')).width, created[0]?.h]).toEqual([4, 3])
    expect(asLabels(await bitmapFor(older, 'edges')).width).toBe(4)
  })

  it('rejects when the photo is gone (the scheduler drops the job)', async () => {
    const { bitmapFor } = setup(undefined)
    await expect(bitmapFor(descriptor({}, 4, 3), 'face')).rejects.toThrow()
  })
})
