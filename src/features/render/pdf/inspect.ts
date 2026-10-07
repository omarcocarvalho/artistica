import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
  type PDFObject,
  type PDFPage,
} from '@pdfme/pdf-lib'

export interface PdfImageInfo {
  /** /Filter name without the slash: 'DCTDecode' (JPEG) or 'FlateDecode' (PNG). */
  readonly filter: string
  readonly widthPx: number
  readonly heightPx: number
  /** Distinct colours of a FlateDecode image up to colourCountLimitPx(); otherwise null. */
  readonly colours: number | null
}

export interface PdfDrawInfo extends PdfImageInfo {
  /** The XObject resource name the page's `Do` operator uses. */
  readonly name: string
}

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
    /** One entry per `Do` of an image, in content-stream order (an image drawn twice appears twice). */
    readonly draws: readonly PdfDrawInfo[]
  }[]
  /** Image XObjects in the file (each embedded image counts once, however often it is drawn). */
  readonly imageCount: number
  /** The same images as imageCount, in object order. */
  readonly images: readonly PdfImageInfo[]
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

const COLOUR_COUNT_LIMIT_PX = 4_000_000
export const colourCountLimitPx = (): number => COLOUR_COUNT_LIMIT_PX

/** Distinct colours in packed 8-bit samples with `channels` per pixel (3 = RGB, 1 = grey). */
export function distinctRgbColours(samples: Uint8Array, pixels: number, channels: number): number {
  const seen = new Set<number>()
  for (let i = 0; i < pixels; i++) {
    const o = i * channels
    seen.add(
      channels >= 3
        ? ((samples[o] ?? 0) << 16) | ((samples[o + 1] ?? 0) << 8) | (samples[o + 2] ?? 0)
        : (samples[o] ?? 0),
    )
  }
  return seen.size
}

function imageInfo(img: PDFRawStream): PdfImageInfo {
  const num = (key: string): number => {
    const v = img.dict.get(PDFName.of(key))
    return v instanceof PDFNumber ? v.asNumber() : 0
  }
  const f = img.dict.get(PDFName.of('Filter'))
  const first = f instanceof PDFArray ? f.get(0) : f
  const filter = first instanceof PDFName ? first.decodeText() : ''
  const w = num('Width')
  const h = num('Height')
  let colours: number | null = null
  if (filter === 'FlateDecode' && w * h <= COLOUR_COUNT_LIMIT_PX) {
    const channels = img.dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceGray') ? 1 : 3
    colours = distinctRgbColours(decodePDFRawStream(img).decode(), w * h, channels)
  }
  return { filter, widthPx: w, heightPx: h, colours }
}

function pageDraws(
  doc: PDFDocument,
  page: PDFPage,
  content: string,
  info: (img: PDFRawStream) => PdfImageInfo,
): PdfDrawInfo[] {
  const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  return [...content.matchAll(/\/(\S+) Do\b/g)].flatMap((m) => {
    const name = m[1] ?? ''
    const ref = xobjects?.get(PDFName.of(name))
    const obj = ref ? doc.context.lookup(ref) : undefined
    return obj instanceof PDFRawStream &&
      obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')
      ? [{ name, ...info(obj) }]
      : []
  })
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
      const maskObj = mask ? doc.context.lookup(mask) : undefined
      if (maskObj) softMasks.add(maskObj)
    }
  }
  // An alpha channel is a second Image stream referenced only as /SMask: not a drawn image.
  const drawn = images.filter((img) => !softMasks.has(img))
  const infos = new Map<PDFRawStream, PdfImageInfo>()
  const info = (img: PDFRawStream): PdfImageInfo => {
    const known = infos.get(img)
    if (known) return known
    const fresh = imageInfo(img)
    infos.set(img, fresh)
    return fresh
  }
  return {
    pageCount: doc.getPageCount(),
    pages: doc.getPages().map((p) => {
      const box = p.getMediaBox()
      const content = contentText(doc, p.node.get(PDFName.of('Contents')))
      return {
        widthPt: box.width,
        heightPt: box.height,
        content,
        draws: pageDraws(doc, p, content, info),
      }
    }),
    imageCount: drawn.length,
    images: drawn.map(info),
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
