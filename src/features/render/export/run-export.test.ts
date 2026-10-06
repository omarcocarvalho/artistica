import { describe, expect, it, vi } from 'vitest'
import { inspectPdf } from '../pdf/inspect'
import { integerCropBox, planTilePixels, tileRenderKey, type PxRect } from '../pixels/tile-plan'
import { fakeFactory } from '../test-support/fake-canvas'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { TINY_JPEG } from '../test-support/image-bytes'
import { ExportError, EXPORT_ERROR_KEYS, isAbortError, toExportError } from './errors'
import type { ImageId } from '../../../shared/model/image'
import {
  runExport,
  type ExportDeps,
  type ExportProgress,
  type ExportSource,
  type ExportWorkerApi,
  type GetSource,
} from './run-export'
import { createExportWorkerApi } from './worker-api'

/** A fake ImageBitmap: only close() and its size matter here. */
function fakeBitmap(
  w = 3000,
  h = 1500,
  onClose = () => undefined,
): ImageBitmap & { closed: boolean } {
  const bmp = {
    width: w,
    height: h,
    closed: false,
    close: () => {
      if (!bmp.closed) onClose()
      bmp.closed = true
    },
  }
  return bmp
}

/** Sources whose decodes are recorded: which image, how many full bitmaps are alive at once. */
function fakeSources(
  sizes: Record<string, readonly [number, number]> = { a: [3000, 1500], b: [3000, 1500] },
  decodedScale = 1,
) {
  const decodes: string[] = []
  const decoded: (ImageBitmap & { closed: boolean })[] = []
  let alive = 0
  let maxAlive = 0
  const map = new Map<ImageId, ExportSource>(
    Object.entries(sizes).map(([name, [pxW, pxH]]) => [
      id(name),
      {
        pxW,
        pxH,
        decode: () => {
          decodes.push(name)
          alive += 1
          maxAlive = Math.max(maxAlive, alive)
          const b = fakeBitmap(pxW * decodedScale, pxH * decodedScale, () => {
            alive -= 1
          })
          decoded.push(b)
          return Promise.resolve(b)
        },
      },
    ]),
  )
  const get: GetSource = (i) => map.get(i)
  return { get, decodes, decoded, maxAlive: () => maxAlive }
}
const sources = (): GetSource => fakeSources().get

function realWorkerDeps(overrides: Partial<ExportDeps> = {}) {
  const clones: (ImageBitmap & { closed: boolean })[] = []
  const api = createExportWorkerApi({
    supported: () => true,
    createCanvas: fakeFactory(),
    encodeJpeg: () => Promise.resolve(TINY_JPEG),
  })
  const deps: ExportDeps = {
    api,
    cropBitmap: (_b, r: PxRect) => {
      const c = fakeBitmap(r.w, r.h)
      clones.push(c)
      return Promise.resolve(c)
    },
    transfer: (v) => v,
    ...overrides,
  }
  return { deps, clones }
}

const a = drawTile({ imageId: id('a') })
const aCopy = { ...a, trim: { ...a.trim, y: 100 } }
const b = drawTile({ imageId: id('b'), trim: { x: 20, y: 200, w: 60, h: 40 } })
const pages = [pageModel([a, aCopy]), pageModel([b], { index: 1 })]

describe('runExport', () => {
  it('produces a PDF with every page, encoding identical tiles once and closing every clone', async () => {
    const { deps, clones } = realWorkerDeps()
    const encodeSpy = vi.spyOn(deps.api, 'encodeTile')
    const bytes = await runExport(pages, sources(), {}, deps)
    const report = await inspectPdf(bytes)
    expect(report.pageCount).toBe(2)
    expect(report.imageCount).toBe(2)
    expect(encodeSpy).toHaveBeenCalledTimes(2)
    expect(encodeSpy.mock.calls[0]?.[0]).toBe(tileRenderKey(a))
    expect(encodeSpy.mock.calls[0]?.[1].src).toMatchObject({ x: 0, y: 0 }) // cropped clone
    expect(clones.every((c) => c.closed)).toBe(true)
  })

  it('reports monotonic progress ending at 1', async () => {
    const { deps } = realWorkerDeps()
    const seen: ExportProgress[] = []
    await runExport(pages, sources(), { onProgress: (p) => seen.push(p) }, deps)
    const fractions = seen.map((p) => p.fraction)
    expect(fractions).toEqual([...fractions].sort((x, y) => x - y))
    expect(fractions.at(-1)).toBe(1)
    expect(seen[0]).toEqual({ pageIndex: 0, pageCount: 2, fraction: 0 })
  })

  it('fails with missing-image when a bitmap is gone', async () => {
    const { deps } = realWorkerDeps()
    await expect(runExport(pages, () => undefined, {}, deps)).rejects.toMatchObject({
      code: 'missing-image',
    })
  })

  it('fails with empty when there are no pages', async () => {
    const { deps } = realWorkerDeps()
    await expect(runExport([], () => undefined, {}, deps)).rejects.toMatchObject({ code: 'empty' })
  })

  it('rejects with AbortError before starting when already aborted', async () => {
    const { deps } = realWorkerDeps()
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(runExport(pages, sources(), { signal: ctrl.signal }, deps)).rejects.toSatisfy(
      isAbortError,
    )
  })

  it('rejects with AbortError immediately even while a worker call hangs', async () => {
    const ctrl = new AbortController()
    const hanging: ExportWorkerApi = {
      init: () => Promise.resolve(),
      encodeTile: () => new Promise(() => undefined),
      addPage: () => Promise.resolve(),
      finish: () => Promise.resolve(new Uint8Array()),
    }
    const { deps } = realWorkerDeps({ api: hanging })
    const run = runExport(pages, sources(), { signal: ctrl.signal }, deps)
    await Promise.resolve()
    ctrl.abort()
    await expect(run).rejects.toSatisfy(isAbortError)
  })

  it('closes a clone that arrives after abort', async () => {
    const ctrl = new AbortController()
    const late = fakeBitmap()
    const { deps } = realWorkerDeps({
      cropBitmap: () => {
        ctrl.abort()
        return Promise.resolve(late)
      },
    })
    await expect(runExport(pages, sources(), { signal: ctrl.signal }, deps)).rejects.toSatisfy(
      isAbortError,
    )
    expect(late.closed).toBe(true)
  })

  it('fails when the worker crashes', async () => {
    const { deps } = realWorkerDeps({
      api: {
        init: () => new Promise(() => undefined),
        encodeTile: vi.fn(),
        addPage: vi.fn(),
        finish: vi.fn(),
      },
      crashed: Promise.reject(new ExportError('failed')),
    })
    await expect(runExport(pages, sources(), {}, deps)).rejects.toMatchObject({
      code: 'failed',
    })
  })
})

describe('runExport decodes on demand', () => {
  const c = drawTile({ imageId: id('c'), trim: { x: 20, y: 150, w: 60, h: 40 } })
  // a on pages 0 and 2, b on 1, c on 0 and 1: images interleave across pages.
  const spread = [
    pageModel([a, c]),
    pageModel([b, { ...c, trim: { ...c.trim, w: 30, h: 20 } }], { index: 1 }),
    pageModel([{ ...a, trim: { ...a.trim, w: 50, h: 25 } }], { index: 2 }),
  ]
  const three = { a: [3000, 1500], b: [3000, 1500], c: [3000, 1500] } as const

  it('decodes every image once, keeps one alive at a time and closes each', async () => {
    const { deps, clones } = realWorkerDeps()
    const src = fakeSources(three)
    const encodeSpy = vi.spyOn(deps.api, 'encodeTile')
    const bytes = await runExport(spread, src.get, {}, deps)
    expect(src.decodes).toEqual(['a', 'c', 'b'])
    expect(src.maxAlive()).toBe(1)
    expect(src.decoded.every((d) => d.closed)).toBe(true)
    expect(clones.every((cl) => cl.closed)).toBe(true)
    expect(encodeSpy).toHaveBeenCalledTimes(5)
    expect((await inspectPdf(bytes)).pageCount).toBe(3)
  })

  it('encodes every tile of an image while that image is decoded', async () => {
    const order: string[] = []
    const src = fakeSources(three)
    const { deps } = realWorkerDeps()
    const encode = deps.api.encodeTile.bind(deps.api)
    const api: ExportWorkerApi = {
      ...deps.api,
      encodeTile: (key, plan, bmp) => {
        order.push(`${key.split('|')[0] ?? ''}:${String(src.decoded.at(-1)?.closed)}`)
        return encode(key, plan, bmp)
      },
    }
    await runExport(spread, src.get, {}, { ...deps, api })
    expect(order).toEqual(['a:false', 'a:false', 'c:false', 'c:false', 'b:false'])
  })

  it('crops the matching region when the decode is not the planned size', async () => {
    const tile = drawTile({ imageId: id('a'), crop: { x: 100, y: 50, w: 1000, h: 500 } })
    const src = fakeSources({ a: [3000, 1500] }, 0.5)
    const { deps } = realWorkerDeps()
    const cropSpy = vi.spyOn(deps, 'cropBitmap')
    const encodeSpy = vi.spyOn(deps.api, 'encodeTile')
    await runExport([pageModel([tile])], src.get, {}, deps)
    expect(cropSpy.mock.calls[0]?.[1]).toEqual({ x: 50, y: 25, w: 500, h: 250 })
    expect(encodeSpy.mock.calls[0]?.[0]).toBe(tileRenderKey(tile))
    expect(encodeSpy.mock.calls[0]?.[1].src).toEqual({ x: 0, y: 0, w: 500, h: 250 })
  })

  it('fails with missing-image when an image is removed during the export', async () => {
    const src = fakeSources(three)
    let removed = false
    const get: GetSource = (i) => (removed && i === id('b') ? undefined : src.get(i))
    const { deps } = realWorkerDeps()
    const run = runExport(spread, get, { onProgress: () => (removed = true) }, deps)
    await expect(run).rejects.toMatchObject({ code: 'missing-image' })
    expect(src.decoded.every((d) => d.closed)).toBe(true)
  })

  it('closes the decoded image when encoding fails', async () => {
    const src = fakeSources()
    const { deps } = realWorkerDeps({
      api: {
        init: () => Promise.resolve(),
        encodeTile: () => Promise.reject(new Error('boom')),
        addPage: () => Promise.resolve(),
        finish: () => Promise.resolve(new Uint8Array()),
      },
    })
    await expect(runExport(pages, src.get, {}, deps)).rejects.toThrow('boom')
    expect(src.decoded).toHaveLength(1)
    expect(src.decoded[0]?.closed).toBe(true)
  })

  it('closes the decoded image when the export is aborted between its tiles', async () => {
    const ctrl = new AbortController()
    const src = fakeSources()
    const { deps } = realWorkerDeps()
    const encode = deps.api.encodeTile.bind(deps.api)
    const api: ExportWorkerApi = {
      ...deps.api,
      encodeTile: async (...args) => {
        await encode(...args)
        ctrl.abort()
      },
    }
    await expect(
      runExport(pages, src.get, { signal: ctrl.signal }, { ...deps, api }),
    ).rejects.toSatisfy(isAbortError)
    expect(src.decodes).toEqual(['a'])
    expect(src.decoded[0]?.closed).toBe(true)
  })

  it('rejects at once on abort during a decode and closes the decode when it lands', async () => {
    const ctrl = new AbortController()
    const late = fakeBitmap()
    let land: (b: ImageBitmap) => void = () => undefined
    const get: GetSource = () => ({
      pxW: 3000,
      pxH: 1500,
      decode: () =>
        new Promise<ImageBitmap>((resolve) => {
          land = resolve
          ctrl.abort()
        }),
    })
    const { deps } = realWorkerDeps()
    await expect(runExport(pages, get, { signal: ctrl.signal }, deps)).rejects.toSatisfy(
      isAbortError,
    )
    expect(late.closed).toBe(false)
    land(late)
    await Promise.resolve()
    await Promise.resolve()
    expect(late.closed).toBe(true)
  })

  it('reports a failed decode as a failure', async () => {
    const get: GetSource = () => ({
      pxW: 3000,
      pxH: 1500,
      decode: () => Promise.reject(new DOMException('gone', 'NotReadableError')),
    })
    const { deps } = realWorkerDeps()
    await expect(runExport(pages, get, {}, deps)).rejects.toThrow('gone')
  })
})

describe('runExport fractional crop (ruling D-1)', () => {
  const crop = { x: 10.4, y: 20.7, w: 1000.3, h: 500.2 }
  const tile = drawTile({ imageId: id('a'), crop })
  const fracPages = [pageModel([tile])]

  it('crops the integer box, keys by the original plan and renders the cropped plan', async () => {
    const { deps } = realWorkerDeps()
    const cropSpy = vi.spyOn(deps, 'cropBitmap')
    const encodeSpy = vi.spyOn(deps.api, 'encodeTile')
    const bytes = await runExport(fracPages, sources(), {}, deps)
    expect((await inspectPdf(bytes)).imageCount).toBe(1)
    expect(cropSpy.mock.calls[0]?.[1]).toEqual(integerCropBox(crop))
    const [key, plan] = encodeSpy.mock.calls[0] ?? []
    expect(key).toBe(tileRenderKey(tile))
    expect(key).toBe(tileRenderKey(tile, planTilePixels(tile)))
    expect(plan?.src.x).toBeCloseTo(crop.x - Math.floor(crop.x), 9)
    expect(plan?.src.y).toBeCloseTo(crop.y - Math.floor(crop.y), 9)
    expect(plan?.src.w).toBe(planTilePixels(tile).src.w)
    expect(plan?.src.h).toBe(planTilePixels(tile).src.h)
  })

  it('rethrows other crop failures and closes the clone when posting fails', async () => {
    const { deps: d1 } = realWorkerDeps({ cropBitmap: () => Promise.reject(new Error('x')) })
    await expect(runExport(fracPages, sources(), {}, d1)).rejects.toThrow('x')
    const { deps, clones } = realWorkerDeps({
      transfer: () => {
        throw new DOMException('nope', 'DataCloneError')
      },
    })
    await expect(runExport(fracPages, sources(), {}, deps)).rejects.toThrow('nope')
    expect(clones.every((c) => c.closed)).toBe(true)
  })
})

describe('runExport abort reasons (CCR-D5)', () => {
  it('normalises a string reason before start', async () => {
    const { deps } = realWorkerDeps()
    const ctrl = new AbortController()
    ctrl.abort('user')
    const err = await runExport(pages, sources(), { signal: ctrl.signal }, deps).catch(
      (e: unknown) => e,
    )
    expect(isAbortError(err)).toBe(true)
  })
  it('normalises a string reason between tiles and keeps a native AbortError reason', async () => {
    const ctrl = new AbortController()
    const { deps } = realWorkerDeps()
    const out = runExport(
      pages,
      sources(),
      {
        signal: ctrl.signal,
        onProgress: () => {
          ctrl.abort('user')
        },
      },
      deps,
    ).catch((e: unknown) => e)
    expect(isAbortError(await out)).toBe(true)
    const native = new DOMException('mine', 'AbortError')
    const c2 = new AbortController()
    c2.abort(native)
    const { deps: d2 } = realWorkerDeps()
    await expect(runExport(pages, sources(), { signal: c2.signal }, d2)).rejects.toBe(native)
  })
})

describe('runExport progress with a trailing empty page', () => {
  it('still reaches 1, only after finish', async () => {
    const { deps } = realWorkerDeps()
    const seen: number[] = []
    await runExport(
      [pageModel([a]), pageModel([], { index: 1 })],
      sources(),
      { onProgress: (p) => seen.push(p.fraction) },
      deps,
    )
    expect(seen.at(-1)).toBe(1)
    expect(seen.slice(0, -1).every((f) => f < 1)).toBe(true)
  })
})

describe('createExportWorkerApi', () => {
  it('rejects init with export:unsupported when OffscreenCanvas is missing', async () => {
    const api = createExportWorkerApi({
      supported: () => false,
      createCanvas: fakeFactory(),
      encodeJpeg: vi.fn(),
    })
    await expect(api.init()).rejects.toThrow('export:unsupported')
  })

  it('closes the bitmap even when encoding fails', async () => {
    const api = createExportWorkerApi({
      supported: () => true,
      createCanvas: fakeFactory(),
      encodeJpeg: () => Promise.reject(new Error('boom')),
    })
    await api.init()
    const bmp = fakeBitmap(10, 10)
    await expect(
      api.encodeTile('k', { ...planOf(), src: { x: 0, y: 0, w: 10, h: 10 } }, bmp),
    ).rejects.toThrow('boom')
    expect(bmp.closed).toBe(true)
  })

  it('refuses work before init', async () => {
    const api = createExportWorkerApi({
      supported: () => true,
      createCanvas: fakeFactory(),
      encodeJpeg: vi.fn(),
    })
    await expect(api.finish()).rejects.toThrow('export:failed')
  })
})

describe('toExportError', () => {
  it('recovers the code from a Comlink-flattened worker error', () => {
    expect(toExportError(new Error('export:unsupported')).code).toBe('unsupported')
    expect(toExportError(new Error('export:missing-image (a|0,0)')).code).toBe('missing-image')
  })
  it('passes ExportErrors through and maps the rest to failed', () => {
    const e = new ExportError('empty')
    expect(toExportError(e)).toBe(e)
    expect(toExportError(new Error('QuotaExceeded')).code).toBe('failed')
    expect(toExportError('weird').code).toBe('failed')
  })
  it('has an i18n key for every code', () => {
    expect(Object.keys(EXPORT_ERROR_KEYS).sort()).toEqual([
      'empty',
      'failed',
      'missing-image',
      'unsupported',
    ])
  })
})

function planOf() {
  return {
    src: { x: 0, y: 0, w: 10, h: 10 },
    scaledW: 10,
    scaledH: 10,
    outW: 10,
    outH: 10,
    bleedPx: 0,
    canvasW: 10,
    canvasH: 10,
    matrix: [1, 0, 0, 1, 0, 0] as const,
    dpi: 300,
  }
}
