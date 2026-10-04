import { describe, expect, it } from 'vitest'
import { tileRenderKey } from '../pixels/tile-plan'
import { drawTile, pageModel } from '../test-support/fixtures'
import { TINY_JPEG, TINY_PNG } from '../test-support/image-bytes'
import type { EncodedTileImage, PageModel } from '../types'
import {
  EmptyPdfError,
  MissingTileImageError,
  PDF_PRODUCER,
  PDF_TITLE,
  composePdf,
  toPdfRect,
} from './compose'
import { countImageDraws, countStrokedLines, inspectPdf } from './inspect'

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
