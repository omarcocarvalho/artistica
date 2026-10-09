import { createHash } from 'node:crypto'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} from '@pdfme/pdf-lib'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LINES, patchLines, type LinesPatch } from '../../../shared/model/lines'
import { PT_PER_MM } from '../../../shared/model/units'
import { centreDashMm } from '../../lines/geometry'
import { type ImageGuides } from '../../lines/guides/types'
import type { PathCmd } from '../../lines/types'
import type { RectMm } from '../../layout/types'
import { tileLinesFor } from '../page-model/tile-lines'
import { tileRenderKey } from '../pixels/tile-plan'
import {
  compositionLinesFor,
  descriptor,
  drawTile,
  EVERY_GUIDE,
  guidesFixture,
  pageModel,
  PORTRAIT_PX,
  worstCaseGuides,
} from '../test-support/fixtures'
import { TINY_JPEG } from '../test-support/image-bytes'
import type { EncodedTileImage, PageModel, TileLines } from '../types'
import { composePdf, toPdfRect } from './compose'
import {
  countStrokedLines,
  inspectPdf,
  isRegistrationStroke,
  type PdfPathOp,
  type PdfStroke,
} from './inspect'

const jpeg: EncodedTileImage = { format: 'jpeg', bytes: TINY_JPEG, pxW: 2, pxH: 2 }

function encodedFor(pages: readonly PageModel[]): Map<string, EncodedTileImage> {
  return new Map(pages.flatMap((p) => p.tiles.map((t) => [tileRenderKey(t), jpeg] as const)))
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const pt = (mm: number): number => mm * PT_PER_MM

function at<T>(xs: readonly T[] | undefined, i: number): T {
  const x = xs?.[i]
  if (x === undefined) throw new Error(`no element ${String(i)}`)
  return x
}

function linesFor(patch: LinesPatch, trim: RectMm, tileIndex = 0, turned = false): TileLines {
  const tl = compositionLinesFor(patchLines(DEFAULT_LINES, patch), trim, turned, tileIndex)
  if (!tl) throw new Error('no lines')
  return tl
}

const EVERY_TYPE: LinesPatch = {
  grid: { on: true, cols: 4, rows: 5 },
  thirds: true,
  armature: true,
  golden: true,
  spiral: { on: true, corner: 'topRight' },
  centre: true,
}
const BLUE = { colour: '#1f3fbf', widthMm: 1.5, opacityPct: 100 }

const noLinesPages = (): PageModel[] => [
  pageModel(
    [
      drawTile({ trim: { x: 20, y: 30, w: 90, h: 60 } }),
      drawTile({ trim: { x: 20, y: 110, w: 90, h: 60 }, flipH: true }),
    ],
    {
      cropMarks: [
        { x1: 19, y1: 30, x2: 15, y2: 30 },
        { x1: 20, y1: 29, x2: 20, y2: 25 },
      ],
    },
  ),
  pageModel([drawTile({ trim: { x: 30, y: 40, w: 50, h: 70 }, bleedMm: 3 })], { index: 1 }),
]

/** noLinesPages with every type on every tile. */
const withLines = (pages: readonly PageModel[], patch: LinesPatch = EVERY_TYPE): PageModel[] =>
  pages.map((p) => ({ ...p, lines: p.tiles.map((t, i) => linesFor(patch, t.trim, i)) }))

async function strokesOfPage(pages: readonly PageModel[], page = 0): Promise<PdfStroke[]> {
  const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
  return [...at(report.pages, page).strokes]
}

/** Raw stored bytes of every image XObject, in object order. */
async function imageStreams(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const out: string[] = []
  for (const [, obj] of doc.context.enumerateIndirectObjects())
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
      out.push(sha256(obj.contents))
  return out
}

/** /CA of each ExtGState resource on each page. */
async function extGStates(bytes: Uint8Array): Promise<number[][]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.getPages().map((p) => {
    const states = p.node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict)
    return (states?.values() ?? []).map((ref) => {
      const state = doc.context.lookup(ref)
      const ca = state instanceof PDFDict ? state.get(PDFName.of('CA')) : undefined
      return ca instanceof PDFNumber ? ca.asNumber() : Number.NaN
    })
  })
}

/** A PDF path op back in page mm (y down), to compare with a PathCmd. */
function toMm(op: PdfPathOp, pageH: number): PathCmd {
  const x = (v: number): number => v / PT_PER_MM
  const y = (v: number): number => pageH - v / PT_PER_MM
  if (op.op === 'c')
    return {
      op: 'C',
      x1: x(op.x1),
      y1: y(op.y1),
      x2: x(op.x2),
      y2: y(op.y2),
      x: x(op.x),
      y: y(op.y),
    }
  return { op: op.op === 'm' ? 'M' : 'L', x: x(op.x), y: y(op.y) }
}

function expectCmdsClose(actual: readonly PathCmd[], expected: readonly PathCmd[]): void {
  expect(actual.map((c) => c.op)).toEqual(expected.map((c) => c.op))
  expected.forEach((e, i) => {
    const a = at(actual, i)
    for (const [k, v] of Object.entries(e))
      if (typeof v === 'number')
        expect(Math.abs(((a as Record<string, unknown>)[k] as number) - v)).toBeLessThan(0.001)
  })
}

describe('composePdf without lines', () => {
  it('writes exactly the bytes it wrote before lines existed', async () => {
    const pages = noLinesPages()
    const bytes = await composePdf(pages, encodedFor(pages))
    expect(sha256(bytes)).toBe('8a2bed03d7a1b018a2bc4a8551b2e5c9f80f5cc31c25d482b5052a6226105231')
    const report = await inspectPdf(bytes)
    expect(report.pages.map((p) => p.content)).toMatchSnapshot()
  })
})

describe('composePdf lines (M3-R6–R8)', () => {
  const trim = { x: 20, y: 30, w: 90, h: 60 }

  it('writes the exact operator block for one tile', async () => {
    const tl: TileLines = {
      tileIndex: 0,
      clip: { x: 10, y: 20, w: 40, h: 30 },
      colour: '#ff8000',
      opacity: 0.5,
      widthMm: 0.5,
      types: ['thirds', 'centre'],
      strokes: [
        {
          dashMm: [],
          cmds: [
            { op: 'M', x: 10, y: 20 },
            { op: 'L', x: 50, y: 50 },
            { op: 'C', x1: 15, y1: 25, x2: 20, y2: 30, x: 25, y: 35 },
          ],
        },
        {
          dashMm: [2, 1],
          cmds: [
            { op: 'M', x: 30, y: 20 },
            { op: 'L', x: 30, y: 50 },
          ],
        },
      ],
    }
    const pages = [
      pageModel([drawTile({ trim: tl.clip })], { lines: [tl], size: { w: 100, h: 100 } }),
    ]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    const content = at(report.pages, 0).content
    expect(content.slice(content.indexOf('Do\nQ\n') + 5)).toMatchInlineSnapshot(`
      "q
      28.34645669291339 141.73228346456693 113.38582677165356 85.03937007874016 re
      W
      n
      1 0.5019607843137255 0 RG
      1.4173228346456694 w
      0 J
      0 j
      /GS0 gs
      [] 0 d
      28.34645669291339 226.7716535433071 m
      141.73228346456693 141.73228346456693 l
      42.51968503937008 212.59842519685043 56.69291338582678 198.42519685039372 70.86614173228347 184.25196850393704 c
      S
      [5.669291338582678 2.834645669291339] 0 d
      85.03937007874016 226.7716535433071 m
      85.03937007874016 141.73228346456693 l
      S
      Q
      "
    `)
  })

  it('draws lines after every image and before every crop mark', async () => {
    const pages = withLines(noLinesPages())
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    const page = at(report.pages, 0)
    expect(page.content.lastIndexOf(' Do')).toBeLessThan(page.content.indexOf(' re'))
    expect(page.strokes.map(isRegistrationStroke)).toEqual([false, false, false, false, true, true])
  })

  it('clips each tile’s lines to its trim, never the bleed', async () => {
    const tile = drawTile({ trim, bleedMm: 3 })
    const pages = [pageModel([tile], { lines: [linesFor({ thirds: true }, trim)] })]
    const stroke = at(await strokesOfPage(pages), 0)
    const r = toPdfRect(trim, 297)
    expect(stroke.clip).toEqual({ x: r.x, y: r.y, w: r.width, h: r.height })
  })

  it('gives each tile its own clip, in tile order', async () => {
    const pages = withLines(noLinesPages(), { thirds: true })
    const clips = (await strokesOfPage(pages))
      .filter((s) => !isRegistrationStroke(s))
      .map((s) => s.clip)
    const tiles = at(pages, 0).tiles
    expect(clips).toEqual(
      tiles.map((t) => {
        const r = toPdfRect(t.trim, 297)
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )
  })

  it('leaves the miter limit at the PDF default of 10, as the preview sets it', async () => {
    const pages = withLines(noLinesPages(), { ...EVERY_TYPE, style: { ...BLUE, opacityPct: 60 } })
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    const contents = report.pages.map((p) => p.content)
    expect(contents.join('\n')).toMatch(/\sS\s/)
    for (const content of contents) expect(content).not.toMatch(/(^|\s)M(\s|$)/)
  })

  it('strokes the solid batch then the dashed batch, in the exact colour, width, caps and dash', async () => {
    const pages = [
      pageModel([drawTile({ trim })], {
        lines: [linesFor({ thirds: true, centre: true, style: BLUE }, trim)],
      }),
    ]
    const [solid, dashed, ...rest] = await strokesOfPage(pages)
    expect(rest).toEqual([])
    for (const s of [solid, dashed]) {
      expect(s?.colour).toEqual({ space: 'rgb', values: [31 / 255, 63 / 255, 191 / 255] })
      expect(s?.widthPt).toBe(pt(1.5))
      expect(s?.opacity).toBe(1)
      expect([s?.cap, s?.join]).toEqual([0, 0])
    }
    expect(solid?.dashPt).toEqual([])
    expect(dashed?.dashPt).toEqual(centreDashMm(1.5).map(pt))
  })

  it('round-trips the page-model geometry within 0.001 mm, curves as c', async () => {
    const tl = linesFor(EVERY_TYPE, trim, 0, true)
    const pages = [pageModel([drawTile({ trim })], { lines: [tl] })]
    const strokes = await strokesOfPage(pages)
    expect(strokes).toHaveLength(tl.strokes.length)
    tl.strokes.forEach((s, k) => {
      expectCmdsClose(
        at(strokes, k).path.map((op) => toMm(op, 297)),
        s.cmds,
      )
    })
    const curves = tl.strokes.flatMap((s) => s.cmds).filter((c) => c.op === 'C').length
    expect(curves).toBeGreaterThan(0)
    expect(strokes.flatMap((s) => s.path).filter((op) => op.op === 'c')).toHaveLength(curves)
  })

  it('writes an ExtGState only below 100%, one per distinct opacity per page', async () => {
    const at90 = { ...BLUE, opacityPct: 90 }
    const pages = [
      pageModel(
        [
          drawTile({ trim }),
          drawTile({ trim: { ...trim, y: 110 } }),
          drawTile({ trim: { ...trim, y: 190 } }),
        ],
        {
          lines: [
            linesFor({ thirds: true, centre: true, style: at90 }, trim, 0),
            linesFor({ thirds: true, style: at90 }, { ...trim, y: 110 }, 1),
            linesFor({ thirds: true, style: { ...BLUE, opacityPct: 40 } }, { ...trim, y: 190 }, 2),
          ],
        },
      ),
      pageModel([drawTile({ trim })], {
        index: 1,
        lines: [linesFor({ thirds: true, style: at90 }, trim)],
      }),
      pageModel([drawTile({ trim })], {
        index: 2,
        lines: [linesFor({ thirds: true, style: BLUE }, trim)],
      }),
    ]
    const bytes = await composePdf(pages, encodedFor(pages))
    expect(await extGStates(bytes)).toEqual([[0.9, 0.4], [0.9], []])
    const report = await inspectPdf(bytes)
    expect(at(report.pages, 0).strokes.map((s) => s.opacity)).toEqual([0.9, 0.9, 0.9, 0.4])
    expect(at(report.pages, 2).content).not.toMatch(/\sgs\s/)
    expect(at(report.pages, 2).strokes.map((s) => s.opacity)).toEqual([1])
  })

  it('embeds byte-identical images with lines on and off', async () => {
    const off = noLinesPages()
    const on = withLines(off)
    const offBytes = await composePdf(off, encodedFor(off))
    const onBytes = await composePdf(on, encodedFor(on))
    const offImages = await imageStreams(offBytes)
    expect(offImages).toHaveLength(3)
    expect(await imageStreams(onBytes)).toEqual(offImages)
    const draws = async (b: Uint8Array) =>
      (await inspectPdf(b)).pages.map((p) =>
        p.draws.map((d) => [d.name, d.filter, d.widthPx, d.heightPx]),
      )
    expect(await draws(onBytes)).toEqual(await draws(offBytes))
  })

  it('leaves every image draw unchanged when an earlier page has translucent lines', async () => {
    const off = noLinesPages()
    const on = withLines(off, { thirds: true, style: { ...BLUE, opacityPct: 50 } })
    const imageDraws = async (pages: PageModel[]) =>
      (await inspectPdf(await composePdf(pages, encodedFor(pages)))).pages.map((p) =>
        p.content.slice(0, p.content.lastIndexOf(' Do')),
      )
    expect(await imageDraws(on)).toEqual(await imageDraws(off))
  })

  it('names a page’s ExtGStates GS0, GS1… in order of first use', async () => {
    const pages = [
      pageModel([drawTile({ trim }), drawTile({ trim: { ...trim, y: 110 } })], {
        lines: [
          linesFor({ thirds: true, style: { ...BLUE, opacityPct: 40 } }, trim, 0),
          linesFor({ thirds: true, style: { ...BLUE, opacityPct: 90 } }, { ...trim, y: 110 }, 1),
        ],
      }),
    ]
    const content = at(
      (await inspectPdf(await composePdf(pages, encodedFor(pages)))).pages,
      0,
    ).content
    expect([...content.matchAll(/^\/(\S+) gs$/gm)].map((m) => m[1])).toEqual(['GS0', 'GS1'])
  })

  it('keeps the crop-mark count with lines on', async () => {
    const off = noLinesPages()
    const on = withLines(off)
    const count = async (pages: PageModel[]) =>
      (await inspectPdf(await composePdf(pages, encodedFor(pages)))).pages.map((p) =>
        countStrokedLines(p.content),
      )
    expect(await count(on)).toEqual([2, 0])
    expect(await count(off)).toEqual([2, 0])
  })

  it('writes the same bytes for the same input', async () => {
    const pages = withLines(noLinesPages(), { ...EVERY_TYPE, style: { ...BLUE, opacityPct: 60 } })
    const a = await composePdf(pages, encodedFor(pages))
    const b = await composePdf(pages, encodedFor(pages))
    expect(sha256(a)).toBe(sha256(b))
  })
})

describe('composePdf guides (M4-R11, R12, R16)', () => {
  const trim = { x: 20, y: 30, w: 60, h: 90 }
  const portrait = (patch: LinesPatch) => ({
    ...descriptor('a', PORTRAIT_PX.w, PORTRAIT_PX.h),
    lines: patchLines(DEFAULT_LINES, patch),
  })
  const guided = (patch: LinesPatch, guides: ImageGuides, t: RectMm = trim, i = 0): TileLines => {
    const tl = tileLinesFor(portrait(patch), guides, t, false, i)
    if (!tl) throw new Error('no lines')
    return tl
  }

  /** Stored (flate) length of each page's content stream. */
  async function contentBytes(bytes: Uint8Array): Promise<number[]> {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    return doc.getPages().map((p) => {
      const contents = p.node.Contents()
      const streams = contents instanceof PDFArray ? contents.asArray() : [contents]
      return streams.reduce((n, ref) => {
        const s = ref instanceof PDFRef ? doc.context.lookup(ref) : ref
        if (!(s instanceof PDFRawStream)) throw new Error('not a raw stream')
        expect(s.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'))
        return n + s.contents.length
      }, 0)
    })
  }

  it('a tile with guides is still one solid stroke and one dashed stroke', async () => {
    const tl = guided({ ...EVERY_GUIDE, thirds: true, centre: true }, guidesFixture())
    expect(tl.types).toEqual(['thirds', 'centre', 'edges', 'face', 'pose'])
    const pages = [pageModel([drawTile({ trim })], { lines: [tl] })]
    const strokes = await strokesOfPage(pages)
    expect(strokes.map((s) => s.dashPt.length > 0)).toEqual([false, true])
  })

  it('draws the guides after every image and before every crop mark, clipped to the trim', async () => {
    const tl = guided(EVERY_GUIDE, guidesFixture())
    const pages = [
      pageModel([drawTile({ trim, bleedMm: 3 })], {
        lines: [tl],
        cropMarks: [{ x1: 19, y1: 30, x2: 15, y2: 30 }],
      }),
    ]
    const page = at((await inspectPdf(await composePdf(pages, encodedFor(pages)))).pages, 0)
    expect(page.content.lastIndexOf(' Do')).toBeLessThan(page.content.indexOf(' re'))
    expect(page.strokes.map(isRegistrationStroke)).toEqual([false, true])
    const r = toPdfRect(trim, 297)
    expect(at(page.strokes, 0).clip).toEqual({ x: r.x, y: r.y, w: r.width, h: r.height })
  })

  it('round-trips the guide geometry within 0.001 mm: joints as stroked circles, no fill', async () => {
    const tl = guided({ ...EVERY_GUIDE, style: { widthMm: 0.8 } }, guidesFixture())
    const pages = [pageModel([drawTile({ trim })], { lines: [tl] })]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    const strokes = at(report.pages, 0).strokes
    expect(strokes).toHaveLength(1)
    expect(at(strokes, 0).widthPt).toBe(pt(0.8))
    expectCmdsClose(
      at(strokes, 0).path.map((op) => toMm(op, 297)),
      at(tl.strokes, 0).cmds,
    )
    expect(at(report.pages, 0).content).not.toMatch(/(^|\s)(f|f\*|B|B\*|b|b\*)(\s|$)/)
  })

  it('embeds byte-identical images with guides on and off', async () => {
    const off = [pageModel([drawTile({ trim })])]
    const on = [{ ...at(off, 0), lines: [guided(EVERY_GUIDE, guidesFixture())] }]
    expect(await imageStreams(await composePdf(on, encodedFor(on)))).toEqual(
      await imageStreams(await composePdf(off, encodedFor(off))),
    )
  })

  it('the PDF content of a tile with 4000 edge vertices is ≤ 120 KB after flate (M4-R16)', async () => {
    const tl = guided(
      { ...EVERY_GUIDE, ...EVERY_TYPE, style: { widthMm: 0.35 } },
      worstCaseGuides(),
    )
    expect(tl.strokes.reduce((n, s) => n + s.cmds.length, 0)).toBeGreaterThan(4000)
    const pages = [pageModel([drawTile({ trim })], { lines: [tl] })]
    const [bytes = Infinity] = await contentBytes(await composePdf(pages, encodedFor(pages)))
    console.info(`[pdf size] worst-case guide tile: ${String(bytes)} B of content after flate`)
    expect(bytes).toBeLessThanOrEqual(120 * 1024)
  })
})
