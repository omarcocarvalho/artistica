import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { ImageDescriptor, ImageEdits, ImageId } from '../../shared/model/image'
import { sourcesFromDataTransfer, pastedName, type ImportSource } from './clipboard'
import { createBrowserDecodeDeps } from './browser-deps'
import { sha256Hex } from './content-hash'
import { decodeFullImage, decodeImage, type DecodedImage } from './decode'
import { editsEqual, sanitizeEdits } from './edits'
import { toImportErrorCode } from './errors'
import { DECODE_CONCURRENCY, FETCH_CONCURRENCY } from './limits'
import { createLimiter } from './limiter'
import type { ImportOutcome, ImportWarning, LoadedImage } from './types'
import { fetchImageBlob } from './url'
import { DEFAULT_EDITS } from '../../shared/model/image'
import { DEFAULT_STUDY } from '../../shared/model/study'

export interface ImagesState {
  images: LoadedImage[]
  selectedId: ImageId | null
  importing: number
  /** The import methods resolve to null when clear() discarded the batch before it finished. */
  addFiles(files: File[]): Promise<ImportOutcome[] | null>
  addFromClipboard(data: DataTransfer): Promise<ImportOutcome[] | null>
  addFromDrop(data: DataTransfer): Promise<ImportOutcome[] | null>
  addFromUrl(url: string): Promise<ImportOutcome | null>
  remove(id: ImageId): void
  clear(): void
  select(id: ImageId | null): void
  updateEdits(id: ImageId, patch: Partial<ImageEdits>): void
}

export interface ImagesDeps {
  decode(blob: Blob, name: string): Promise<DecodedImage>
  fetchImage(url: string, signal: AbortSignal): Promise<{ blob: Blob; name: string }>
  revokeObjectURL(url: string): void
  newId(): ImageId
  hash(blob: Blob): Promise<string>
}

type Job = { kind: 'blob'; blob: Blob; name: string } | { kind: 'url'; url: string }

export function createImagesStore(deps: ImagesDeps): UseBoundStore<StoreApi<ImagesState>> {
  const limit = createLimiter(DECODE_CONCURRENCY)
  const fetchLimit = createLimiter(FETCH_CONCURRENCY)
  let abort = new AbortController()
  const order = new Map<ImageId, number>()
  let autoSelectedId: ImageId | null = null
  let generation = 0
  let nextSeq = 0
  let nextPaste = 1

  return create<ImagesState>()((set, get) => {
    const discard = (d: DecodedImage): void => {
      deps.revokeObjectURL(d.thumbUrl)
      d.preview.close()
    }
    const dispose = (img: LoadedImage): void => {
      deps.revokeObjectURL(img.thumbUrl)
      img.preview.close()
      order.delete(img.id)
    }

    async function loadOne(
      job: Job,
      seq: number,
      id: ImageId,
      gen: number,
      signal: AbortSignal,
    ): Promise<ImportOutcome | null> {
      const label = job.kind === 'url' ? job.url : job.name
      try {
        const { blob, name } =
          job.kind === 'url'
            ? await fetchLimit(() => deps.fetchImage(job.url, signal))
            : { blob: job.blob, name: job.name }
        const work = await limit(async () => {
          if (gen !== generation) return null
          const decoded = await deps.decode(blob, name)
          try {
            return { d: decoded, contentHash: await deps.hash(blob) }
          } catch (e) {
            discard(decoded)
            throw e
          }
        })
        if (work === null) return null
        const { d, contentHash } = work
        if (gen !== generation) {
          discard(d)
          return null
        }
        const image: LoadedImage = {
          id,
          contentHash,
          name,
          pxW: d.pxW,
          pxH: d.pxH,
          edits: DEFAULT_EDITS,
          study: DEFAULT_STUDY,
          preview: d.preview,
          source: d.source,
          thumbUrl: d.thumbUrl,
          originalPxW: d.originalPxW,
          originalPxH: d.originalPxH,
        }
        order.set(id, seq)
        set((s) => {
          const at = s.images.findIndex((i) => (order.get(i.id) ?? 0) > seq)
          const images =
            at === -1
              ? [...s.images, image]
              : [...s.images.slice(0, at), image, ...s.images.slice(at)]
          const takeSelection =
            s.selectedId === null ||
            (s.selectedId === autoSelectedId && (order.get(s.selectedId) ?? 0) > seq)
          if (!takeSelection) return { images }
          autoSelectedId = id
          return { images, selectedId: id }
        })
        const warnings: ImportWarning[] = d.animatedGif ? ['animated-gif'] : []
        return { ok: true, id, ...(warnings.length > 0 ? { warnings } : {}) }
      } catch (e) {
        return { ok: false, source: label, error: toImportErrorCode(e) }
      }
    }

    /** Resolves to null when clear() ran before the batch finished: nothing of it is left to report. */
    async function run(jobs: Job[]): Promise<ImportOutcome[] | null> {
      const gen = generation
      const signal = abort.signal
      let pending = jobs.length
      const settle = (n: number): void => {
        const k = Math.min(n, pending)
        pending -= k
        if (k > 0 && gen === generation) set((s) => ({ importing: s.importing - k }))
      }
      set((s) => ({ importing: s.importing + jobs.length }))
      try {
        const planned = jobs.map((job) => ({ job, id: deps.newId(), seq: nextSeq++ }))
        const results = await Promise.all(
          planned.map(({ job, id, seq }) =>
            loadOne(job, seq, id, gen, signal).finally(() => {
              settle(1)
            }),
          ),
        )
        if (gen !== generation) return null
        return results.filter((r): r is ImportOutcome => r !== null)
      } finally {
        settle(pending)
      }
    }

    const jobsFromSources = (sources: ImportSource[]): Job[] =>
      sources.map((s) =>
        s.kind === 'url'
          ? { kind: 'url', url: s.url }
          : {
              kind: 'blob',
              blob: s.file,
              name: s.pasted ? pastedName(nextPaste++, s.file.type) : s.file.name,
            },
      )

    return {
      images: [],
      selectedId: null,
      importing: 0,

      addFiles: (files) =>
        run(files.map((file) => ({ kind: 'blob', blob: file, name: file.name }))),

      // Both read the DataTransfer synchronously on purpose: it is empty once the event handler returns.
      addFromClipboard: (data) => run(jobsFromSources(sourcesFromDataTransfer(data, true))),
      addFromDrop: (data) => run(jobsFromSources(sourcesFromDataTransfer(data, false))),

      addFromUrl: async (url) => {
        const outcomes = await run([{ kind: 'url', url }])
        return outcomes?.[0] ?? null
      },

      remove: (id) => {
        const img = get().images.find((i) => i.id === id)
        if (!img) return
        dispose(img)
        set((s) => ({
          images: s.images.filter((i) => i.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        }))
      },

      clear: () => {
        generation += 1
        abort.abort()
        abort = new AbortController()
        for (const img of get().images) dispose(img)
        set({ images: [], selectedId: null, importing: 0 })
      },

      select: (id) => {
        if (id === null || get().images.some((i) => i.id === id)) {
          autoSelectedId = null
          set({ selectedId: id })
        }
      },

      updateEdits: (id, patch) => {
        set((s) => {
          let changed = false as boolean
          const images = s.images.map((img) => {
            if (img.id !== id) return img
            const edits = sanitizeEdits({ ...img.edits, ...patch }, img.pxW, img.pxH)
            if (editsEqual(edits, img.edits)) return img
            changed = true
            return { ...img, edits }
          })
          return changed ? { images } : s
        })
      },
    }
  })
}

const browserDecode = createBrowserDecodeDeps()
export const useImages = createImagesStore({
  decode: (blob, name) => decodeImage(blob, name, browserDecode),
  fetchImage: (url, signal) =>
    fetchImageBlob(url, {
      fetch: (...a) => fetch(...a),
      isOnline: () => navigator.onLine,
      signal,
    }),
  revokeObjectURL: (u) => {
    URL.revokeObjectURL(u)
  },
  newId: () => crypto.randomUUID() as ImageId,
  hash: sha256Hex,
})

/** The image at its full pxW x pxH, decoded again from its source. The caller closes it. */
export function decodeFull(image: Pick<LoadedImage, 'source' | 'name'>): Promise<ImageBitmap> {
  return decodeFullImage(image.source, image.name, browserDecode)
}

const descriptorCache = new WeakMap<LoadedImage, ImageDescriptor>()
let lastImages: readonly LoadedImage[] | null = null
let lastResult: ImageDescriptor[] = []

/** Plain `{ id, contentHash, pxW, pxH, edits, study }` objects (no bitmap), memoised so `useImages(selectImageDescriptors)` is safe. */
export function selectImageDescriptors(state: Pick<ImagesState, 'images'>): ImageDescriptor[] {
  if (state.images === lastImages) return lastResult
  lastResult = state.images.map((img) => {
    let d = descriptorCache.get(img)
    if (!d) {
      d = {
        id: img.id,
        contentHash: img.contentHash,
        pxW: img.pxW,
        pxH: img.pxH,
        edits: img.edits,
        study: img.study,
      }
      descriptorCache.set(img, d)
    }
    return d
  })
  lastImages = state.images
  return lastResult
}
