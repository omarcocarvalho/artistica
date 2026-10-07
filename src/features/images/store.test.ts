import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_EDITS, type ImageId } from '../../shared/model/image'
import {
  DEFAULT_STUDY,
  patchStudy,
  withVersion,
  type StudySettings,
} from '../../shared/model/study'
import { DEFAULT_LINES, linesKey, patchLines } from '../../shared/model/lines'
import type { DecodedImage } from './decode'
import { sha256Hex } from './content-hash'
import { ImportFailure } from './errors'
import { createImagesStore, selectImageDescriptors, type ImagesDeps } from './store'
import { makeLoadedImage } from './test-utils'

function decoded(
  over: Partial<DecodedImage> = {},
): DecodedImage & { preview: { close: ReturnType<typeof vi.fn> } } {
  return {
    preview: { width: 400, height: 300, close: vi.fn() },
    source: new Blob(['source']),
    pxW: 400,
    pxH: 300,
    originalPxW: 400,
    originalPxH: 300,
    thumbUrl: 'blob:t',
    animatedGif: false,
    ...over,
  } as DecodedImage & { preview: { close: ReturnType<typeof vi.fn> } }
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
    hash: vi.fn((b: Blob) => Promise.resolve(`size-${String(b.size)}`)),
    ...over,
  }
  return { store: createImagesStore(deps), deps, revoked }
}

const file = (name: string, bytes = 'x') => new File([bytes], name, { type: 'image/jpeg' })
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
    expect(out?.map((o) => o.ok)).toEqual([true, true])
    expect(out?.map((o) => (o.ok ? o.id : ''))).toEqual(['id-1', 'id-2'])
    const s = store.getState()
    expect(s.images.map((i) => i.name)).toEqual(['a.jpg', 'b.jpg'])
    expect(s.selectedId).toBe('id-1')
    expect(s.importing).toBe(0)
  })

  it('gives every new image the default study (Original only)', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    expect(store.getState().images[0]?.study).toEqual(DEFAULT_STUDY)
  })

  it('gives every new image no composition lines', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const lines = store.getState().images[0]?.lines
    expect(lines).toEqual(DEFAULT_LINES)
    expect(lines && linesKey(lines)).toBe('-')
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
    const out = await p
    const s = store.getState()
    expect(s.images.map((x) => x.name)).toEqual(['slow.jpg', 'fast.jpg'])
    expect(out?.map((o) => (o.ok ? o.id : ''))).toEqual(['id-1', 'id-2'])
    expect(s.images.map((x) => x.id)).toEqual(['id-1', 'id-2'])
    expect(s.selectedId).toBe('id-1')
  })

  it('keeps a selection the user made while a batch is still importing', async () => {
    const gates = [deferred<DecodedImage>(), deferred<DecodedImage>()]
    let i = 0
    const { store } = setup({
      decode: () => (gates[i++] as { promise: Promise<DecodedImage> }).promise,
    })
    const p = store.getState().addFiles([file('slow.jpg'), file('fast.jpg')])
    gates[1]?.resolve(decoded())
    await vi.waitFor(() => {
      expect(store.getState().images).toHaveLength(1)
    })
    store.getState().select('id-2' as ImageId)
    gates[0]?.resolve(decoded())
    await p
    expect(store.getState().selectedId).toBe('id-2')
  })

  it('a mixed drop still loads the good files and reports the bad one', async () => {
    const { store } = setup({
      decode: (_b, name) =>
        name.endsWith('.pdf')
          ? Promise.reject(new ImportFailure('unsupported-format'))
          : Promise.resolve(decoded()),
    })
    const out = await store.getState().addFiles([file('a.jpg'), file('notes.pdf'), file('b.jpg')])
    expect(out?.map((o) => o.ok)).toEqual([true, false, true])
    expect(out?.[1]).toEqual({ ok: false, source: 'notes.pdf', error: 'unsupported-format' })
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
    const out = await store.getState().addFiles([file('a.gif')])
    expect(out?.[0]).toMatchObject({ ok: true, warnings: ['animated-gif'] })
  })

  it('keeps originalPxW/H separate from the downscaled size', async () => {
    const { store } = setup({
      decode: () =>
        Promise.resolve(decoded({ pxW: 5100, pxH: 3825, originalPxW: 8000, originalPxH: 6000 })),
    })
    await store.getState().addFiles([file('big.jpg')])
    expect(store.getState().images[0]).toMatchObject({ pxW: 5100, originalPxW: 8000 })
  })

  it('keeps the decoder’s preview bitmap and compressed source, not a full-size bitmap', async () => {
    const d = decoded({ pxW: 5100, pxH: 3825 })
    const { store } = setup({ decode: () => Promise.resolve(d) })
    await store.getState().addFiles([file('big.jpg')])
    const img = store.getState().images[0]
    expect(img?.preview).toBe(d.preview)
    expect(img?.source).toBe(d.source)
    expect(img).not.toHaveProperty('bitmap')
  })
})

describe('content hash', () => {
  it('hashes the source bytes: same bytes, same hash; different bytes, different hash', async () => {
    const { store } = setup({ hash: sha256Hex })
    await store
      .getState()
      .addFiles([file('a.jpg', 'one'), file('b.jpg', 'two'), file('c.jpg', 'one')])
    const [a, b, c] = store.getState().images
    expect(a?.contentHash).toBe(await sha256Hex(new Blob(['one'])))
    expect(c?.contentHash).toBe(a?.contentHash)
    expect(b?.contentHash).not.toBe(a?.contentHash)
    expect(c?.id).not.toBe(a?.id)
  })

  it('hashes the fetched blob for a URL import', async () => {
    const blob = new Blob(['remote'])
    const { store, deps } = setup({
      fetchImage: () => Promise.resolve({ blob, name: 'r.jpg' }),
      hash: vi.fn(sha256Hex),
    })
    await store.getState().addFromUrl('https://x.com/r.jpg')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.hash).toHaveBeenCalledWith(blob)
    expect(store.getState().images[0]?.contentHash).toBe(await sha256Hex(blob))
  })

  it('a hashing failure fails that import and disposes the decoded image', async () => {
    const d = decoded({ thumbUrl: 'blob:h' })
    const { store, revoked } = setup({
      decode: () => Promise.resolve(d),
      hash: () => Promise.reject(new Error('no subtle crypto')),
    })
    const out = await store.getState().addFiles([file('a.jpg')])
    expect(out?.[0]).toEqual({ ok: false, source: 'a.jpg', error: 'decode-failed' })
    expect(store.getState().images).toHaveLength(0)
    expect(revoked).toContain('blob:h')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(d.preview.close).toHaveBeenCalled()
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
    expect(deps.fetchImage).toHaveBeenCalledWith('https://a.com/x.jpg', expect.any(AbortSignal))
    expect(out?.[0]?.ok).toBe(true)
  })
})

describe('addFromDrop', () => {
  it('reads the DataTransfer synchronously and keeps the dropped file names', async () => {
    const { store, deps } = setup({
      decode: vi.fn((_b: Blob, name: string) =>
        name.endsWith('.pdf')
          ? Promise.reject(new ImportFailure('unsupported-format'))
          : Promise.resolve(decoded({ thumbUrl: `blob:${name}` })),
      ),
    })
    const files = [file('photo.jpg'), new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })]
    const dt = { files, items: [], getData: () => '' }
    const p = store.getState().addFromDrop(dt as unknown as DataTransfer)
    files.length = 0
    const out = await p
    expect(out).toEqual([
      { ok: true, id: 'id-1' },
      { ok: false, source: 'notes.pdf', error: 'unsupported-format' },
    ])
    expect(store.getState().images.map((i) => i.name)).toEqual(['photo.jpg'])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(deps.decode).mock.calls.map(([, name]) => name)).toEqual([
      'photo.jpg',
      'notes.pdf',
    ])
  })

  it('does not use up a pasted-image number', async () => {
    const { store } = setup()
    await store.getState().addFromDrop({
      files: [file('photo.jpg')],
      items: [],
      getData: () => '',
    } as unknown as DataTransfer)
    await store.getState().addFromClipboard({
      files: [new File(['x'], 'image.png', { type: 'image/png' })],
      items: [],
      getData: () => '',
    } as unknown as DataTransfer)
    expect(store.getState().images.map((i) => i.name)).toEqual(['photo.jpg', 'pasted-image-1.png'])
  })

  it('imports dropped links through the fetcher', async () => {
    const { store, deps } = setup()
    const dt = {
      files: [],
      items: [],
      getData: (f: string) => (f === 'text/uri-list' ? 'https://a.com/x.jpg' : ''),
    }
    const out = await store.getState().addFromDrop(dt as unknown as DataTransfer)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.fetchImage).toHaveBeenCalledWith('https://a.com/x.jpg', expect.any(AbortSignal))
    expect(out?.[0]?.ok).toBe(true)
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
  it('remove revokes the thumbnail, closes the preview and drops the selection', async () => {
    const { store, revoked } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const img = store.getState().images[0]
    store.getState().remove('id-1' as ImageId)
    expect(revoked).toEqual(['blob:a.jpg'])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(img?.preview.close as ReturnType<typeof vi.fn>).toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ images: [], selectedId: null })
  })

  describe('the selection after removing the selected image (owner M2-4)', () => {
    async function three() {
      const { store } = setup()
      await store.getState().addFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')])
      return store
    }
    const ids = (store: Awaited<ReturnType<typeof three>>) =>
      store.getState().images.map((i) => i.id)

    it('moves to the next image when a middle one is removed', async () => {
      const store = await three()
      store.getState().select('id-2' as ImageId)
      store.getState().remove('id-2' as ImageId)
      expect(ids(store)).toEqual(['id-1', 'id-3'])
      expect(store.getState().selectedId).toBe('id-3')
    })

    it('moves to the next image when the first one is removed', async () => {
      const store = await three()
      store.getState().select('id-1' as ImageId)
      store.getState().remove('id-1' as ImageId)
      expect(store.getState().selectedId).toBe('id-2')
    })

    it('moves to the previous image when the last one is removed', async () => {
      const store = await three()
      store.getState().select('id-3' as ImageId)
      store.getState().remove('id-3' as ImageId)
      expect(store.getState().selectedId).toBe('id-2')
    })

    it('selects nothing once the only image is removed', async () => {
      const { store } = setup()
      await store.getState().addFiles([file('a.jpg')])
      store.getState().remove('id-1' as ImageId)
      expect(store.getState().selectedId).toBeNull()
    })

    it('keeps the selection when another image is removed', async () => {
      const store = await three()
      store.getState().select('id-1' as ImageId)
      store.getState().remove('id-2' as ImageId)
      expect(store.getState().selectedId).toBe('id-1')
      store.getState().remove('id-3' as ImageId)
      expect(store.getState().selectedId).toBe('id-1')
    })

    it('still hands the selection to an earlier photo that finishes importing later', async () => {
      const gates = [deferred<DecodedImage>(), deferred<DecodedImage>(), deferred<DecodedImage>()]
      let i = 0
      const { store } = setup({
        decode: () => (gates[i++] as { promise: Promise<DecodedImage> }).promise,
      })
      const p = store.getState().addFiles([file('slow.jpg'), file('b.jpg'), file('c.jpg')])
      gates[1]?.resolve(decoded())
      gates[2]?.resolve(decoded())
      await vi.waitFor(() => {
        expect(store.getState().images).toHaveLength(2)
      })
      expect(store.getState().selectedId).toBe('id-2')
      store.getState().remove('id-2' as ImageId)
      expect(store.getState().selectedId).toBe('id-3')
      gates[0]?.resolve(decoded())
      await p
      expect(store.getState().selectedId).toBe('id-1')
    })

    it('keeps the next image selected when the removed one was chosen by the user, even if an earlier photo finishes importing later', async () => {
      const gates = [deferred<DecodedImage>(), deferred<DecodedImage>(), deferred<DecodedImage>()]
      let i = 0
      const { store } = setup({
        decode: () => (gates[i++] as { promise: Promise<DecodedImage> }).promise,
      })
      const p = store.getState().addFiles([file('slow.jpg'), file('b.jpg'), file('c.jpg')])
      gates[1]?.resolve(decoded())
      gates[2]?.resolve(decoded())
      await vi.waitFor(() => {
        expect(store.getState().images).toHaveLength(2)
      })
      store.getState().select('id-2' as ImageId)
      store.getState().remove('id-2' as ImageId)
      expect(store.getState().selectedId).toBe('id-3')
      gates[0]?.resolve(decoded())
      await p
      expect(store.getState().images).toHaveLength(2)
      expect(store.getState().selectedId).toBe('id-3')
    })

    it('keeps nothing selected when nothing was', async () => {
      const store = await three()
      store.getState().select(null)
      store.getState().remove('id-2' as ImageId)
      expect(store.getState().selectedId).toBeNull()
    })
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
    const decode = vi.fn(() => gate.promise)
    const { store, revoked } = setup({ decode })
    const p = store.getState().addFiles([file('late.jpg')])
    await vi.waitFor(() => {
      expect(decode).toHaveBeenCalled()
    })
    store.getState().clear()
    const late = decoded({ thumbUrl: 'blob:late' })
    gate.resolve(late)
    const out = await p
    expect(out).toBeNull()
    expect(store.getState().images).toHaveLength(0)
    expect(revoked).toContain('blob:late')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(late.preview.close).toHaveBeenCalled()
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

describe('imports cut short by clear()', () => {
  it('a decode failure after clear() is reported as discarded, not as an error', async () => {
    let calls = 0
    const gate = deferred<DecodedImage>()
    const { store } = setup({
      decode: () => (calls++ === 0 ? Promise.resolve(decoded()) : gate.promise),
    })
    await store.getState().addFiles([file('kept.jpg')])
    const p = store.getState().addFiles([file('late.jpg')])
    await vi.waitFor(() => {
      expect(calls).toBe(2)
    })
    store.getState().clear()
    gate.reject(new ImportFailure('decode-failed'))
    expect(await p).toBeNull()
    expect(store.getState().importing).toBe(0)
  })

  it('a URL fetch failure after clear() is reported as discarded', async () => {
    const gate = deferred<{ blob: Blob; name: string }>()
    const { store } = setup({ fetchImage: () => gate.promise })
    await store.getState().addFiles([file('kept.jpg')])
    const p = store.getState().addFromUrl('https://x.com/a.jpg')
    store.getState().clear()
    gate.reject(new ImportFailure('cors'))
    expect(await p).toBeNull()
  })

  it('a URL import that succeeds after clear() is discarded, never a fabricated failure', async () => {
    const gate = deferred<{ blob: Blob; name: string }>()
    const { store } = setup({ fetchImage: () => gate.promise })
    await store.getState().addFiles([file('kept.jpg')])
    const p = store.getState().addFromUrl('https://x.com/a.jpg')
    store.getState().clear()
    gate.resolve({ blob: new Blob(['x']), name: 'a.jpg' })
    expect(await p).toBeNull()
    expect(store.getState().images).toHaveLength(0)
  })

  it('a drop discarded by clear() is reported as discarded, not as "no image"', async () => {
    let calls = 0
    const gate = deferred<DecodedImage>()
    const { store } = setup({
      decode: () => (calls++ === 0 ? Promise.resolve(decoded()) : gate.promise),
    })
    await store.getState().addFiles([file('kept.jpg')])
    const p = store.getState().addFromDrop({
      files: [file('late.jpg')],
      items: [],
      getData: () => '',
    } as unknown as DataTransfer)
    await vi.waitFor(() => {
      expect(calls).toBe(2)
    })
    store.getState().clear()
    gate.resolve(decoded())
    expect(await p).toBeNull()
  })

  it('a batch that only partly finished before clear() reports nothing', async () => {
    const gate = deferred<DecodedImage>()
    const { store } = setup({
      decode: (_b, name) =>
        name === 'bad.jpg' ? Promise.reject(new ImportFailure('decode-failed')) : gate.promise,
    })
    const p = store.getState().addFiles([file('bad.jpg'), file('late.jpg')])
    await vi.waitFor(() => {
      expect(store.getState().importing).toBe(1)
    })
    store.getState().clear()
    gate.resolve(decoded())
    expect(await p).toBeNull()
  })

  it('clear() aborts the signal of in-flight downloads', async () => {
    const signals: AbortSignal[] = []
    const { store } = setup({
      fetchImage: (_url, signal) => {
        signals.push(signal)
        return new Promise(() => undefined)
      },
    })
    void store.getState().addFromUrl('https://x.com/a.jpg')
    await vi.waitFor(() => {
      expect(signals).toHaveLength(1)
    })
    expect(signals[0]?.aborted).toBe(false)
    store.getState().clear()
    expect(signals[0]?.aborted).toBe(true)
    void store.getState().addFromUrl('https://x.com/b.jpg')
    await vi.waitFor(() => {
      expect(signals).toHaveLength(2)
    })
    expect(signals[1]?.aborted).toBe(false)
  })

  it('importing drops to 0 at clear() and discarded jobs never push it below the live count', async () => {
    const gates = [deferred<DecodedImage>(), deferred<DecodedImage>()]
    let i = 0
    const { store } = setup({
      decode: () => (gates[i++] as { promise: Promise<DecodedImage> }).promise,
    })
    const old = store.getState().addFiles([file('old.jpg')])
    expect(store.getState().importing).toBe(1)
    await vi.waitFor(() => {
      expect(i).toBe(1)
    })
    store.getState().clear()
    expect(store.getState().importing).toBe(0)
    const fresh = store.getState().addFiles([file('new.jpg')])
    expect(store.getState().importing).toBe(1)
    await vi.waitFor(() => {
      expect(i).toBe(2)
    })
    gates[0]?.resolve(decoded())
    await old
    expect(store.getState().importing).toBe(1)
    gates[1]?.resolve(decoded())
    await fresh
    expect(store.getState().importing).toBe(0)
  })

  it('a job still waiting for a decode slot when clear() runs is never decoded', async () => {
    const gate = deferred<DecodedImage>()
    const decode = vi.fn(() => gate.promise)
    const { store } = setup({ decode })
    const p = store.getState().addFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')])
    await vi.waitFor(() => {
      expect(decode).toHaveBeenCalledTimes(2)
    })
    store.getState().clear()
    gate.resolve(decoded())
    expect(await p).toBeNull()
    expect(decode).toHaveBeenCalledTimes(2)
  })
})

describe('download limiter', () => {
  it('downloads at most 2 links at a time; a third waits for a free slot', async () => {
    const gates = [0, 1, 2].map(() => deferred<{ blob: Blob; name: string }>())
    let started = 0
    const fetchImage = vi.fn<ImagesDeps['fetchImage']>(() => {
      const g = gates[started++]
      if (!g) throw new Error('unexpected fetch')
      return g.promise
    })
    const { store } = setup({ fetchImage })
    const p = store.getState().addFromClipboard({
      files: [],
      items: [],
      getData: (f: string) =>
        f === 'text/plain' ? 'https://a.com/1.jpg https://a.com/2.jpg https://a.com/3.jpg' : '',
    } as unknown as DataTransfer)
    await vi.waitFor(() => {
      expect(fetchImage).toHaveBeenCalledTimes(2)
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchImage).toHaveBeenCalledTimes(2)
    gates[0]?.resolve({ blob: new Blob(['x']), name: '1.jpg' })
    await vi.waitFor(() => {
      expect(fetchImage).toHaveBeenCalledTimes(3)
    })
    gates[1]?.resolve({ blob: new Blob(['y']), name: '2.jpg' })
    gates[2]?.resolve({ blob: new Blob(['z']), name: '3.jpg' })
    const out = await p
    expect(out?.map((o) => (o.ok ? o.id : ''))).toEqual(['id-1', 'id-2', 'id-3'])
  })
})

describe('progress', () => {
  it('importing returns to 0 when a batch throws before any job starts', async () => {
    const { store } = setup({
      newId: () => {
        throw new TypeError('crypto.randomUUID is not a function')
      },
    })
    await expect(store.getState().addFiles([file('a.jpg'), file('b.jpg')])).rejects.toThrow(
      TypeError,
    )
    expect(store.getState().importing).toBe(0)
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
    expect(Object.keys(a[0] ?? {}).sort()).toEqual([
      'contentHash',
      'edits',
      'id',
      'lines',
      'pxH',
      'pxW',
      'study',
    ])
    store.getState().updateEdits('id-2' as ImageId, { copies: 3 })
    const b = selectImageDescriptors(store.getState())
    expect(b).not.toBe(a)
    expect(b[0]).toBe(a[0]) // unchanged image keeps its descriptor object
    expect(b[1]).not.toBe(a[1])
  })

  it("passes each image's own study through", () => {
    const study = patchStudy(DEFAULT_STUDY, {
      versions: ['original', 'values'],
      blurPct: 70,
      values: { count: 9, hue: 200, neutral: true },
    })
    const [d] = selectImageDescriptors({ images: [makeLoadedImage({ study })] })
    expect(d?.study).toBe(study)
  })

  it("passes each image's own lines through", () => {
    const lines = patchLines(DEFAULT_LINES, {
      thirds: true,
      spiral: { on: true, corner: 'bottomRight' },
      style: { colour: '#1f3fbf' },
    })
    const [d] = selectImageDescriptors({ images: [makeLoadedImage({ lines })] })
    expect(d?.lines).toBe(lines)
  })
})

const BLUR_VALUES: StudySettings = {
  versions: ['original', 'blurred', 'values'],
  blurPct: 70,
  values: { count: 3, hue: 200, neutral: false },
}

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a value')
  return v
}

describe('updateStudy', () => {
  it('patches one image and leaves its edits and the others alone', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    const [a, b] = store.getState().images
    store
      .getState()
      .updateStudy(must(a).id, { versions: ['original', 'blurred'], values: { count: 7 } })
    const [a2, b2] = store.getState().images
    expect(a2?.study).toEqual({
      versions: ['original', 'blurred'],
      blurPct: DEFAULT_STUDY.blurPct,
      values: { ...DEFAULT_STUDY.values, count: 7 },
    })
    expect(a2?.edits).toBe(a?.edits)
    expect(b2).toBe(b)
  })

  it('sanitizes through patchStudy (canonical order, clamps)', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    store
      .getState()
      .updateStudy('id-1' as ImageId, { versions: ['values', 'original'], blurPct: 400 })
    expect(store.getState().images[0]?.study.versions).toEqual(['original', 'values'])
    expect(store.getState().images[0]?.study.blurPct).toBe(100)
  })

  it('keeps the same state object when nothing changes, so descriptors stay memoised', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const before = store.getState().images
    const descriptors = selectImageDescriptors(store.getState())
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().updateStudy('id-1' as ImageId, { blurPct: DEFAULT_STUDY.blurPct })
    expect(store.getState().images).toBe(before)
    expect(selectImageDescriptors(store.getState())).toBe(descriptors)
    expect(listener).not.toHaveBeenCalled()
  })

  it('treats turning on a version that is already on as no change', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const img = must(store.getState().images[0])
    const same = withVersion(img.study, 'original', true)
    expect(same).not.toBe(img.study)
    const before = store.getState().images
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().updateStudy(img.id, { versions: same.versions })
    store.getState().updateStudy(img.id, same)
    expect(store.getState().images).toBe(before)
    expect(store.getState().images[0]?.study).toBe(img.study)
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores an unknown id', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    const before = store.getState().images
    store.getState().updateStudy('nope' as ImageId, { blurPct: 10 })
    expect(store.getState().images).toBe(before)
  })

  it('merges a partial values patch over the image’s own values', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    store.getState().updateStudy('id-1' as ImageId, {
      blurPct: 70,
      values: { count: 3, hue: 200, neutral: true },
    })
    store.getState().updateStudy('id-1' as ImageId, { values: { count: 7 } })
    expect(store.getState().images[0]?.study).toEqual({
      versions: ['original'],
      blurPct: 70,
      values: { count: 7, hue: 200, neutral: true },
    })
  })

  it('descriptors carry the new study', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    store.getState().updateStudy('id-1' as ImageId, { versions: ['original', 'values'] })
    expect(selectImageDescriptors(store.getState())[0]?.study.versions).toEqual([
      'original',
      'values',
    ])
  })
})

describe('applyStudyToAll (owner Q6: versions included)', () => {
  it('copies the whole study, versions included, to every image and returns how many changed', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')])
    const [a, , c] = store.getState().images
    store.getState().updateStudy(must(a).id, BLUR_VALUES)
    store.getState().updateStudy(must(c).id, BLUR_VALUES)
    const cBefore = store.getState().images[2]
    const changed = store.getState().applyStudyToAll(must(a).id)
    expect(changed).toBe(1)
    for (const img of store.getState().images) expect(img.study).toEqual(BLUR_VALUES)
    expect(store.getState().images[2]).toBe(cBefore)
  })

  it('never touches edits', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    const [a, b] = store.getState().images
    store.getState().updateEdits(must(b).id, { copies: 3, rotation: 90 })
    const edits = store.getState().images[1]?.edits
    store.getState().updateStudy(must(a).id, BLUR_VALUES)
    store.getState().applyStudyToAll(must(a).id)
    expect(store.getState().images[1]?.edits).toBe(edits)
    expect(store.getState().images[1]?.edits.copies).toBe(3)
    expect(store.getState().images[1]?.edits.rotation).toBe(90)
  })

  it('returns 0 and keeps the images when nothing changes or the source is unknown', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    const before = store.getState().images
    expect(store.getState().applyStudyToAll(must(before[0]).id)).toBe(0)
    expect(store.getState().images).toBe(before)
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.getState().applyStudyToAll('nope' as ImageId)).toBe(0)
    expect(store.getState().images).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('records every apply as a new appliedStudy, even one that changes nothing (owner M2-1)', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg'), file('b.jpg')])
    expect(store.getState().appliedStudy).toBeNull()
    const [a, b] = store.getState().images
    store.getState().updateStudy(must(b).id, { blurPct: 70 })
    store.getState().applyStudyToAll(must(b).id)
    const first = store.getState().appliedStudy
    expect(first?.study).toEqual({ ...DEFAULT_STUDY, blurPct: 70 })
    expect(store.getState().applyStudyToAll(must(a).id)).toBe(0)
    const second = store.getState().appliedStudy
    expect(second?.study).toEqual({ ...DEFAULT_STUDY, blurPct: 70 })
    expect(second).not.toBe(first)
  })
})

describe('setDefaultStudy', () => {
  it('gives the default to images imported afterwards, not to existing ones', async () => {
    const { store } = setup()
    await store.getState().addFiles([file('a.jpg')])
    store.getState().setDefaultStudy(BLUR_VALUES)
    await store.getState().addFiles([file('b.jpg')])
    const [a, b] = store.getState().images
    expect(a?.study).toEqual(DEFAULT_STUDY)
    expect(b?.study).toEqual(BLUR_VALUES)
  })

  it('applies to an import that was already decoding when the default changed', async () => {
    const gate = deferred<DecodedImage>()
    const decode = vi.fn(() => gate.promise)
    const { store } = setup({ decode })
    const p = store.getState().addFiles([file('slow.jpg')])
    await vi.waitFor(() => {
      expect(decode).toHaveBeenCalled()
    })
    store.getState().setDefaultStudy(BLUR_VALUES)
    gate.resolve(decoded())
    await p
    expect(store.getState().images[0]?.study).toEqual(BLUR_VALUES)
  })

  it('reads the default when the image is created, after its hash, not when its decode ends', async () => {
    const gate = deferred<string>()
    const hash = vi.fn(() => gate.promise)
    const { store } = setup({ hash })
    const p = store.getState().addFiles([file('slow.jpg')])
    await vi.waitFor(() => {
      expect(hash).toHaveBeenCalled()
    })
    store.getState().setDefaultStudy(BLUR_VALUES)
    gate.resolve('h')
    await p
    expect(store.getState().images[0]?.study).toEqual(BLUR_VALUES)
  })

  it('keeps the default across clear()', async () => {
    const { store } = setup()
    store.getState().setDefaultStudy(BLUR_VALUES)
    store.getState().clear()
    await store.getState().addFiles([file('a.jpg')])
    expect(store.getState().images[0]?.study).toEqual(BLUR_VALUES)
  })

  it('belongs to one store: another store keeps its own default', async () => {
    const first = setup().store
    const second = setup().store
    first.getState().setDefaultStudy(BLUR_VALUES)
    await second.getState().addFiles([file('a.jpg')])
    await first.getState().addFiles([file('b.jpg')])
    expect(second.getState().images[0]?.study).toEqual(DEFAULT_STUDY)
    expect(first.getState().images[0]?.study).toEqual(BLUR_VALUES)
  })

  it('sanitizes the default', async () => {
    const { store } = setup()
    store.getState().setDefaultStudy({ ...BLUR_VALUES, versions: [], blurPct: 0 })
    await store.getState().addFiles([file('a.jpg')])
    expect(store.getState().images[0]?.study.versions).toEqual(['original'])
    expect(store.getState().images[0]?.study.blurPct).toBe(1)
  })

  it('does not notify subscribers', () => {
    const { store } = setup()
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().setDefaultStudy(BLUR_VALUES)
    expect(listener).not.toHaveBeenCalled()
  })
})
