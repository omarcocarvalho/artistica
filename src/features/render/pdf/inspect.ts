import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFObject,
} from '@pdfme/pdf-lib'

/**
 * Parse a PDF back for tests (unit tests here, and E's Playwright E2E in node).
 * Not used by the app at runtime.
 */
export interface PdfReport {
  readonly pageCount: number
  readonly pages: readonly {
    readonly widthPt: number
    readonly heightPt: number
    readonly content: string
  }[]
  /** Image XObjects in the file (each embedded image counts once, however often it is drawn). */
  readonly imageCount: number
  readonly title: string | undefined
  readonly producer: string | undefined
  readonly author: string | undefined
}

function contentText(doc: PDFDocument, ref: PDFObject | undefined): string {
  const obj = ref ? doc.context.lookup(ref) : undefined
  if (obj instanceof PDFArray)
    return obj
      .asArray()
      .map((o) => contentText(doc, o))
      .join('\n')
  if (obj instanceof PDFRawStream) return new TextDecoder().decode(decodePDFRawStream(obj).decode())
  return ''
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfReport> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const images: PDFRawStream[] = []
  const softMasks = new Set<PDFObject>()
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (
      obj instanceof PDFRawStream &&
      obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')
    ) {
      images.push(obj)
      const mask = obj.dict.get(PDFName.of('SMask'))
      if (mask) softMasks.add(doc.context.lookup(mask))
    }
  }
  // An alpha channel is a second Image stream referenced only as /SMask: not a drawn image.
  const imageCount = images.filter((img) => !softMasks.has(img)).length
  return {
    pageCount: doc.getPageCount(),
    pages: doc.getPages().map((p) => {
      const box = p.getMediaBox()
      return {
        widthPt: box.width,
        heightPt: box.height,
        content: contentText(doc, p.node.get(PDFName.of('Contents'))),
      }
    }),
    imageCount,
    title: doc.getTitle(),
    producer: doc.getProducer(),
    author: doc.getAuthor(),
  }
}

/** Number of stroked straight-line paths ("x y m … x y l … S") in a content stream. */
export function countStrokedLines(content: string): number {
  return (content.match(/\bl\s+S\b/g) ?? []).length
}

/** Number of image draws ("/Name Do") in a content stream. */
export function countImageDraws(content: string): number {
  return (content.match(/\/\S+ Do\b/g) ?? []).length
}
