import { deflateSync } from 'node:zlib'
import {
  PDFDocument,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFContext,
  type PDFRef,
} from '@pdfme/pdf-lib'
import { describe, expect, it } from 'vitest'
import { colourCountLimitPx, inspectPdf } from './inspect'

type Embed = (context: PDFContext) => PDFRef

/** One page that draws each object once, in the given order. */
async function pdfDrawing(...objects: readonly Embed[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([100, 100])
  for (const embed of objects) {
    const name = page.node.newXObject('X', embed(doc.context))
    page.pushOperators(pushGraphicsState(), drawObject(name), popGraphicsState())
  }
  return doc.save()
}

interface ImageOptions {
  readonly filter?: string | string[] | null
  readonly colorSpace?: string
}

const image =
  (
    w: number,
    h: number,
    samples: Uint8Array,
    { filter = 'FlateDecode', colorSpace = 'DeviceRGB' }: ImageOptions = {},
  ): Embed =>
  (context) =>
    context.register(
      context.stream(filter === null ? samples : new Uint8Array(deflateSync(samples)), {
        Type: 'XObject',
        Subtype: 'Image',
        Width: w,
        Height: h,
        BitsPerComponent: 8,
        ColorSpace: colorSpace,
        ...(filter === null ? {} : { Filter: filter }),
      }),
    )

/** RGB samples: the first pixel black, every other pixel white (two colours). */
function twoColours(pixels: number): Uint8Array {
  const samples = new Uint8Array(pixels * 3).fill(255)
  samples.fill(0, 0, 3)
  return samples
}

describe('inspectPdf images and draws', () => {
  it('counts colours up to exactly 4 MP and reports null above it', async () => {
    expect(colourCountLimitPx()).toBe(2000 * 2000)
    const report = await inspectPdf(
      await pdfDrawing(
        image(2000, 2000, twoColours(2000 * 2000)),
        image(2000, 2001, twoColours(2000 * 2001)),
      ),
    )
    expect(report.pages[0]?.draws.map((d) => [d.widthPx, d.heightPx, d.colours])).toEqual([
      [2000, 2000, 2],
      [2000, 2001, null],
    ])
  })

  it('reads a filter given as an array and counts grey samples as one channel', async () => {
    const report = await inspectPdf(
      await pdfDrawing(
        image(2, 1, twoColours(2), { filter: ['FlateDecode'] }),
        image(4, 1, new Uint8Array([7, 9, 9, 9]), { colorSpace: 'DeviceGray' }),
      ),
    )
    expect(report.images).toEqual([
      { filter: 'FlateDecode', widthPx: 2, heightPx: 1, colours: 2 },
      { filter: 'FlateDecode', widthPx: 4, heightPx: 1, colours: 2 },
    ])
  })

  it('counts colours only for FlateDecode images', async () => {
    const report = await inspectPdf(await pdfDrawing(image(2, 1, twoColours(2), { filter: null })))
    expect(report.images).toEqual([{ filter: '', widthPx: 2, heightPx: 1, colours: null }])
  })

  it('lists only image XObjects in draws, not a drawn form XObject', async () => {
    const form: Embed = (context) =>
      context.register(context.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1] }))
    const report = await inspectPdf(await pdfDrawing(form, image(2, 1, twoColours(2)), form))
    expect(report.pages[0]?.draws.map((d) => d.widthPx)).toEqual([2])
  })
})
