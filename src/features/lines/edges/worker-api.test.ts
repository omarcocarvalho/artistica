import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { edgeOutline } from './outline'
import { bitmapOf, fakePixelCanvas, type FakePixelCanvas } from './test-support/fakes'
import { stillLife } from './test-support/synthetic'
import {
  createEdgeWorkerApi,
  edgeCanvas2d,
  offscreenEnv,
  packOutline,
  unpackOutline,
  type EdgeCanvasEnv,
  type PixelCtx,
} from './worker-api'

const scene = stillLife()

function env(
  overrides: Partial<EdgeCanvasEnv> = {},
  ctx: Partial<PixelCtx> & { noContext?: boolean } = {},
) {
  const made: FakePixelCanvas[] = []
  const e: EdgeCanvasEnv = {
    supported: () => true,
    createCanvas: (w, h) => {
      const c = fakePixelCanvas(w, h, ctx)
      made.push(c)
      return c
    },
    ...overrides,
  }
  return { e, made }
}

const load = () => Promise.resolve(edgeOutline)

describe('createEdgeWorkerApi', () => {
  it('init rejects with "edges:unsupported" when the env has no OffscreenCanvas 2D', async () => {
    const { e } = env({ supported: () => false })
    await expect(createEdgeWorkerApi(e, load).init()).rejects.toThrow('edges:unsupported')
  })

  it('init resolves when the env can read pixels', async () => {
    const { e } = env()
    await expect(createEdgeWorkerApi(e, load).init()).resolves.toBeUndefined()
  })

  it("outline draws the bitmap to a canvas of the bitmap's size, reads its pixels and returns edgeOutline's result", async () => {
    const { e, made } = env()
    const bitmap = bitmapOf(scene.rgba, scene.w, scene.h)
    const packed = await createEdgeWorkerApi(e, load).outline(bitmap, 73)
    expect(made).toHaveLength(1)
    expect(made[0]?.created).toEqual({ w: scene.w, h: scene.h })
    expect(made[0]?.drawn).toEqual([{ image: bitmap, dx: 0, dy: 0 }])
    expect(made[0]?.reads).toEqual([[0, 0, scene.w, scene.h]])
    expect(made[0]?.settings).toEqual([{ willReadFrequently: true }])
    const expected = edgeOutline(scene.rgba, scene.w, scene.h, 73)
    expect(expected.length).toBeGreaterThan(0)
    expect(unpackOutline(packed)).toEqual(expected)
  })

  it('passes the detail through', async () => {
    const { e } = env()
    const api = createEdgeWorkerApi(e, load)
    const at = async (d: number) =>
      unpackOutline(await api.outline(bitmapOf(scene.rgba, scene.w, scene.h), d))
    const low = await at(25)
    const high = await at(75)
    expect(low).toEqual(edgeOutline(scene.rgba, scene.w, scene.h, 25))
    expect(high).toEqual(edgeOutline(scene.rgba, scene.w, scene.h, 75))
    expect(low).not.toEqual(high)
  })

  it('closes the bitmap and releases the canvas on success', async () => {
    const { e, made } = env()
    const bitmap = bitmapOf(scene.rgba, scene.w, scene.h)
    await createEdgeWorkerApi(e, load).outline(bitmap, 50)
    expect(bitmap.closed).toBe(1)
    expect(made.map((c) => [c.width, c.height])).toEqual([[0, 0]])
  })

  it('closes the bitmap before the edge core runs', async () => {
    const { e } = env()
    const bitmap = bitmapOf(scene.rgba, scene.w, scene.h)
    const closedWhenRun: number[] = []
    const spy = (rgba: Uint8ClampedArray, w: number, h: number, d: number) => {
      closedWhenRun.push(bitmap.closed)
      return edgeOutline(rgba, w, h, d)
    }
    await createEdgeWorkerApi(e, () => Promise.resolve(spy)).outline(bitmap, 50)
    expect(closedWhenRun).toEqual([1])
  })

  it.each([
    [
      'the edge core cannot load',
      () => env(),
      () => Promise.reject(new Error('chunk failed')),
      'chunk failed',
    ],
    ['the canvas has no 2D context', () => env({}, { noContext: true }), load, 'edges:unsupported'],
    [
      'reading the pixels fails',
      () =>
        env(
          {},
          {
            getImageData: () => {
              throw new Error('tainted')
            },
          },
        ),
      load,
      'tainted',
    ],
    [
      'the canvas cannot be made',
      () =>
        env({
          createCanvas: () => {
            throw new Error('no canvas')
          },
        }),
      load,
      'no canvas',
    ],
    [
      'the edge core throws',
      () => env(),
      () =>
        Promise.resolve(() => {
          throw new Error('core failed')
        }),
      'core failed',
    ],
  ] as const)('closes the bitmap and releases the canvas when %s', async (_, make, loader, msg) => {
    const { e, made } = make()
    const bitmap = bitmapOf(scene.rgba, scene.w, scene.h)
    await expect(createEdgeWorkerApi(e, loader).outline(bitmap, 50)).rejects.toThrow(msg)
    expect(bitmap.closed).toBe(1)
    expect(made.every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })
})

describe('packOutline / unpackOutline', () => {
  const point = fc.record({
    x: fc.double({ noNaN: true, min: 0, max: 1 }),
    y: fc.double({ noNaN: true, min: 0, max: 1 }),
  })

  it('round-trips any outline exactly', () => {
    fc.assert(
      fc.property(fc.array(fc.array(point, { maxLength: 8 }), { maxLength: 6 }), (lines) => {
        expect(unpackOutline(packOutline(lines))).toEqual(lines)
      }),
    )
  })

  it('packs into two flat typed arrays', () => {
    const packed = packOutline([
      [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
      [],
      [{ x: 0.5, y: 0.6 }],
    ])
    expect(Array.from(packed.coords)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    expect(packed.coords).toBeInstanceOf(Float64Array)
    expect(Array.from(packed.lengths)).toEqual([2, 0, 1])
    expect(packed.lengths).toBeInstanceOf(Uint32Array)
  })
})

describe('edgeCanvas2d', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stub = (getContext: () => unknown): void => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext = getContext
      },
    )
  }

  it('is false without OffscreenCanvas', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(edgeCanvas2d()).toBe(false)
  })

  it('is false when the 2D context is null or throws', () => {
    stub(() => null)
    expect(edgeCanvas2d()).toBe(false)
    stub(() => {
      throw new Error('nope')
    })
    expect(edgeCanvas2d()).toBe(false)
  })

  it('is true with a 2D context', () => {
    stub(() => ({}))
    expect(edgeCanvas2d()).toBe(true)
  })
})

describe('canvas envs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offscreenEnv makes OffscreenCanvases of the asked size', () => {
    class Fake {
      readonly width: number
      readonly height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      getContext = () => ({})
    }
    vi.stubGlobal('OffscreenCanvas', Fake)
    const e = offscreenEnv()
    const canvas = e.createCanvas(3, 2)
    expect(canvas).toBeInstanceOf(Fake)
    expect({ w: canvas.width, h: canvas.height }).toEqual({ w: 3, h: 2 })
    expect(e.supported()).toBe(true)
  })
})
