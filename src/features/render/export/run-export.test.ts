import { describe, expect, it, vi } from 'vitest'
import { inspectPdf } from '../pdf/inspect'
import { tileRenderKey, type PxRect } from '../pixels/tile-plan'
import { fakeFactory } from '../test-support/fake-canvas'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { TINY_JPEG } from '../test-support/image-bytes'
import { ExportError, EXPORT_ERROR_KEYS, isAbortError, toExportError } from './errors'
import { runExport, type ExportDeps, type ExportProgress, type ExportWorkerApi } from './run-export'
import { createExportWorkerApi } from './worker-api'

/** A fake ImageBitmap: only close() and its size matter here. */
function fakeBitmap(w = 3000, h = 1500): ImageBitmap & { closed: boolean } {
  const bmp = {
    width: w,
    height: h,
    closed: false,
    close: () => {
      bmp.closed = true
    },
  }
  return bmp
}

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
const bitmaps = new Map([
  [id('a'), fakeBitmap()],
  [id('b'), fakeBitmap()],
])

describe('runExport', () => {
  it('produces a PDF with every page, encoding identical tiles once and closing every clone', async () => {
    const { deps, clones } = realWorkerDeps()
    const encodeSpy = vi.spyOn(deps.api, 'encodeTile')
    const bytes = await runExport(pages, (i) => bitmaps.get(i), {}, deps)
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
    await runExport(pages, (i) => bitmaps.get(i), { onProgress: (p) => seen.push(p) }, deps)
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
    await expect(
      runExport(pages, (i) => bitmaps.get(i), { signal: ctrl.signal }, deps),
    ).rejects.toSatisfy(isAbortError)
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
    const run = runExport(pages, (i) => bitmaps.get(i), { signal: ctrl.signal }, deps)
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
    await expect(
      runExport(pages, (i) => bitmaps.get(i), { signal: ctrl.signal }, deps),
    ).rejects.toSatisfy(isAbortError)
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
    await expect(runExport(pages, (i) => bitmaps.get(i), {}, deps)).rejects.toMatchObject({
      code: 'failed',
    })
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
