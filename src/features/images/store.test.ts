import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_EDITS, type ImageId } from '../../shared/model/image'
import type { DecodedImage } from './decode'
import { ImportFailure } from './errors'
import { createImagesStore, selectImageDescriptors, type ImagesDeps } from './store'

function decoded(
  over: Partial<DecodedImage> = {},
): DecodedImage & { bitmap: { close: ReturnType<typeof vi.fn> } } {
  return {
    bitmap: { width: 400, height: 300, close: vi.fn() },
    pxW: 400,
    pxH: 300,
    originalPxW: 400,
    originalPxH: 300,
    thumbUrl: 'blob:t',
    animatedGif: false,
    ...over,
  } as DecodedImage & { bitmap: { close: ReturnType<typeof vi.fn> } }
}

function setup(over: Partial<ImagesDeps> = {}) {
  let n = 0
  const revoked: string[] = []
  const deps: ImagesDeps = {
    decode: vi.fn((_b: Blob, name: string) =>
      Promise.resolve(decoded({ thumbUrl: `blob:${name}` })),
    ),
    fetchImage: vi.fn((url: string) =>
      Promise.resolve({ blob: new Blob(['x']), name: url.split('/').pop() ?? 'u.jpg' }),
    ),
    revokeObjectURL: (u) => {
      revoked.push(u)
    },
    newId: () => `id-${String(++n)}` as ImageId,
    ...over,
  }
  return { store: createImagesStore(deps), deps, revoked }
}

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('addFiles', () => {
  it('adds images, selects the first, and reports ok outcomes in input order', async () => {
    const { store } = setup()
    const out = await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    expect(out.map((o) => o.ok)).toEqual([true, true])
    expect(out.map((o) => (o.ok ? o.id : ''))).toEqual(['id-1', 'id-2'])
    const s = store.getState()
    expect(s.images.map((i) => i.name)).toEqual(['a.jpg', 'b.jpg'])
    expect(s.selectedId).toBe('id-1')
    expect(s.importing).toBe(0)
  })

  it('keeps input order even when a later file finishes first', async () => {
    const gates = [deferred<DecodedImage>(), deferred<DecodedImage>()]
    let i = 0
    const { store } = setup({
      decode: () => (gates[i++] as { promise: Promise<DecodedImage> }).promise,
    })
    const p = store.getState().addFiles([file('slow.jpg'), file('fast.jpg')])
    gates[1]?.resolve(decoded())
    await Promise.resolve()
    gates[0]?.resolve(decoded())
    await p
    expect(store.getState().images.map((x) => x.name)).toEqual(['slow.jpg', 'fast.jpg'])
  })

  it('a mixed drop still loads the good files and reports the bad one', async () => {
    const { store } = setup({
      decode: (_b, name) =>
        name.endsWith('.pdf')
          ? Promise.reject(new ImportFailure('unsupported-format'))
          : Promise.resolve(decoded()),
    })
    const out = await store.getState().addFiles([file('a.jpg'), file('notes.pdf'), file('b.jpg')])
    expect(out.map((o) => o.ok)).toEqual([true, false, true])
    expect(out[1]).toEqual({ ok: false, source: 'notes.pdf', error: 'unsupported-format' })
    expect(store.getState().images).toHaveLength(2)
  })

  it('counts importing while work is pending', async () => {
    const gate = deferred<DecodedImage>()
    const { store } = setup({ decode: () => gate.promise })
    const p = store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    expect(store.getState().importing).toBe(2)
    gate.resolve(decoded())
    await p
    expect(store.getState().importing).toBe(0)
  })

  it('decodes at most DECODE_CONCURRENCY (2) files at a time', async () => {
    let active = 0
    let peak = 0
    const { store } = setup({
      decode: async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 0))
        active--
        return decoded()
      },
    })
    await store.getState().addFiles(Array.from({ length: 10 }, (_, i) => file(`${String(i)}.jpg`)))
    expect(peak).toBe(2)
    expect(store.getState().images).toHaveLength(10)
  })

  it('surfaces the animated-GIF warning', async () => {
    const { store } = setup({ decode: () => Promise.resolve(decoded({ animatedGif: true })) })
    const [o] = await store.getState().addFiles([file('a.gif')])
    expect(o).toMatchObject({ ok: true, warnings: ['animated-gif'] })
  })

  it('keeps originalPxW/H separate from the downscaled size', async () => {
    const { store } = setup({
      decode: () =>
        Promise.resolve(decoded({ pxW: 5100, pxH: 3825, originalPxW: 8000, originalPxH: 6000 })),
    })
    await store.getState().addFiles([file('big.jpg')])
    expect(store.getState().images[0]).toMatchObject({ pxW: 5100, originalPxW: 8000 })
  })
})

describe('addFromClipboard', () => {
  it('reads the DataTransfer synchronously and names pasted images', async () => {
    const { store, deps } = setup()
    const files = [new File(['x'], 'image.png', { type: 'image/png' })]
    const dt = { files, items: [], getData: () => '' }
    const p = store.getState().addFromClipboard(dt as unknown as DataTransfer)
    files.length = 0 // the browser empties it as soon as the handler returns
    const out = await p
    expect(out).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.decode).toHaveBeenCalledWith(expect.anything(), 'pasted-image-1.png')
  })

  it('returns [] for non-image clipboard content', async () => {
    const { store } = setup()
    const dt = { files: [], items: [], getData: (f: string) => (f === 'text/plain' ? 'hello' : '') }
    expect(await store.getState().addFromClipboard(dt as unknown as DataTransfer)).toEqual([])
    expect(store.getState().images).toHaveLength(0)
  })

  it('imports pasted URLs through the fetcher', async () => {
    const { store, deps } = setup()
    const dt = {
      files: [],
      items: [],
      getData: (f: string) => (f === 'text/plain' ? 'https://a.com/x.jpg' : ''),
    }
    const out = await store.getState().addFromClipboard(dt as unknown as DataTransfer)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.fetchImage).toHaveBeenCalledWith('https://a.com/x.jpg')
    expect(out[0]?.ok).toBe(true)
  })
})

describe('addFromUrl', () => {
  it('returns the classified failure', async () => {
    const { store } = setup({ fetchImage: () => Promise.reject(new ImportFailure('cors')) })
    expect(await store.getState().addFromUrl('https://x.com/a.jpg')).toEqual({
      ok: false,
      source: 'https://x.com/a.jpg',
      error: 'cors',
    })
    expect(store.getState().images).toHaveLength(0)
  })
})

describe('remove / clear / select', () => {
  it('remove revokes the thumbnail, closes the bitmap and drops the selection', async () => {
    const { store, revoked } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const img = store.getState().images[0]
    store.getState().remove('id-1' as ImageId)
    expect(revoked).toEqual(['blob:a.jpg'])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(img?.bitmap.close as ReturnType<typeof vi.fn>).toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ images: [], selectedId: null })
  })

  it('clear disposes everything', async () => {
    const { store, revoked } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    store.getState().clear()
    expect(revoked).toEqual(['blob:a.jpg', 'blob:b.jpg'])
    expect(store.getState().images).toEqual([])
    expect(store.getState().selectedId).toBeNull()
  })

  it('an import still in flight when clear() runs is disposed and never added', async () => {
    const gate = deferred<ReturnType<typeof decoded>>()
    const { store, revoked } = setup({ decode: () => gate.promise })
    const p = store.getState().addFiles([file('late.jpg')])
    store.getState().clear()
    const late = decoded({ thumbUrl: 'blob:late' })
    gate.resolve(late)
    const out = await p
    expect(out).toEqual([])
    expect(store.getState().images).toHaveLength(0)
    expect(revoked).toContain('blob:late')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(late.bitmap.close).toHaveBeenCalled()
    expect(store.getState().importing).toBe(0)
  })

  it('select ignores unknown ids and accepts null', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    store.getState().select('id-2' as ImageId)
    expect(store.getState().selectedId).toBe('id-2')
    store.getState().select('nope' as ImageId)
    expect(store.getState().selectedId).toBe('id-2')
    store.getState().select(null)
    expect(store.getState().selectedId).toBeNull()
  })
})

describe('updateEdits', () => {
  it('clamps copies and fits the crop to the aspect', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    store.getState().updateEdits('id-1' as ImageId, { copies: 999, cropAspect: '1:1' })
    const { edits } = store.getState().images[0] ?? { edits: DEFAULT_EDITS }
    expect(edits.copies).toBe(50)
    expect(edits.crop).toEqual({ x: 50, y: 0, w: 300, h: 300 })
  })

  it('does not notify subscribers when nothing changed', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().updateEdits('id-1' as ImageId, { copies: 1 })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('selectImageDescriptors', () => {
  it('returns plain, bitmap-free descriptors and a stable reference until images change', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    const a = selectImageDescriptors(store.getState())
    expect(selectImageDescriptors(store.getState())).toBe(a)
    expect(Object.keys(a[0] ?? {}).sort()).toEqual(['edits', 'id', 'pxH', 'pxW'])
    store.getState().updateEdits('id-2' as ImageId, { copies: 3 })
    const b = selectImageDescriptors(store.getState())
    expect(b).not.toBe(a)
    expect(b[0]).toBe(a[0]) // unchanged image keeps its descriptor object
    expect(b[1]).not.toBe(a[1])
  })
})
