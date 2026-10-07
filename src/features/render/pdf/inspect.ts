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
    /** Every stroked path, in content-stream order. */
    readonly strokes: readonly PdfStroke[]
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
        strokes: strokesOf(content, (name) => strokeOpacity(doc, p, name)),
      }
    }),
    imageCount: drawn.length,
    images: drawn.map(info),
    title: doc.getTitle(),
    producer: doc.getProducer(),
    author: doc.getAuthor(),
  }
}

/** Number of crop marks (registration-black strokes) in a content stream. */
export function countStrokedLines(content: string): number {
  return strokesOf(content, () => 1).filter(isRegistrationStroke).length
}

/** Number of image draws ("/Name Do") in a content stream. */
export function countImageDraws(content: string): number {
  return (content.match(/\/\S+ Do\b/g) ?? []).length
}

export interface PdfStroke {
  readonly colour: { readonly space: 'rgb' | 'cmyk' | 'gray'; readonly values: readonly number[] }
  readonly widthPt: number
  readonly dashPt: readonly number[]
  /** ExtGState /CA in effect, 1 when none. */
  readonly opacity: number
  /** The innermost clip's rect, in the user space it was written in (no CTM applied); null when there is no clip or that clip path is not one `re`. */
  readonly clip: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  } | null
  readonly cap: number
  readonly join: number
  /** Page pt, CTM applied. */
  readonly path: readonly PdfPathOp[]
}

export type PdfPathOp =
  | { readonly op: 'm' | 'l'; readonly x: number; readonly y: number }
  | {
      readonly op: 'c'
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      readonly x: number
      readonly y: number
    }

/** CMYK 1 1 1 1: a crop mark. */
export function isRegistrationStroke(s: PdfStroke): boolean {
  return (
    s.colour.space === 'cmyk' &&
    s.colour.values.length === 4 &&
    s.colour.values.every((v) => v === 1)
  )
}

function strokeOpacity(doc: PDFDocument, page: PDFPage, name: string): number | undefined {
  const states = page.node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict)
  const ref = states?.get(PDFName.of(name))
  const state = ref ? doc.context.lookup(ref) : undefined
  const ca = state instanceof PDFDict ? state.get(PDFName.of('CA')) : undefined
  return ca instanceof PDFNumber ? ca.asNumber() : undefined
}

type Operand = number | string | number[]

const DELIMITERS = '()<>[]{}/%'
const isSpace = (ch: string): boolean => /^[ \n\r\t\f\0]$/.test(ch)

/** Operands and operators of a content stream. Names lose their slash; strings, dicts and inline image data are skipped. */
function* operations(content: string): Generator<{ op: string; args: Operand[] }> {
  const n = content.length
  let i = 0
  let args: Operand[] = []
  let array: number[] | null = null
  const skipString = (): void => {
    let depth = 0
    for (; i < n; i++) {
      const ch = content[i]
      if (ch === '\\') i++
      else if (ch === '(') depth++
      else if (ch === ')' && --depth === 0) {
        i++
        return
      }
    }
  }
  const skipDict = (): void => {
    let depth = 0
    while (i < n) {
      if (content.startsWith('<<', i)) {
        depth++
        i += 2
      } else if (content.startsWith('>>', i)) {
        i += 2
        if (--depth === 0) return
      } else if (content[i] === '(') skipString()
      else i++
    }
  }
  while (i < n) {
    const ch = content[i] ?? ''
    if (isSpace(ch)) i++
    else if (ch === '%') {
      while (i < n && content[i] !== '\n' && content[i] !== '\r') i++
    } else if (ch === '(') skipString()
    else if (content.startsWith('<<', i)) skipDict()
    else if (ch === '<') i = content.indexOf('>', i) + 1 || n
    else if (ch === '[') {
      array = []
      i++
    } else if (ch === ']') {
      args.push(array ?? [])
      array = null
      i++
    } else {
      let j = i + 1
      while (j < n && !isSpace(content[j] ?? '') && !DELIMITERS.includes(content[j] ?? '')) j++
      const word = content.slice(i, j)
      i = j
      if (ch === '/') args.push(word.slice(1))
      else if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
        if (array) array.push(Number(word))
        else args.push(Number(word))
      } else if (word === 'ID') {
        const end = /\sEI(?=\s|$)/g
        end.lastIndex = i
        i = end.exec(content) ? end.lastIndex : n
        args = []
      } else {
        yield { op: word, args }
        args = []
      }
    }
  }
}

type Matrix = readonly [number, number, number, number, number, number]

const multiply = (m: Matrix, by: Matrix): Matrix => [
  m[0] * by[0] + m[1] * by[2],
  m[0] * by[1] + m[1] * by[3],
  m[2] * by[0] + m[3] * by[2],
  m[2] * by[1] + m[3] * by[3],
  m[4] * by[0] + m[5] * by[2] + by[4],
  m[4] * by[1] + m[5] * by[3] + by[5],
]

interface GState {
  ctm: Matrix
  colour: PdfStroke['colour']
  widthPt: number
  dashPt: readonly number[]
  opacity: number
  clip: PdfStroke['clip']
  cap: number
  join: number
}

/**
 * Every stroked path of a content stream, with the graphics state it was stroked in.
 * Fill-only painting (f, F, f*, n) discards the path; B, b and s stroke it too.
 */
export function strokesOf(
  content: string,
  extGStateOpacity: (name: string) => number | undefined,
): PdfStroke[] {
  const stack: GState[] = []
  let gs: GState = {
    ctm: [1, 0, 0, 1, 0, 0],
    colour: { space: 'gray', values: [0] },
    widthPt: 1,
    dashPt: [],
    opacity: 1,
    clip: null,
    cap: 0,
    join: 0,
  }
  let path: PdfPathOp[] = []
  let start: { x: number; y: number } | null = null
  let rect: PdfStroke['clip'] = null
  const out: PdfStroke[] = []
  const point = (x: number, y: number): { x: number; y: number } => {
    const [a, b, c, d, e, f] = gs.ctm
    return { x: a * x + c * y + e, y: b * x + d * y + f }
  }
  const moveTo = (x: number, y: number): void => {
    rect = null
    start = point(x, y)
    path.push({ op: 'm', ...start })
  }
  const close = (): void => {
    if (start) path.push({ op: 'l', ...start })
  }
  const paint = (strokes: boolean): void => {
    if (strokes && path.length > 0) {
      const { colour, widthPt, dashPt, opacity, clip, cap, join } = gs
      out.push({ colour, widthPt, dashPt, opacity, clip, cap, join, path })
    }
    path = []
    start = null
    rect = null
  }
  for (const { op, args } of operations(content)) {
    const v = args.filter((a): a is number => typeof a === 'number')
    switch (op) {
      case 'q':
        stack.push(gs)
        gs = { ...gs }
        break
      case 'Q':
        gs = stack.pop() ?? gs
        break
      case 'cm': {
        const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = v
        gs.ctm = multiply([a, b, c, d, e, f], gs.ctm)
        break
      }
      case 'w':
        gs.widthPt = v[0] ?? gs.widthPt
        break
      case 'J':
        gs.cap = v[0] ?? gs.cap
        break
      case 'j':
        gs.join = v[0] ?? gs.join
        break
      case 'd': {
        const dash = args[0]
        gs.dashPt = Array.isArray(dash) ? dash : []
        break
      }
      case 'RG':
        gs.colour = { space: 'rgb', values: v }
        break
      case 'K':
        gs.colour = { space: 'cmyk', values: v }
        break
      case 'G':
        gs.colour = { space: 'gray', values: v }
        break
      case 'gs': {
        const name = args[0]
        gs.opacity = (typeof name === 'string' ? extGStateOpacity(name) : undefined) ?? gs.opacity
        break
      }
      case 're': {
        const [x = 0, y = 0, w = 0, h = 0] = v
        const alone = path.length === 0
        moveTo(x, y)
        path.push({ op: 'l', ...point(x + w, y) })
        path.push({ op: 'l', ...point(x + w, y + h) })
        path.push({ op: 'l', ...point(x, y + h) })
        close()
        rect = alone ? { x, y, w, h } : null
        break
      }
      case 'W':
      case 'W*':
        gs.clip = rect
        break
      case 'm':
        moveTo(v[0] ?? 0, v[1] ?? 0)
        break
      case 'l':
        rect = null
        path.push({ op: 'l', ...point(v[0] ?? 0, v[1] ?? 0) })
        break
      case 'c': {
        rect = null
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x = 0, y = 0] = v
        const p1 = point(x1, y1)
        const p2 = point(x2, y2)
        path.push({ op: 'c', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...point(x, y) })
        break
      }
      case 'h':
        close()
        break
      case 'S':
      case 'B':
      case 'B*':
        paint(true)
        break
      case 's':
      case 'b':
      case 'b*':
        close()
        paint(true)
        break
      case 'f':
      case 'F':
      case 'f*':
      case 'n':
        paint(false)
        break
      default:
        break
    }
  }
  return out
}
