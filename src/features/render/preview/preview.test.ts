import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LINES, patchLines } from '../../../shared/model/lines'
import { centreDashMm } from '../../lines/geometry'
import { tileLinesFor } from '../page-model/tile-lines'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import type { PageModel, TileLines } from '../types'
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

interface StrokeState {
  readonly style: string
  readonly width: number
  readonly alpha: number
  readonly cap: CanvasLineCap
  readonly join: CanvasLineJoin
  readonly miterLimit: number
  readonly dash: readonly number[]
  readonly dashOffset: number
  readonly clip: readonly number[] | null
}

/** Records calls as text and the state of every stroke; save/restore keep a real state stack, clip included. */
function recordingCtx() {
  const calls: string[] = []
  const strokes: StrokeState[] = []
  let dash: number[] = []
  let clip: number[] | null = null
  let pendingRect: number[] | null = null
  const stack: { saved: Record<string, unknown>; dash: number[]; clip: number[] | null }[] = []
  const stateKeys = [
    'fillStyle',
    'strokeStyle',
    'lineWidth',
    'globalAlpha',
    'lineCap',
    'lineJoin',
    'miterLimit',
    'lineDashOffset',
  ] as const
  const ctx: PageCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDashOffset: 0,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect: (...a) =>
      calls.push(`fillRect ${a.map((n) => n.toFixed(1)).join(' ')} ${css(ctx.fillStyle)}`),
    strokeRect: (...a) =>
      calls.push(`strokeRect ${a.map((n) => n.toFixed(1)).join(' ')} ${css(ctx.strokeStyle)}`),
    setLineDash: (d) => {
      dash = [...d]
      calls.push(`dash ${d.join(',')}`)
    },
    beginPath: () => {
      pendingRect = null
      calls.push('beginPath')
    },
    moveTo: (x, y) => calls.push(`moveTo ${x.toFixed(1)} ${y.toFixed(1)}`),
    lineTo: (x, y) => calls.push(`lineTo ${x.toFixed(1)} ${y.toFixed(1)}`),
    bezierCurveTo: (...a) => calls.push(`bezierCurveTo ${a.map((n) => n.toFixed(1)).join(' ')}`),
    rect: (...a) => {
      pendingRect = a
      calls.push(`rect ${a.map((n) => n.toFixed(1)).join(' ')}`)
    },
    clip: () => {
      clip = pendingRect
      calls.push('clip')
    },
    save: () => {
      stack.push({ saved: Object.fromEntries(stateKeys.map((k) => [k, ctx[k]])), dash, clip })
      calls.push('save')
    },
    restore: () => {
      const top = stack.pop()
      if (top) {
        Object.assign(ctx, top.saved)
        dash = top.dash
        clip = top.clip
      }
      calls.push('restore')
    },
    stroke: () => {
      strokes.push({
        style: css(ctx.strokeStyle),
        width: ctx.lineWidth,
        alpha: ctx.globalAlpha,
        cap: ctx.lineCap,
        join: ctx.lineJoin,
        miterLimit: ctx.miterLimit,
        dash,
        dashOffset: ctx.lineDashOffset,
        clip,
      })
      calls.push(`stroke ${css(ctx.strokeStyle)} ${ctx.lineWidth.toFixed(2)}`)
    },
    drawImage: (_img, ...a) => calls.push(`drawImage ${a.map((n) => n.toFixed(1)).join(' ')}`),
  }
  return { ctx, calls, strokes, depth: () => stack.length }
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

describe('drawPage composition lines', () => {
  const k = 2
  const scale = previewScale({ w: 210, h: 297 }, 210 * k, 1)
  const trim = { x: 20, y: 30, w: 90, h: 60 }
  const every = patchLines(DEFAULT_LINES, {
    grid: { on: true, cols: 3, rows: 2 },
    thirds: true,
    armature: true,
    golden: true,
    spiral: { on: true, corner: 'topRight' },
    centre: true,
    style: { colour: '#1f3fbf', widthMm: 1.5, opacityPct: 60 },
  })
  const linesOf = (settings = every, rect = trim, turned = false, i = 0): TileLines => {
    const tl = tileLinesFor(settings, rect, turned, i)
    if (!tl) throw new Error('fixture draws no lines')
    return tl
  }
  const marks = [
    { x1: 16, y1: 30, x2: 12, y2: 30 },
    { x1: 20, y1: 26, x2: 20, y2: 22 },
  ]
  const withLines = (lines: readonly TileLines[]) =>
    pageModel([drawTile({ trim, bleedMm: 3 })], { cropMarks: marks, lines })
  const img = {} as CanvasImageSource
  const draw = (
    page: PageModel,
    showGuides = false,
    tileImage: (i: number) => CanvasImageSource | null = () => img,
  ) => {
    const rec = recordingCtx()
    drawPage(rec.ctx, page, scale, { showGuides, colors: DEFAULT_PAGE_DRAW_COLORS, tileImage })
    return rec
  }
  const f = (n: number) => n.toFixed(1)
  const rectCall = (r: { x: number; y: number; w: number; h: number }) =>
    `rect ${[r.x, r.y, r.w, r.h].map((v) => f(v * k)).join(' ')}`
  /** The calls a TileLines must produce: every stroke's dash, path and stroke, scaled by k. */
  const replay = (tl: TileLines): string[] =>
    tl.strokes.flatMap((s) => [
      `dash ${s.dashMm.map((d) => d * k).join(',')}`,
      'beginPath',
      ...s.cmds.map((c) =>
        c.op === 'M'
          ? `moveTo ${f(c.x * k)} ${f(c.y * k)}`
          : c.op === 'L'
            ? `lineTo ${f(c.x * k)} ${f(c.y * k)}`
            : `bezierCurveTo ${[c.x1, c.y1, c.x2, c.y2, c.x, c.y].map((v) => f(v * k)).join(' ')}`,
      ),
      `stroke ${tl.colour} ${Math.max(1, tl.widthMm * k).toFixed(2)}`,
    ])
  const blocksOf = (calls: readonly string[]): string[][] => {
    const blocks: string[][] = []
    let from = calls.indexOf('save')
    while (from >= 0) {
      const to = calls.indexOf('restore', from)
      blocks.push(calls.slice(from, to + 1))
      from = calls.indexOf('save', to)
    }
    return blocks
  }
  const blockFor = (tl: TileLines) => [
    'save',
    'beginPath',
    rectCall(tl.clip),
    'clip',
    ...replay(tl),
    'restore',
  ]

  it('replays page.lines after the tiles and before the crop marks', () => {
    const { calls } = draw(withLines([linesOf()]))
    const lastImage = calls.findLastIndex((c) => c.startsWith('drawImage'))
    const save = calls.indexOf('save')
    const restore = calls.indexOf('restore')
    expect(lastImage).toBeGreaterThan(-1)
    expect(lastImage).toBeLessThan(save)
    expect(calls.slice(restore + 1)).toEqual([
      'dash ',
      'beginPath',
      'moveTo 32.0 60.0',
      'lineTo 24.0 60.0',
      'moveTo 40.0 52.0',
      'lineTo 40.0 44.0',
      'stroke #000000 1.00',
    ])
  })

  it('clips each block to its trim and replays every command scaled by pxPerMm, curves as bezierCurveTo', () => {
    const tl = linesOf()
    const blocks = blocksOf(draw(withLines([tl])).calls)
    expect(blocks).toEqual([blockFor(tl)])
    expect(blocks[0]?.[2]).toBe('rect 40.0 60.0 180.0 120.0')
    expect(blocks[0]?.filter((c) => c.startsWith('bezierCurveTo'))).toHaveLength(12)
    expect(blocks[0]?.filter((c) => c.startsWith('stroke'))).toHaveLength(2)
  })

  it('strokes each batch with the model state: colour, alpha, butt caps, miter joins, limit 10, dash × k from phase 0, clipped to the trim', () => {
    const { strokes } = draw(withLines([linesOf()]))
    const state = {
      style: '#1f3fbf',
      width: 3,
      alpha: 0.6,
      cap: 'butt',
      join: 'miter',
      miterLimit: 10,
      dashOffset: 0,
      clip: [40, 60, 180, 120],
    }
    expect(strokes.slice(0, 2)).toEqual([
      { ...state, dash: [] },
      { ...state, dash: centreDashMm(1.5).map((d) => d * k) },
    ])
  })

  it('sets the stroke state explicitly, whatever the context held before', () => {
    const rec = recordingCtx()
    Object.assign(rec.ctx, {
      lineCap: 'round',
      lineJoin: 'bevel',
      miterLimit: 3,
      lineDashOffset: 5,
      globalAlpha: 0.2,
    })
    drawPage(rec.ctx, withLines([linesOf()]), scale, {
      showGuides: false,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => img,
    })
    expect(rec.strokes[0]).toMatchObject({
      alpha: 0.6,
      cap: 'butt',
      join: 'miter',
      miterLimit: 10,
      dashOffset: 0,
    })
  })

  it('floors the width at 1 device px only when thinner, never the geometry or the dash (M3-R9)', () => {
    const thin = linesOf(patchLines(every, { style: { widthMm: 0.1 } }))
    const thinRec = draw(withLines([thin]))
    expect(thinRec.strokes.slice(0, 2).map((s) => s.width)).toEqual([1, 1])
    expect(thinRec.strokes[1]?.dash).toEqual(centreDashMm(0.1).map((d) => d * k))
    expect(blocksOf(thinRec.calls)).toEqual([blockFor(thin)])
    const thick = draw(withLines([linesOf(patchLines(every, { style: { widthMm: 1.5 } }))]))
    expect(thick.strokes.slice(0, 2).map((s) => s.width)).toEqual([3, 3])
  })

  it('keeps dash lengths below 1 device px unfloored on a small sheet (M3-R9)', () => {
    const small = previewScale({ w: 210, h: 297 }, 105, 1)
    const tl = linesOf(patchLines(every, { style: { widthMm: 0.1 } }))
    const rec = recordingCtx()
    drawPage(rec.ctx, withLines([tl]), small, {
      showGuides: false,
      colors: DEFAULT_PAGE_DRAW_COLORS,
      tileImage: () => img,
    })
    expect(small.pxPerMm).toBe(0.5)
    expect(rec.strokes[1]).toMatchObject({ width: 1, dash: [0.75, 0.5] })
  })

  it('draws the same lines whether guides are on or off (M3-R19)', () => {
    const tl = linesOf()
    const off = blocksOf(draw(withLines([tl]), false).calls)
    const on = blocksOf(draw(withLines([tl]), true).calls)
    expect(off).toEqual([blockFor(tl)])
    expect(on).toEqual(off)
  })

  it('restores the state, so the crop marks are opaque, solid and unclipped', () => {
    const rec = draw(withLines([linesOf()]))
    expect(rec.depth()).toBe(0)
    expect(rec.strokes.at(-1)).toMatchObject({ style: '#000000', alpha: 1, dash: [], clip: null })
  })

  it('creates no canvas and draws no image for lines', () => {
    const createElement = vi.fn()
    const offscreen = vi.fn()
    vi.stubGlobal('document', { createElement })
    vi.stubGlobal('OffscreenCanvas', offscreen)
    try {
      const bare = draw(withLines([])).calls.filter((c) => c.startsWith('drawImage'))
      const lined = draw(withLines([linesOf()])).calls.filter((c) => c.startsWith('drawImage'))
      expect(lined).toEqual(bare)
      expect(lined).toHaveLength(1)
      expect(createElement).not.toHaveBeenCalled()
      expect(offscreen).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('draws a page without lines exactly as before: no state save, clip, rect or curve', () => {
    const plain = draw(withLines([])).calls
    expect(plain.some((c) => /^(save|restore|clip|rect|bezierCurveTo)/.test(c))).toBe(false)
  })

  it('draws every tile of a turned study group with its own clip and the model commands, in tile order', () => {
    const spiral = patchLines(every, { style: { opacityPct: 90 } })
    const tiles = [
      drawTile({ trim: { x: 10, y: 10, w: 60, h: 80 } }),
      drawTile({
        trim: { x: 76, y: 10, w: 60, h: 80 },
        version: 'blurred',
        study: { blurPct: 40, values: null },
      }),
      drawTile({
        trim: { x: 142, y: 10, w: 60, h: 80 },
        version: 'values',
        study: { blurPct: null, values: { count: 5, hue: 55, neutral: false } },
      }),
    ]
    const lines = tiles.map((t, i) => linesOf(spiral, t.trim, true, i))
    const page = pageModel(tiles, {
      lines,
      groups: [{ imageId: id('a'), block: { x: 10, y: 10, w: 192, h: 80 } }],
    })
    const { calls, strokes } = draw(page, true, (i) => (i === 0 ? img : null))
    expect(blocksOf(calls)).toEqual(lines.map(blockFor))
    expect(strokes.slice(0, 6).map((s) => s.alpha)).toEqual([0.9, 0.9, 0.9, 0.9, 0.9, 0.9])
    expect(calls.indexOf('save')).toBeGreaterThan(
      calls.findLastIndex((c) => c.startsWith('fillRect')),
    )
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
