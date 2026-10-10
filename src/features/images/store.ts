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
import {
  DEFAULT_LINES,
  linesEqual,
  patchLines,
  sanitizeLines,
  type LineSettings,
  type LinesPatch,
} from '../../shared/model/lines'
import {
  DEFAULT_STUDY,
  patchStudy,
  sanitizeStudy,
  studyEqual,
  type StudyPatch,
  type StudySettings,
} from '../../shared/model/study'

export interface ImagesState {
  images: LoadedImage[]
  selectedId: ImageId | null
  importing: number
  /** The study the last "Apply to all" copied, in a new object on every apply. */
  appliedStudy: { readonly study: StudySettings } | null
  /** The lines the last "Apply lines to all" copied, in a new object on every apply. */
  appliedLines: { readonly lines: LineSettings } | null
  /** The import methods resolve to null when clear() discarded the batch before it finished. */
  addFiles(files: File[]): Promise<ImportOutcome[] | null>
  addFromClipboard(data: DataTransfer): Promise<ImportOutcome[] | null>
  addFromDrop(data: DataTransfer): Promise<ImportOutcome[] | null>
  addFromUrl(url: string): Promise<ImportOutcome | null>
  remove(id: ImageId): void
  clear(): void
  /** Stops every pending import; their batches resolve to null and the photos already loaded stay. */
  cancelImports(): void
  select(id: ImageId | null): void
  updateEdits(id: ImageId, patch: Partial<ImageEdits>): void
  /** Patch one image's study settings (sanitized). Keeps the same state when nothing changes. */
  updateStudy(id: ImageId, patch: StudyPatch): void
  /** Copies `fromId`'s whole StudySettings (versions included) to every image. Returns how many changed; 0, recording nothing, while an import runs (owner M2-2). */
  applyStudyToAll(fromId: ImageId): number
  /** The study settings images created from now on start with. Not persisted here. */
  setDefaultStudy(study: StudySettings): void
  /** Patch one image's line settings (sanitized). Keeps the same state when nothing changes. */
  updateLines(id: ImageId, patch: LinesPatch): void
  /** Copies `fromId`'s whole LineSettings (types and style, owner Q8) to every image. Returns how many changed; 0, recording nothing, while an import runs (owner Q9). */
  applyLinesToAll(fromId: ImageId): number
  /** The line settings images created from now on start with. Not persisted here. */
  setDefaultLines(lines: LineSettings): void
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
  const decodeSlots = createLimiter(DECODE_CONCURRENCY)
  const fetchSlots = createLimiter(FETCH_CONCURRENCY)
  let abort = new AbortController()
  const order = new Map<ImageId, number>()
  let autoSelectedId: ImageId | null = null
  let generation = 0
  let defaultStudy: StudySettings = DEFAULT_STUDY
  let defaultLines: LineSettings = DEFAULT_LINES
  let nextSeq = 0
  let nextPaste = 1

  return create<ImagesState>()((set, get) => {
    const discard = (d: DecodedImage): void => {
      deps.revokeObjectURL(d.thumbUrl)
      d.preview.close()
    }
    const restartImports = (): void => {
      abort.abort()
      abort = new AbortController()
    }
    const dispose = (img: LoadedImage): void => {
      deps.revokeObjectURL(img.thumbUrl)
      img.preview.close()
      order.delete(img.id)
    }

    /** A download keeps its slot until a decode slot is free, so finished blobs never pile up. */
    async function withDecodeSlot(
      job: Job,
      signal: AbortSignal,
    ): Promise<{ blob: Blob; name: string; release: () => void }> {
      if (job.kind === 'blob')
        return { blob: job.blob, name: job.name, release: await decodeSlots.acquire(signal) }
      const releaseFetch = await fetchSlots.acquire(signal)
      try {
        const { blob, name } = await deps.fetchImage(job.url, signal)
        return { blob, name, release: await decodeSlots.acquire(signal) }
      } finally {
        releaseFetch()
      }
    }

    async function loadOne(
      job: Job,
      seq: number,
      id: ImageId,
      gen: number,
      signal: AbortSignal,
    ): Promise<ImportOutcome | null> {
      const label = job.kind === 'url' ? job.url : job.name
      const stale = (): boolean => gen !== generation || signal.aborted
      try {
        const { blob, name, release } = await withDecodeSlot(job, signal)
        let d: DecodedImage
        let contentHash: string
        try {
          if (stale()) return null
          d = await deps.decode(blob, name)
          try {
            contentHash = await deps.hash(blob)
          } catch (e) {
            discard(d)
            throw e
          }
        } finally {
          release()
        }
        if (stale()) {
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
          study: defaultStudy,
          lines: defaultLines,
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
        if (k > 0 && gen === generation && !signal.aborted)
          set((s) => ({ importing: s.importing - k }))
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
        if (gen !== generation || signal.aborted) return null
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
      appliedStudy: null,
      appliedLines: null,

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
        set((s) => {
          const at = s.images.findIndex((i) => i.id === id)
          const images = s.images.filter((i) => i.id !== id)
          if (s.selectedId !== id) return { images }
          const selectedId = (images[at] ?? images[at - 1])?.id ?? null
          if (autoSelectedId === id) autoSelectedId = selectedId
          return { images, selectedId }
        })
      },

      clear: () => {
        generation += 1
        restartImports()
        for (const img of get().images) dispose(img)
        set({ images: [], selectedId: null, importing: 0 })
      },

      cancelImports: () => {
        if (get().importing === 0) return
        restartImports()
        set({ importing: 0 })
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

      updateStudy: (id, patch) => {
        set((s) => {
          let changed = false as boolean
          const images = s.images.map((img) => {
            if (img.id !== id) return img
            const study = patchStudy(img.study, patch)
            if (studyEqual(study, img.study)) return img
            changed = true
            return { ...img, study }
          })
          return changed ? { images } : s
        })
      },

      applyStudyToAll: (fromId) => {
        const { images, importing } = get()
        if (importing > 0) return 0
        const study = images.find((i) => i.id === fromId)?.study
        if (study === undefined) return 0
        let count = 0
        const next = images.map((img) => {
          if (studyEqual(img.study, study)) return img
          count += 1
          return { ...img, study }
        })
        set(count > 0 ? { images: next, appliedStudy: { study } } : { appliedStudy: { study } })
        return count
      },

      setDefaultStudy: (study) => {
        defaultStudy = sanitizeStudy(study)
      },

      updateLines: (id, patch) => {
        set((s) => {
          let changed = false as boolean
          const images = s.images.map((img) => {
            if (img.id !== id) return img
            const lines = patchLines(img.lines, patch)
            if (linesEqual(lines, img.lines)) return img
            changed = true
            return { ...img, lines }
          })
          return changed ? { images } : s
        })
      },

      applyLinesToAll: (fromId) => {
        const { images, importing } = get()
        if (importing > 0) return 0
        const lines = images.find((i) => i.id === fromId)?.lines
        if (lines === undefined) return 0
        let count = 0
        const next = images.map((img) => {
          if (linesEqual(img.lines, lines)) return img
          count += 1
          return { ...img, lines }
        })
        set(count > 0 ? { images: next, appliedLines: { lines } } : { appliedLines: { lines } })
        return count
      },

      setDefaultLines: (lines) => {
        defaultLines = sanitizeLines(lines)
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

/** Plain `{ id, contentHash, pxW, pxH, edits, study, lines }` objects (no bitmap), memoised so `useImages(selectImageDescriptors)` is safe. */
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
        lines: img.lines,
      }
      descriptorCache.set(img, d)
    }
    return d
  })
  lastImages = state.images
  return lastResult
}
