import { describe, expect, it } from 'vitest'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { DEFAULT_PAGE_DRAW_COLORS, drawPage, type PageCtx } from './draw-page'
import { previewDpi, previewScale, tileHitAreas } from './preview-geometry'

describe('previewScale', () => {
  it('sizes the canvas at device pixel ratio', () => {
    const s = previewScale({ w: 210, h: 297 }, 330, 2)
    expect(s.cssH).toBeCloseTo(466.71, 2)
    expect([s.deviceW, s.deviceH]).toEqual([660, 933])
    expect(s.pxPerMm).toBeCloseTo(660 / 210, 9)
  })
  it('treats a bad dpr as 1 and a zero width as 1 px', () => {
    expect(previewScale({ w: 210, h: 297 }, 330, Number.NaN).deviceW).toBe(330)
    expect(previewScale({ w: 210, h: 297 }, 0, 1).deviceW).toBe(1)
  })
})

describe('previewDpi', () => {
  it('follows the screen but never exceeds 300', () => {
    expect(previewDpi(previewScale({ w: 210, h: 297 }, 330, 2))).toBeCloseTo(79.83, 1)
    expect(previewDpi(previewScale({ w: 10, h: 10 }, 1000, 3))).toBe(300)
  })
})

describe('tileHitAreas', () => {
  it('carries scaledToFit from the tile (CR-X1)', () => {
    const page = pageModel([drawTile({ scaledToFit: true }), drawTile()])
    expect(tileHitAreas(page).map((a) => a.scaledToFit)).toEqual([true, false])
  })

  it('positions each tile in % of the sheet with its low-DPI state', () => {
    const page = pageModel([
      drawTile({
        imageId: id('a'),
        trim: { x: 21, y: 29.7, w: 105, h: 59.4 },
        lowDpi: true,
        crop: { x: 0, y: 0, w: 800, h: 450 },
      }),
    ])
    expect(tileHitAreas(page)).toEqual([
      {
        key: '0:0',
        imageId: id('a'),
        leftPct: 10,
        topPct: 10,
        widthPct: 50,
        heightPct: 20,
        lowDpi: true,
        scaledToFit: false,
        dpi: 194,
      },
    ])
  })
})

const css = (v: unknown): string => (typeof v === 'string' ? v : '[paint]')

function recordingCtx() {
  const calls: string[] = []
  const ctx: PageCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect: (...a) =>
      calls.push(`fillRect ${a.map((n) => n.toFixed(1)).join(' ')} ${css(ctx.fillStyle)}`),
    strokeRect: (...a) =>
      calls.push(`strokeRect ${a.map((n) => n.toFixed(1)).join(' ')} ${css(ctx.strokeStyle)}`),
    setLineDash: (d) => calls.push(`dash ${d.join(',')}`),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x, y) => calls.push(`moveTo ${x.toFixed(1)} ${y.toFixed(1)}`),
    lineTo: (x, y) => calls.push(`lineTo ${x.toFixed(1)} ${y.toFixed(1)}`),
    stroke: () => calls.push(`stroke ${css(ctx.strokeStyle)} ${ctx.lineWidth.toFixed(2)}`),
    drawImage: (_img, ...a) => calls.push(`drawImage ${a.map((n) => n.toFixed(1)).join(' ')}`),
  }
  return { ctx, calls }
}

describe('drawPage', () => {
  const scale = previewScale({ w: 210, h: 297 }, 210, 1) // 1 px per mm
  const page = pageModel([drawTile({ trim: { x: 20, y: 20, w: 100, h: 50 }, bleedMm: 3 })], {
    cropMarks: [
      { x1: 16, y1: 20, x2: 12, y2: 20 },
      { x1: 20, y1: 16, x2: 20, y2: 12 },
    ],
  })
  const img = {} as CanvasImageSource

  it('draws paper, the tile at trim+bleed, then marks as one stroked path', () => {
    const { ctx, calls } = recordingCtx()
    drawPage(ctx, page, scale, {
      showGuides: false,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => img,
    })
    expect(calls).toEqual([
      'fillRect 0.0 0.0 210.0 297.0 #ffffff',
      'drawImage 17.0 17.0 106.0 56.0',
      'dash ',
      'beginPath',
      'moveTo 16.0 20.0',
      'lineTo 12.0 20.0',
      'moveTo 20.0 16.0',
      'lineTo 20.0 12.0',
      'stroke #000000 1.00',
    ])
  })

  it('fills a placeholder for a missing bitmap', () => {
    const { ctx, calls } = recordingCtx()
    drawPage(ctx, page, scale, {
      showGuides: false,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => null,
    })
    expect(calls[1]).toBe(`fillRect 17.0 17.0 106.0 56.0 ${DEFAULT_PAGE_DRAW_COLORS.missing}`)
  })

  it('adds safe area, bleed and trim guides when on', () => {
    const { ctx, calls } = recordingCtx()
    drawPage(ctx, page, scale, {
      showGuides: true,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => img,
    })
    expect(calls).toContain('strokeRect 5.0 5.0 200.0 287.0 #2a7ab8')
    expect(calls).toContain('strokeRect 17.0 17.0 106.0 56.0 #d63a78')
    expect(calls).toContain('strokeRect 20.0 20.0 100.0 50.0 rgba(0, 0, 0, 0.35)')
  })
})

describe('previewScale canvas cap', () => {
  it('clamps the backing store to the canvas area cap', () => {
    const s = previewScale({ w: 210, h: 297 }, 3000, 3)
    expect(s.deviceW * s.deviceH).toBeLessThanOrEqual(16_777_216)
    expect(s.deviceW / s.deviceH).toBeCloseTo(210 / 297, 2)
    expect(s.cssW).toBe(3000)
  })
})
