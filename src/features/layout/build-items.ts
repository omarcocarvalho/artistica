import { MAX_COPIES, printedPixelSize, type ImageDescriptor } from '../../shared/model/image'
import { studyKey, tileStudyFor, type StudySettings } from '../../shared/model/study'
import { maxPrintMm } from '../../shared/model/units'
import type { LayoutItemInput } from './types'

function clampCopies(copies: number): number {
  if (!Number.isFinite(copies)) return 1
  return Math.min(MAX_COPIES, Math.max(1, Math.floor(copies)))
}

function printedStudies(study: StudySettings): string {
  return study.versions.map((v) => `${v}:${studyKey(tileStudyFor(v, study))}`).join(',')
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Rank of each image among those with the same bytes: by what its studies print, then by input order. */
function occurrences(images: readonly ImageDescriptor[]): number[] {
  const studies = images.map((image) => printedStudies(image.study))
  const order = images
    .map((_, index) => index)
    .sort((a, b) => byString(studies[a] ?? '', studies[b] ?? '') || a - b)
  const seen = new Map<string, number>()
  const result = new Array<number>(images.length).fill(0)
  for (const index of order) {
    const hash = images[index]?.contentHash ?? ''
    const n = seen.get(hash) ?? 0
    seen.set(hash, n + 1)
    result[index] = n
  }
  return result
}

/**
 * Expand descriptors into layout items: one item per copy, one tile per selected study version;
 * computes aspect & 300-DPI cap.
 */
export function buildLayoutItems(images: readonly ImageDescriptor[]): LayoutItemInput[] {
  const items: LayoutItemInput[] = []
  const occurrenceOf = occurrences(images)
  images.forEach((image, index) => {
    const occurrence = occurrenceOf[index] ?? 0
    const { pxW, pxH } = printedPixelSize(image)
    // A decoded image always has pixels; a zero/NaN size would be a bug upstream (C), not a layout case.
    if (!(pxW > 0 && pxH > 0 && Number.isFinite(pxW) && Number.isFinite(pxH))) return
    const copies = clampCopies(image.edits.copies)
    const tiles = Math.max(1, image.study.versions.length)
    for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
      items.push({
        key: `${image.contentHash}~${String(occurrence)}#${String(copyIndex)}`,
        imageId: image.id,
        aspect: pxW / pxH,
        maxPrintWidthMm: maxPrintMm(pxW),
        size: image.edits.size,
        tiles,
      })
    }
  })
  return items
}
