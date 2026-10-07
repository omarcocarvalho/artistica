import { describe, expect, it } from 'vitest'
import { DEFAULT_STUDY, tileStudyFor } from '../../../shared/model/study'
import { PT_PER_MM } from '../../../shared/model/units'
import { tileRenderKey } from '../pixels/tile-plan'
import { drawTile, pageModel } from '../test-support/fixtures'
import { TINY_JPEG, TINY_PNG, TINY_PNG_ALPHA, stripePng } from '../test-support/image-bytes'
import type { DrawTile, EncodedTileImage, PageModel } from '../types'
import {
  EmptyPdfError,
  MissingTileImageError,
  PDF_PRODUCER,
  PDF_TITLE,
  composePdf,
  toPdfRect,
} from './compose'
import {
  colourCountLimitPx,
  countImageDraws,
  countStrokedLines,
  distinctRgbColours,
  inspectPdf,
} from './inspect'

const jpeg: EncodedTileImage = { format: 'jpeg', bytes: TINY_JPEG, pxW: 2, pxH: 2 }
const png: EncodedTileImage = { format: 'png', bytes: TINY_PNG, pxW: 2, pxH: 2 }

const A4 = { w: 210, h: 297 }
const LETTER = { w: 215.9, h: 279.4 }

function encodedFor(
  pages: readonly PageModel[],
  img: EncodedTileImage = jpeg,
): Map<string, EncodedTileImage> {
  return new Map(pages.flatMap((p) => p.tiles.map((t) => [tileRenderKey(t), img] as const)))
}

describe('toPdfRect', () => {
  it('flips the y axis and converts mm to pt', () => {
    const r = toPdfRect({ x: 10, y: 20, w: 100, h: 50 }, 297)
    expect(r.x).toBeCloseTo(28.3465, 3)
    expect(r.y).toBeCloseTo((297 - 70) * (72 / 25.4), 3)
    expect(r.width).toBeCloseTo(283.4646, 3)
    expect(r.height).toBeCloseTo(141.7323, 3)
  })
})

describe('composePdf', () => {
  it('sizes A4 and Letter pages exactly', async () => {
    const pages = [
      pageModel([drawTile()], { size: A4 }),
      pageModel([drawTile()], { index: 1, size: LETTER }),
    ]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    expect(report.pageCount).toBe(2)
    expect(report.pages[0]?.widthPt).toBeCloseTo(595.28, 2)
    expect(report.pages[0]?.heightPt).toBeCloseTo(841.89, 2)
    expect(report.pages[1]?.widthPt).toBeCloseTo(612, 2)
    expect(report.pages[1]?.heightPt).toBeCloseTo(792, 2)
  })

  it('sizes landscape pages with width > height', async () => {
    const pages = [pageModel([drawTile()], { size: { w: 297, h: 210 } })]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    expect(report.pages[0]?.widthPt).toBeCloseTo(841.89, 2)
  })

  it('embeds each distinct tile image once and draws every tile', async () => {
    const a = drawTile()
    const copy = { ...a, trim: { ...a.trim, y: 100 } } // same render key → shared image
    const other = drawTile({ flipH: true, trim: { ...a.trim, y: 180 } })
    const pages = [pageModel([a, copy, other])]
    const encoded = new Map([
      [tileRenderKey(a), jpeg],
      [tileRenderKey(other), png],
    ])
    const report = await inspectPdf(await composePdf(pages, encoded))
    expect(report.imageCount).toBe(2)
    expect(countImageDraws(report.pages[0]?.content ?? '')).toBe(3)
  })

  it('draws crop marks as 0.25 pt registration-black vector lines', async () => {
    const pages = [
      pageModel([drawTile()], {
        cropMarks: [
          { x1: 19, y1: 20, x2: 15, y2: 20 },
          { x1: 20, y1: 19, x2: 20, y2: 15 },
        ],
      }),
    ]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    const content = report.pages[0]?.content ?? ''
    expect(countStrokedLines(content)).toBe(2)
    expect(content).toContain('1 1 1 1 K')
    expect(content).toContain('0.25 w')
  })

  it('flips crop-mark coordinates (asymmetric mark, non-square page) and draws them after images', async () => {
    const pages = [
      pageModel([drawTile()], {
        size: { w: 210, h: 297 },
        cropMarks: [
          { x1: 19, y1: 30, x2: 15, y2: 30 },
          { x1: 40, y1: 29, x2: 40, y2: 25 },
        ],
      }),
    ]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    const content = report.pages[0]?.content ?? ''
    const f = (mm: number): string => String(mm * PT_PER_MM)
    const y = f(297 - 30)
    expect(content).toContain(`${f(19)} ${y} m`)
    expect(content).toContain(`${f(15)} ${y} l`)
    expect(content).toContain(`${f(40)} ${f(297 - 29)} m`)
    expect(content).toContain(`${f(40)} ${f(297 - 25)} l`)
    const lastDo = content.lastIndexOf(' Do')
    const firstStroke = content.search(/\sS\s/)
    expect(lastDo).toBeGreaterThan(-1)
    expect(firstStroke).toBeGreaterThan(lastDo)
  })

  it('places the image at trim + bleed', async () => {
    const tile = drawTile({ trim: { x: 20, y: 20, w: 100, h: 50 }, bleedMm: 3 })
    const pages = [pageModel([tile])]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    const r = toPdfRect({ x: 17, y: 17, w: 106, h: 56 }, 297)
    // pdf-lib writes the translate and the scale as separate "cm" operators.
    const content = report.pages[0]?.content ?? ''
    expect(content).toContain(`1 0 0 1 ${String(r.x)} ${String(r.y)} cm`)
    expect(content).toContain(`${String(r.width)} 0 0 ${String(r.height)} 0 0 cm`)
  })

  it('counts an alpha PNG as one image, not image plus soft mask', async () => {
    const pages = [pageModel([drawTile()])]
    const enc = encodedFor(pages, { ...png, bytes: TINY_PNG_ALPHA })
    const report = await inspectPdf(await composePdf(pages, enc))
    expect(report.imageCount).toBe(1)
  })

  it('writes no dates or author into the file', async () => {
    const pages = [pageModel([drawTile()])]
    const raw = new TextDecoder('latin1').decode(await composePdf(pages, encodedFor(pages)))
    expect(raw).not.toContain('CreationDate')
    expect(raw).not.toContain('ModDate')
    expect(raw).not.toContain('/Author')
  })

  it('sets the title and producer and no author', async () => {
    const pages = [pageModel([drawTile()])]
    const report = await inspectPdf(await composePdf(pages, encodedFor(pages)))
    expect(report.title).toBe(PDF_TITLE)
    expect(report.producer).toBe(PDF_PRODUCER)
    expect(report.author).toBeUndefined()
  })

  it('refuses to produce a PDF without pages', async () => {
    await expect(composePdf([], new Map())).rejects.toBeInstanceOf(EmptyPdfError)
  })

  it('throws MissingTileImageError when a tile has no encoded image', async () => {
    await expect(composePdf([pageModel([drawTile()])], new Map())).rejects.toBeInstanceOf(
      MissingTileImageError,
    )
  })
})

const FIVE: [number, number, number][] = [
  [40, 30, 20],
  [90, 70, 50],
  [140, 115, 90],
  [190, 170, 145],
  [240, 232, 220],
]

describe('studies in the PDF (M2-R9)', () => {
  const at = (x: number) => ({ x, y: 20, w: 40, h: 60 })
  const original = drawTile({ trim: at(20) })
  const blurred = drawTile({
    trim: at(66),
    version: 'blurred',
    study: tileStudyFor('blurred', DEFAULT_STUDY),
  })
  const values = drawTile({
    trim: at(112),
    version: 'values',
    study: tileStudyFor('values', DEFAULT_STUDY),
  })
  const fivePng: EncodedTileImage = { format: 'png', bytes: stripePng(FIVE), pxW: 10, pxH: 2 }
  const studyImages = (order: readonly DrawTile[]): Map<string, EncodedTileImage> =>
    new Map(order.map((t) => [tileRenderKey(t), t === values ? fivePng : jpeg] as const))

  it('embeds the photo and the blur as JPEG and the 5-value study as a 5-colour PNG', async () => {
    const report = await inspectPdf(
      await composePdf(
        [pageModel([original, blurred, values])],
        studyImages([original, blurred, values]),
      ),
    )
    expect(report.imageCount).toBe(3)
    expect(report.images.map((i) => i.filter).sort()).toEqual([
      'DCTDecode',
      'DCTDecode',
      'FlateDecode',
    ])
    expect(report.images.find((i) => i.filter === 'FlateDecode')).toMatchObject({
      widthPx: 10,
      heightPx: 2,
      colours: 5,
    })
    expect(
      report.images.filter((i) => i.filter === 'DCTDecode').every((i) => i.colours === null),
    ).toBe(true)
    expect(countImageDraws(report.pages[0]?.content ?? '')).toBe(3)
  })

  it("lists each page's draws in content-stream order with their filters (D-CR2)", async () => {
    // The PNG is embedded first, so object order differs from draw order.
    const report = await inspectPdf(
      await composePdf(
        [pageModel([original, blurred, values])],
        studyImages([values, original, blurred]),
      ),
    )
    const draws = report.pages[0]?.draws ?? []
    expect(draws.map((d) => d.filter)).toEqual(['DCTDecode', 'DCTDecode', 'FlateDecode'])
    expect(draws[2]).toMatchObject({ widthPx: 10, heightPx: 2, colours: 5 })
    for (const d of draws) expect(report.pages[0]?.content).toContain(`/${d.name} Do`)
    expect(new Set(draws.map((d) => d.name)).size).toBe(3)
  })

  it('repeats a draw entry when one embedded image is drawn twice (copies)', async () => {
    const copy = { ...original, trim: { ...original.trim, y: 150 } }
    const report = await inspectPdf(
      await composePdf([pageModel([original, copy])], studyImages([original])),
    )
    const draws = report.pages[0]?.draws ?? []
    expect(draws).toHaveLength(2)
    expect(draws.map((d) => d.filter)).toEqual(['DCTDecode', 'DCTDecode'])
    expect(report.images).toHaveLength(1)
  })

  it('counts distinct colours per pixel, RGB and grey, up to 4 MP', () => {
    expect(distinctRgbColours(new Uint8Array(3 * 4), 4, 3)).toBe(1)
    expect(distinctRgbColours(new Uint8Array([1, 2, 3, 1, 2, 4]), 2, 3)).toBe(2)
    expect(distinctRgbColours(new Uint8Array([1, 2, 3, 1, 2, 3, 3, 2, 1]), 3, 3)).toBe(2)
    expect(distinctRgbColours(new Uint8Array([7, 7, 9]), 3, 1)).toBe(2)
    expect(colourCountLimitPx()).toBe(4_000_000)
  })

  it('does not count an alpha PNG soft mask in images[] or draws', async () => {
    const t = drawTile()
    const report = await inspectPdf(
      await composePdf(
        [pageModel([t])],
        new Map([[tileRenderKey(t), { format: 'png', bytes: TINY_PNG_ALPHA, pxW: 2, pxH: 2 }]]),
      ),
    )
    expect(report.images).toHaveLength(1)
    expect(report.pages[0]?.draws).toHaveLength(1)
  })
})
