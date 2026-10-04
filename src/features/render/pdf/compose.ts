import { PDFDocument, cmyk, type PDFImage } from '@pdfme/pdf-lib'
import { PT_PER_MM } from '../../../shared/model/units'
import type { RectMm } from '../../layout/types'
import { CROP_MARK_WIDTH_PT } from '../page-model/crop-marks'
import { expandRect } from '../page-model/rect'
import { tileRenderKey } from '../pixels/tile-plan'
import type { EncodedTileImage, PageModel } from '../types'

export const PDF_TITLE = 'Artistica reference sheet'
export const PDF_PRODUCER = 'Artistica'
/** Registration black: 100% of every separation, so marks show on every plate. */
const REGISTRATION = cmyk(1, 1, 1, 1)

export class MissingTileImageError extends Error {
  constructor(key: string) {
    super(`export:missing-image (${key})`)
    this.name = 'MissingTileImageError'
  }
}

export class EmptyPdfError extends Error {
  constructor() {
    super('export:empty')
    this.name = 'EmptyPdfError'
  }
}

/** Incremental composer: the export worker embeds tile images as they are encoded, then adds pages. */
export interface PdfComposer {
  /** Embed once per render key; a second call with the same key is a no-op. */
  embed(key: string, image: EncodedTileImage): Promise<void>
  /** Add one page, drawing every tile at trim+bleed and the crop marks as vector lines. */
  addPage(page: PageModel): void
  /** Rejects with EmptyPdfError when no page was added (pdf-lib would silently add a blank one). */
  save(): Promise<Uint8Array>
}

const pt = (mm: number): number => mm * PT_PER_MM

/** Page coords (top-left origin, mm) → PDF rect (bottom-left origin, pt). */
export function toPdfRect(
  r: RectMm,
  pageHeightMm: number,
): { x: number; y: number; width: number; height: number } {
  return { x: pt(r.x), y: pt(pageHeightMm - r.y - r.h), width: pt(r.w), height: pt(r.h) }
}

export async function createPdfComposer(): Promise<PdfComposer> {
  // updateMetadata: false → no default "pdf-lib" producer and no timestamps; we set only what we want.
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.setTitle(PDF_TITLE)
  doc.setProducer(PDF_PRODUCER)
  doc.setCreator(PDF_PRODUCER)
  const embedded = new Map<string, PDFImage>()
  let pageCount = 0

  return {
    async embed(key, image) {
      if (embedded.has(key)) return
      const pdfImage =
        image.format === 'jpeg' ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes)
      embedded.set(key, pdfImage)
    },

    addPage(page) {
      const H = page.size.h
      const pdfPage = doc.addPage([pt(page.size.w), pt(H)])
      pageCount++
      for (const tile of page.tiles) {
        const key = tileRenderKey(tile)
        const image = embedded.get(key)
        if (!image) throw new MissingTileImageError(key)
        pdfPage.drawImage(image, toPdfRect(expandRect(tile.trim, tile.bleedMm), H))
      }
      for (const s of page.cropMarks) {
        pdfPage.drawLine({
          start: { x: pt(s.x1), y: pt(H - s.y1) },
          end: { x: pt(s.x2), y: pt(H - s.y2) },
          thickness: CROP_MARK_WIDTH_PT,
          color: REGISTRATION,
        })
      }
    },

    save() {
      if (pageCount === 0) return Promise.reject(new EmptyPdfError())
      return doc.save()
    },
  }
}

/**
 * Pure (no DOM): pages + pre-encoded tile images (keyed by tileRenderKey) → PDF bytes.
 * Each page is sized exactly (mm → pt), images sit at trim + bleed, crop marks are 0.25 pt vectors.
 */
export async function composePdf(
  pages: readonly PageModel[],
  encoded: ReadonlyMap<string, EncodedTileImage>,
): Promise<Uint8Array> {
  const composer = await createPdfComposer()
  for (const page of pages) {
    for (const tile of page.tiles) {
      const key = tileRenderKey(tile)
      const image = encoded.get(key)
      if (image) await composer.embed(key, image)
    }
    composer.addPage(page)
  }
  return composer.save()
}
