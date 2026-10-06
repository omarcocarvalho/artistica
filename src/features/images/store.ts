import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { ImageDescriptor, ImageEdits, ImageId } from '../../shared/model/image'
import { sourcesFromDataTransfer, pastedName, type ImportSource } from './clipboard'
import { createBrowserDecodeDeps } from './browser-deps'
import { sha256Hex } from './content-hash'
import { decodeImage, type DecodedImage } from './decode'
import { editsEqual, sanitizeEdits } from './edits'
import { toImportErrorCode } from './errors'
import { DECODE_CONCURRENCY } from './limits'
import { createLimiter } from './limiter'
import type { ImportOutcome, ImportWarning, LoadedImage } from './types'
import { fetchImageBlob } from './url'
import { DEFAULT_EDITS } from '../../shared/model/image'

export interface ImagesState {
  images: LoadedImage[]
  selectedId: ImageId | null
  importing: number
  addFiles(files: File[]): Promise<ImportOutcome[]>
  addFromClipboard(data: DataTransfer): Promise<ImportOutcome[]>
  addFromDrop(data: DataTransfer): Promise<ImportOutcome[]>
  addFromUrl(url: string): Promise<ImportOutcome>
  remove(id: ImageId): void
  clear(): void
  select(id: ImageId | null): void
  updateEdits(id: ImageId, patch: Partial<ImageEdits>): void
}

export interface ImagesDeps {
  decode(blob: Blob, name: string): Promise<DecodedImage>
  fetchImage(url: string): Promise<{ blob: Blob; name: string }>
  revokeObjectURL(url: string): void
  newId(): ImageId
  hash(blob: Blob): Promise<string>
}

type Job = { kind: 'blob'; blob: Blob; name: string } | { kind: 'url'; url: string }

export function createImagesStore(deps: ImagesDeps): UseBoundStore<StoreApi<ImagesState>> {
  const limit = createLimiter(DECODE_CONCURRENCY)
  const order = new Map<ImageId, number>()
  let autoSelectedId: ImageId | null = null
  let generation = 0
  let nextSeq = 0
  let nextPaste = 1

  return create<ImagesState>()((set, get) => {
    const discard = (d: DecodedImage): void => {
      deps.revokeObjectURL(d.thumbUrl)
      d.bitmap.close()
    }
    const dispose = (img: LoadedImage): void => {
      deps.revokeObjectURL(img.thumbUrl)
      img.bitmap.close()
      order.delete(img.id)
    }

    async function loadOne(
      job: Job,
      seq: number,
      id: ImageId,
      gen: number,
    ): Promise<ImportOutcome | null> {
      const label = job.kind === 'url' ? job.url : job.name
      try {
        const { blob, name } =
          job.kind === 'url' ? await deps.fetchImage(job.url) : { blob: job.blob, name: job.name }
        const { d, contentHash } = await limit(async () => {
          const decoded = await deps.decode(blob, name)
          try {
            return { d: decoded, contentHash: await deps.hash(blob) }
          } catch (e) {
            discard(decoded)
            throw e
          }
        })
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
          bitmap: d.bitmap,
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
      } finally {
        set((s) => ({ importing: s.importing - 1 }))
      }
    }

    async function run(jobs: Job[]): Promise<ImportOutcome[]> {
      const gen = generation
      set((s) => ({ importing: s.importing + jobs.length }))
      const results = await Promise.all(
        jobs.map((job) => loadOne(job, nextSeq++, deps.newId(), gen)),
      )
      return results.filter((r): r is ImportOutcome => r !== null)
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
        const [outcome] = await run([{ kind: 'url', url }])
        return outcome ?? { ok: false, source: url, error: 'decode-failed' }
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
        for (const img of get().images) dispose(img)
        set({ images: [], selectedId: null })
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
  fetchImage: (url) =>
    fetchImageBlob(url, { fetch: (...a) => fetch(...a), isOnline: () => navigator.onLine }),
  revokeObjectURL: (u) => {
    URL.revokeObjectURL(u)
  },
  newId: () => crypto.randomUUID() as ImageId,
  hash: sha256Hex,
})

const descriptorCache = new WeakMap<LoadedImage, ImageDescriptor>()
let lastImages: readonly LoadedImage[] | null = null
let lastResult: ImageDescriptor[] = []

/** Plain `{ id, contentHash, pxW, pxH, edits }` objects (no bitmap), memoised so `useImages(selectImageDescriptors)` is safe. */
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
      }
      descriptorCache.set(img, d)
    }
    return d
  })
  lastImages = state.images
  return lastResult
}
