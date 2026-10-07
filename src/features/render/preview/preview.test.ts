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
        version: 'original',
        groupSize: 1,
        firstInGroup: true,
      },
    ])
  })
})

describe('tileHitAreas with study groups', () => {
  const blur = { blurPct: 40, values: null }
  const tiles = [
    drawTile({ imageId: id('a'), trim: { x: 10, y: 10, w: 50, h: 70 } }),
    drawTile({
      imageId: id('a'),
      trim: { x: 66, y: 10, w: 50, h: 70 },
      version: 'blurred',
      study: blur,
    }),
    drawTile({ imageId: id('b'), trim: { x: 10, y: 90, w: 80, h: 50 } }),
  ]
  const page = pageModel(tiles, {
    groups: [{ imageId: id('a'), block: { x: 10, y: 10, w: 106, h: 70 } }],
  })

  it('reports version, group size and the first tile of each group', () => {
    const areas = tileHitAreas(page)
    expect(areas.map((a) => [a.version, a.groupSize, a.firstInGroup])).toEqual([
      ['original', 2, true],
      ['blurred', 2, false],
      ['original', 1, true],
    ])
  })

  it('does not put a tile of another image inside an outline into the group', () => {
    const overlapping = pageModel(tiles, {
      groups: [{ imageId: id('a'), block: { x: 0, y: 0, w: 210, h: 297 } }],
    })
    expect(tileHitAreas(overlapping)[2]).toMatchObject({ groupSize: 1, firstInGroup: true })
  })

  it('keeps two copies of the same image as separate groups', () => {
    const copies = pageModel(
      [
        ...tiles.slice(0, 2),
        drawTile({ imageId: id('a'), trim: { x: 10, y: 150, w: 50, h: 70 } }),
        drawTile({
          imageId: id('a'),
          trim: { x: 66, y: 150, w: 50, h: 70 },
          version: 'blurred',
          study: blur,
        }),
      ],
      {
        groups: [
          { imageId: id('a'), block: { x: 10, y: 10, w: 106, h: 70 } },
          { imageId: id('a'), block: { x: 10, y: 150, w: 106, h: 70 } },
        ],
      },
    )
    expect(tileHitAreas(copies).map((a) => [a.groupSize, a.firstInGroup])).toEqual([
      [2, true],
      [2, false],
      [2, true],
      [2, false],
    ])
  })

  it('keeps two side-by-side copies of the same image as separate groups', () => {
    const tile = (x: number, version: 'original' | 'blurred') =>
      drawTile({
        imageId: id('a'),
        trim: { x, y: 10, w: 40, h: 60 },
        ...(version === 'blurred' ? { version, study: blur } : {}),
      })
    const sideBySide = pageModel(
      [tile(10, 'original'), tile(52, 'blurred'), tile(100, 'original'), tile(142, 'blurred')],
      {
        groups: [
          { imageId: id('a'), block: { x: 10, y: 10, w: 82, h: 60 } },
          { imageId: id('a'), block: { x: 100, y: 10, w: 82, h: 60 } },
        ],
      },
    )
    expect(tileHitAreas(sideBySide).map((a) => [a.groupSize, a.firstInGroup])).toEqual([
      [2, true],
      [2, false],
      [2, true],
      [2, false],
    ])
  })

  it('counts a tile whose trim overshoots its block by float error as a member', () => {
    const drift = pageModel(
      [
        drawTile({ imageId: id('a'), trim: { x: 10 - 1e-9, y: 10 - 1e-9, w: 50, h: 70 } }),
        drawTile({
          imageId: id('a'),
          trim: { x: 66, y: 10, w: 50 + 1e-9, h: 70 + 1e-9 },
          version: 'blurred',
          study: blur,
        }),
      ],
      { groups: [{ imageId: id('a'), block: { x: 10, y: 10, w: 106, h: 70 } }] },
    )
    expect(tileHitAreas(drift).map((a) => [a.groupSize, a.firstInGroup])).toEqual([
      [2, true],
      [2, false],
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

describe('drawPage group outlines', () => {
  const scale = previewScale({ w: 210, h: 297 }, 420, 1) // 2 px per mm
  const page = pageModel(
    [
      drawTile({ trim: { x: 10, y: 10, w: 50, h: 70 }, bleedMm: 3 }),
      drawTile({
        trim: { x: 66, y: 10, w: 50, h: 70 },
        bleedMm: 3,
        version: 'blurred',
        study: { blurPct: 40, values: null },
      }),
    ],
    { groups: [{ imageId: id('a'), block: { x: 10, y: 10, w: 106, h: 70 } }] },
  )
  const group = DEFAULT_PAGE_DRAW_COLORS.group
  const outline = `strokeRect 16.0 16.0 220.0 148.0 ${group}`

  it('strokes each group 2 mm outside its block, dashed, 1.5 px, in the group colour, after the guides', () => {
    const { ctx, calls } = recordingCtx()
    const widths: number[] = []
    const strokeRect = ctx.strokeRect.bind(ctx)
    ctx.strokeRect = (...a) => {
      if (ctx.strokeStyle === group) widths.push(ctx.lineWidth)
      strokeRect(...a)
    }
    drawPage(ctx, page, scale, {
      showGuides: true,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => null,
    })
    const at = calls.indexOf(outline)
    expect(at).toBeGreaterThan(-1)
    expect(
      calls
        .slice(0, at)
        .filter((c) => c.startsWith('dash '))
        .at(-1),
    ).toBe('dash 6,4')
    expect(widths).toEqual([1.5])
    const lastGuide = calls.findLastIndex((c) => c.includes(DEFAULT_PAGE_DRAW_COLORS.cut))
    expect(at).toBeGreaterThan(lastGuide)
    expect(calls.at(-1)).toBe('dash ')
  })

  it('draws no outline with guides off', () => {
    const { ctx, calls } = recordingCtx()
    drawPage(ctx, page, scale, {
      showGuides: false,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => null,
    })
    expect(calls.some((c) => c.endsWith(group))).toBe(false)
  })

  it('draws nothing extra for a page without groups', () => {
    const { ctx, calls } = recordingCtx()
    drawPage(ctx, { ...page, groups: [] }, scale, {
      showGuides: true,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => null,
    })
    expect(calls.some((c) => c.endsWith(group))).toBe(false)
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
