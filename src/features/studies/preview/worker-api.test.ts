import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TileStudy } from '../../../shared/model/study'
import { planTilePixels } from '../../render/pixels/tile-plan'
import {
  fakeFactory,
  type DrawableFake,
  type FakeCanvas,
} from '../../render/test-support/fake-canvas'
import { drawTile, id } from '../../render/test-support/fixtures'
import {
  createStudyWorkerApi,
  offscreenCanvas2d,
  offscreenEnv,
  type StudyWorkerEnv,
} from './worker-api'

const VALUES: TileStudy = { blurPct: null, values: { count: 2, hue: 55, neutral: true } }

/** A source whose pixels are a left-dark / right-light split, so a 2-value study has 2 colours. */
function source(w: number, h: number) {
  const bitmap = {
    width: w,
    height: h,
    closed: 0,
    close: () => {
      bitmap.closed++
    },
    paint: (x: number) => (x < w / 2 ? [20, 20, 20, 255] : [230, 230, 230, 255]),
  }
  return bitmap as unknown as ImageBitmap & { closed: number }
}

function env(overrides: Partial<StudyWorkerEnv<DrawableFake>> = {}) {
  const made: FakeCanvas[] = []
  const pixels: Uint8ClampedArray[] = []
  const e: StudyWorkerEnv<DrawableFake> = {
    supported: () => true,
    createCanvas: fakeFactory(made),
    toBitmap: (c) => {
      pixels.push(c.data.slice())
      return Promise.resolve({
        width: c.width,
        height: c.height,
        close: vi.fn(),
      } as unknown as ImageBitmap)
    },
    ...overrides,
  }
  return { e, made, pixels }
}

const plan = planTilePixels(
  drawTile({
    imageId: id('a'),
    trim: { x: 0, y: 0, w: 40, h: 30 },
    crop: { x: 0, y: 0, w: 40, h: 30 },
  }),
  { dpi: 25.4 },
)

const colours = (data: Uint8ClampedArray): Set<string> => {
  const out = new Set<string>()
  for (let i = 0; i < data.length; i += 4) out.add(data.subarray(i, i + 3).join(','))
  return out
}

describe('createStudyWorkerApi', () => {
  it('init rejects when OffscreenCanvas 2D is unavailable', async () => {
    const { e } = env({ supported: () => false })
    await expect(createStudyWorkerApi(e).init()).rejects.toThrow('studies:unsupported')
  })

  it('init resolves when the context can render tiles', async () => {
    const { e } = env()
    await expect(createStudyWorkerApi(e).init()).resolves.toBeUndefined()
  })

  it('renders the tile with the study and returns a bitmap of the canvas size', async () => {
    const { e, pixels } = env()
    const out = await createStudyWorkerApi(e).renderStudyTile(plan, source(40, 30), VALUES)
    expect({ w: out.width, h: out.height }).toEqual({ w: plan.canvasW, h: plan.canvasH })
    expect(pixels).toHaveLength(1)
    // 2-value neutral study of a dark/light split → exactly 2 colours (an original would be 2 as
    // well, so also check they are not the source colours).
    const seen = colours(pixels[0] ?? new Uint8ClampedArray())
    expect(seen.size).toBe(2)
    expect(seen.has('20,20,20')).toBe(false)
    expect(seen.has('230,230,230')).toBe(false)
  })

  it('closes the input bitmap and releases every canvas on success', async () => {
    const { e, made } = env()
    const src = source(40, 30)
    await createStudyWorkerApi(e).renderStudyTile(plan, src, VALUES)
    expect(src.closed).toBe(1)
    expect(made.length).toBeGreaterThan(0)
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })

  it('closes the input bitmap and releases the canvas when making the bitmap fails', async () => {
    const { e, made } = env({ toBitmap: () => Promise.reject(new Error('encode failed')) })
    const src = source(40, 30)
    await expect(createStudyWorkerApi(e).renderStudyTile(plan, src, VALUES)).rejects.toThrow(
      'encode failed',
    )
    expect(src.closed).toBe(1)
    expect(made.length).toBeGreaterThan(0)
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })

  it('closes the input bitmap when the tile cannot be rendered at all', async () => {
    const { e } = env({
      createCanvas: () => {
        throw new Error('no canvas')
      },
    })
    const src = source(40, 30)
    await expect(createStudyWorkerApi(e).renderStudyTile(plan, src, VALUES)).rejects.toThrow(
      'no canvas',
    )
    expect(src.closed).toBe(1)
  })
})

describe('offscreenCanvas2d', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stub = (getContext: () => unknown, transfer = true): void => {
    class Fake {
      getContext = getContext
    }
    if (transfer)
      Object.assign(Fake.prototype, {
        transferToImageBitmap: () => undefined,
      })
    vi.stubGlobal('OffscreenCanvas', Fake)
  }

  it('is false without OffscreenCanvas', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(offscreenCanvas2d()).toBe(false)
  })

  it('is false without transferToImageBitmap', () => {
    stub(() => ({}), false)
    expect(offscreenCanvas2d()).toBe(false)
  })

  it('is false when the 2D context is null or throws', () => {
    stub(() => null)
    expect(offscreenCanvas2d()).toBe(false)
    stub(() => {
      throw new Error('nope')
    })
    expect(offscreenCanvas2d()).toBe(false)
  })

  it('is true with a 2D context and transferToImageBitmap', () => {
    stub(() => ({}))
    expect(offscreenCanvas2d()).toBe(true)
  })
})

describe('offscreenEnv', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes OffscreenCanvases and hands out their bitmap without copying', async () => {
    const bitmap = { width: 3, height: 2 }
    class Fake {
      readonly width: number
      readonly height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      transferToImageBitmap = vi.fn(() => bitmap)
    }
    vi.stubGlobal('OffscreenCanvas', Fake)
    const e = offscreenEnv()
    const canvas = e.createCanvas(3, 2)
    expect(canvas).toBeInstanceOf(Fake)
    expect({ w: canvas.width, h: canvas.height }).toEqual({ w: 3, h: 2 })
    await expect(e.toBitmap(canvas)).resolves.toBe(bitmap)
  })
})
