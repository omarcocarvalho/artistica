import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from '@pdfme/pdf-lib'
import {
  countImageDraws,
  countStrokedLines,
  inspectPdf,
  type PdfImageInfo,
  type PdfReport,
} from '../../src/features/render/pdf/inspect.ts'
import { PT_PER_MM } from '../../src/shared/model/units.ts'

export const mmToPt = (mm: number): number => mm * PT_PER_MM

export interface PdfPageSummary {
  widthPt: number
  heightPt: number
  /** `/Name Do` draws (an image embedded once and drawn twice counts 2). */
  imagePlacements: number
  /** Registration-black strokes: the vector crop marks. */
  strokes: number
  /** Width in pt of each drawn image (the `W 0 0 H 0 0 cm` matrix right before its `Do`). */
  imageWidthsPt: number[]
  /** Start points of the stroked lines ("x y m"), in drawing order: the crop-mark geometry. */
  markGeometry: string[]
  /** Each stroked line as start and end points ("x y m" then "x y l"), in drawing order. */
  markSegments: PdfSegment[]
  /** Every image draw, in content-stream order. */
  draws: PdfDraw[]
}
export interface PdfDraw {
  /** Image box in pt, PDF coordinates (origin bottom-left). */
  xPt: number
  yPt: number
  wPt: number
  hPt: number
  /** /Filter of the drawn XObject: 'DCTDecode' = JPEG, 'FlateDecode' = PNG. */
  filter: string
  widthPx: number
  heightPx: number
  /** Distinct RGB colours of a FlateDecode image up to 4 MP (null for JPEG and larger images). */
  colours: number | null
  /** XObject resource name: two draws of one embedded image share it. */
  name: string
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
  /** The same image XObjects, in object order (an image drawn twice is listed once). */
  images: readonly PdfImageInfo[]
  pages: PdfPageSummary[]
}

/**
 * pdf-lib's drawImage writes, per image:
 *   q
 *   1 0 0 1 12.5 300.25 cm   (translate)
 *   1 0 0 1 0 0 cm           (rotate 0)
 *   216 0 0 144 0 0 cm       (scale = size)
 *   1 0 0 1 0 0 cm           (skew 0)
 *   /Image-7098480789 Do
 *   Q
 */
const DRAW =
  /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\s+1 0 -?0 1 0 0 cm\s+(-?[\d.]+) 0 0 (-?[\d.]+) 0 0 cm\s+1 0 0 1 0 0 cm\s+\/(\S+) Do\b/g

function drawsOf(page: PdfReport['pages'][number]): PdfDraw[] {
  const byName = new Map(page.draws.map((d) => [d.name, d]))
  const draws = [...page.content.matchAll(DRAW)].map((m) => {
    const name = m[5]
    const info = byName.get(name)
    if (!info) throw new Error(`no image XObject named ${name} on this page`)
    return {
      xPt: Number(m[1]),
      yPt: Number(m[2]),
      wPt: Number(m[3]),
      hPt: Number(m[4]),
      filter: info.filter,
      widthPx: info.widthPx,
      heightPx: info.heightPx,
      colours: info.colours,
      name,
    }
  })
  if (draws.length !== page.draws.length)
    throw new Error(
      `parsed ${String(draws.length)} draw boxes for ${String(page.draws.length)} image draws`,
    )
  return draws
}

/** Thin adapter over the render feature's inspector (the parsing lives there, not here). */
export async function summarizePdf(bytes: Uint8Array): Promise<PdfSummary> {
  const report = await inspectPdf(bytes)
  return {
    pageCount: report.pageCount,
    imageCount: report.imageCount,
    images: report.images,
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
      draws: drawsOf(p),
    })),
  }
}

/** A drawn image as stored: the JPEG file for DCTDecode, the decoded samples for FlateDecode. */
export interface PdfImageData {
  filter: string
  widthPx: number
  heightPx: number
  data: Uint8Array
}

/** Every image draw's stored data, per page, in content-stream order (as `PdfPageSummary.draws`). */
export async function drawnImageData(bytes: Uint8Array): Promise<PdfImageData[][]> {
  const report = await inspectPdf(bytes)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.getPages().map((p, i) => {
    const xobjects = p.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    return (report.pages[i]?.draws ?? []).map((d) => {
      const ref = xobjects?.get(PDFName.of(d.name))
      const obj = ref ? doc.context.lookup(ref) : undefined
      if (!(obj instanceof PDFRawStream)) throw new Error(`no image XObject named ${d.name}`)
      return {
        filter: d.filter,
        widthPx: d.widthPx,
        heightPx: d.heightPx,
        data: d.filter === 'DCTDecode' ? obj.contents : decodePDFRawStream(obj).decode(),
      }
    })
  })
}
