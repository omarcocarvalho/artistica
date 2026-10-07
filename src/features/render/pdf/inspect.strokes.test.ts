import {
  PDFDocument,
  appendBezierCurve,
  clip,
  closePath,
  cmyk,
  concatTransformationMatrix,
  drawObject,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setDashPattern,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingCmykColor,
  setStrokingGrayscaleColor,
  setStrokingRgbColor,
  stroke,
  LineCapStyle,
  LineJoinStyle,
  rgb,
  type PDFOperator,
  type PDFPage,
} from '@pdfme/pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  countStrokedLines,
  inspectPdf,
  isRegistrationStroke,
  strokesOf,
  type PdfStroke,
} from './inspect'

async function strokesDrawnBy(
  build: (doc: PDFDocument, page: PDFPage) => PDFOperator[],
): Promise<{ strokes: readonly PdfStroke[]; content: string }> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([200, 200])
  page.pushOperators(...build(doc, page))
  const report = await inspectPdf(await doc.save())
  const p = report.pages[0]
  if (!p) throw new Error('no page')
  return { strokes: p.strokes, content: p.content }
}

function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i]
  if (x === undefined) throw new Error(`no element ${String(i)}`)
  return x
}

describe('inspectPdf strokes', () => {
  it('reads one clipped RGB stroke with its lines and curve', async () => {
    const { strokes } = await strokesDrawnBy(() => [
      pushGraphicsState(),
      rectangle(10, 20, 30, 40),
      clip(),
      endPath(),
      setStrokingRgbColor(0.25, 0.5, 0.75),
      setLineWidth(2.5),
      setLineCap(LineCapStyle.Butt),
      setLineJoin(LineJoinStyle.Miter),
      setDashPattern([], 0),
      moveTo(11, 21),
      lineTo(12, 22),
      appendBezierCurve(13, 23, 14, 24, 15, 25),
      stroke(),
      popGraphicsState(),
    ])
    expect(strokes).toEqual([
      {
        colour: { space: 'rgb', values: [0.25, 0.5, 0.75] },
        widthPt: 2.5,
        dashPt: [],
        opacity: 1,
        clip: { x: 10, y: 20, w: 30, h: 40 },
        cap: 0,
        join: 0,
        path: [
          { op: 'm', x: 11, y: 21 },
          { op: 'l', x: 12, y: 22 },
          { op: 'c', x1: 13, y1: 23, x2: 14, y2: 24, x: 15, y: 25 },
        ],
      },
    ])
  })

  it('reads the dash array, round caps and bevel joins', async () => {
    const { strokes } = await strokesDrawnBy(() => [
      setDashPattern([3, 1.5], 0),
      setLineCap(LineCapStyle.Round),
      setLineJoin(LineJoinStyle.Bevel),
      moveTo(0, 0),
      lineTo(1, 1),
      stroke(),
    ])
    expect(at(strokes, 0)).toMatchObject({ dashPt: [3, 1.5], cap: 1, join: 2, clip: null })
  })

  it('reads the ExtGState opacity and drops it again after Q', async () => {
    const { strokes } = await strokesDrawnBy((doc, page) => {
      const gs = page.node.newExtGState('GS', doc.context.obj({ Type: 'ExtGState', CA: 0.5 }))
      return [
        pushGraphicsState(),
        setGraphicsState(gs),
        setLineWidth(4),
        moveTo(0, 0),
        lineTo(1, 1),
        stroke(),
        popGraphicsState(),
        moveTo(2, 2),
        lineTo(3, 3),
        stroke(),
      ]
    })
    expect(strokes.map((s) => [s.opacity, s.widthPt])).toEqual([
      [0.5, 4],
      [1, 1],
    ])
  })

  it('reads opacity 1 for an ExtGState without /CA or a name that is not a resource', () => {
    expect(strokesOf('/GS-1 gs\n0 0 m\n1 1 l\nS', () => 1).map((s) => s.opacity)).toEqual([1])
  })

  it('applies the CTM to path points', async () => {
    const { strokes } = await strokesDrawnBy(() => [
      pushGraphicsState(),
      concatTransformationMatrix(1, 0, 0, 1, 10, 20),
      concatTransformationMatrix(2, 0, 0, 3, 0, 0),
      moveTo(1, 1),
      appendBezierCurve(1, 2, 2, 2, 2, 1),
      stroke(),
      popGraphicsState(),
    ])
    expect(at(strokes, 0).path).toEqual([
      { op: 'm', x: 12, y: 23 },
      { op: 'c', x1: 12, y1: 26, x2: 14, y2: 26, x: 14, y: 23 },
    ])
  })

  it('does not leak an image draw’s CTM into the next stroke', async () => {
    const { strokes } = await strokesDrawnBy((doc, page) => {
      const form = doc.context.register(
        doc.context.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1] }),
      )
      const name = page.node.newXObject('X', form)
      return [
        moveTo(1, 1),
        lineTo(2, 2),
        stroke(),
        pushGraphicsState(),
        concatTransformationMatrix(50, 0, 0, 50, 7, 7),
        drawObject(name),
        popGraphicsState(),
        moveTo(1, 1),
        lineTo(2, 2),
        stroke(),
      ]
    })
    expect(strokes.map((s) => s.path)).toEqual([
      [
        { op: 'm', x: 1, y: 1 },
        { op: 'l', x: 2, y: 2 },
      ],
      [
        { op: 'm', x: 1, y: 1 },
        { op: 'l', x: 2, y: 2 },
      ],
    ])
  })

  it('discards a filled path and closes a subpath back to its start', async () => {
    const { strokes } = await strokesDrawnBy(() => [
      rectangle(0, 0, 5, 5),
      fill(),
      moveTo(1, 1),
      lineTo(4, 1),
      lineTo(4, 4),
      closePath(),
      stroke(),
    ])
    expect(strokes.map((s) => s.path)).toEqual([
      [
        { op: 'm', x: 1, y: 1 },
        { op: 'l', x: 4, y: 1 },
        { op: 'l', x: 4, y: 4 },
        { op: 'l', x: 1, y: 1 },
      ],
    ])
  })

  it('ignores fill colours, text and its strings', () => {
    const content =
      '0.2 g\n1 0 0 rg\nBT\n/F1 12 Tf\n(a \\) 5 5 m 6 6 l S) Tj [ (7 7 m 8 8 l S) -2 ] TJ\nET\n% 9 9 m 9 8 l S\n0 0 m\n1 1 l\nS'
    const strokes = strokesOf(content, () => 1)
    expect(strokes).toHaveLength(1)
    expect(at(strokes, 0).colour).toEqual({ space: 'gray', values: [0] })
  })

  it('skips marked-content dicts, hex strings and inline image data', () => {
    const content = [
      '/Span << /ActualText (1 1 m 2 2 l S) /Nested << /A <3 3 m S> >> >> BDC',
      '<4c S> Tj',
      'EMC',
      'BI /W 2 /H 1 /CS /G /BPC 8 ID 9 9 m 9 8 l S EI',
      '0 0 m 1 1 l S',
    ].join('\n')
    expect(strokesOf(content, () => 1).map((s) => s.path)).toEqual([
      [
        { op: 'm', x: 0, y: 0 },
        { op: 'l', x: 1, y: 1 },
      ],
    ])
  })

  it('strokes B, B*, b, b* and s paths, closing the last three', () => {
    const content = ['B', 'B*', 'b', 'b*', 's'].map((op) => `0 0 m 2 0 l 2 2 l ${op}`).join('\n')
    expect(strokesOf(content, () => 1).map((s) => s.path.length)).toEqual([3, 3, 4, 4, 4])
  })

  it('takes an even-odd clip from its rect too', () => {
    const [s] = strokesOf('1 2 3 4 re W* n 0 0 m 1 1 l S', () => 1)
    expect(s?.clip).toEqual({ x: 1, y: 2, w: 3, h: 4 })
  })

  it('tells registration-black crop marks from coloured strokes', async () => {
    const { strokes, content } = await strokesDrawnBy((_doc, page) => {
      page.drawLine({
        start: { x: 1, y: 1 },
        end: { x: 9, y: 1 },
        thickness: 0.25,
        color: cmyk(1, 1, 1, 1),
      })
      page.drawLine({ start: { x: 1, y: 5 }, end: { x: 9, y: 5 }, color: rgb(1, 0, 0) })
      return [
        setStrokingCmykColor(0, 0, 0, 1),
        moveTo(0, 0),
        lineTo(1, 1),
        stroke(),
        setStrokingGrayscaleColor(0),
        moveTo(0, 0),
        lineTo(1, 1),
        stroke(),
      ]
    })
    expect(strokes.map((s) => s.colour.space)).toEqual(['cmyk', 'rgb', 'cmyk', 'gray'])
    expect(strokes.map(isRegistrationStroke)).toEqual([true, false, false, false])
    expect(countStrokedLines(content)).toBe(1)
  })
})
