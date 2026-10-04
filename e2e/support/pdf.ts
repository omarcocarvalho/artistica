import {
  countImageDraws,
  countStrokedLines,
  inspectPdf,
} from '../../src/features/render/pdf/inspect.ts'
import { PT_PER_MM } from '../../src/shared/model/units.ts'

export const mmToPt = (mm: number): number => mm * PT_PER_MM

export interface PdfPageSummary {
  widthPt: number
  heightPt: number
  /** `/Name Do` draws (an image embedded once and drawn twice counts 2). */
  imagePlacements: number
  /** Stroked straight lines: the vector crop marks. */
  strokes: number
}
export interface PdfSummary {
  pageCount: number
  /** Image XObjects in the file. */
  imageCount: number
  pages: PdfPageSummary[]
}

/** Thin adapter over the render feature's inspector (the parsing lives there, not here). */
export async function summarizePdf(bytes: Uint8Array): Promise<PdfSummary> {
  const report = await inspectPdf(bytes)
  return {
    pageCount: report.pageCount,
    imageCount: report.imageCount,
    pages: report.pages.map((p) => ({
      widthPt: p.widthPt,
      heightPt: p.heightPt,
      imagePlacements: countImageDraws(p.content),
      strokes: countStrokedLines(p.content),
    })),
  }
}
