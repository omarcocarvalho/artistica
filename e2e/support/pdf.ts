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
  /** Width in pt of each drawn image (the `W 0 0 H 0 0 cm` matrix right before its `Do`). */
  imageWidthsPt: number[]
  /** Start points of the stroked lines ("x y m"), in drawing order: the crop-mark geometry. */
  markGeometry: string[]
  /** Each stroked line as start and end points ("x y m" then "x y l"), in drawing order. */
  markSegments: PdfSegment[]
}
export interface PdfSegment {
  x1: number
  y1: number
  x2: number
  y2: number
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
      imageWidthsPt: [
        ...p.content.matchAll(/([\d.]+) 0 0 [\d.]+ 0 0 cm\s+(?:1 0 0 1 0 0 cm\s+)?\/\S+ Do\b/g),
      ].map((m) => Number(m[1])),
      markGeometry: [...p.content.matchAll(/^([\d.]+ [\d.]+) m$/gm)].map((m) => m[1]),
      markSegments: [
        ...p.content.matchAll(/^([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l\s+S\b/gm),
      ].map((m) => ({
        x1: Number(m[1]),
        y1: Number(m[2]),
        x2: Number(m[3]),
        y2: Number(m[4]),
      })),
    })),
  }
}
