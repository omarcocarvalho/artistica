import { describe, expect, it } from 'vitest'
import { valueRamp } from '../../studies/ramp'
import { drawTile } from '../test-support/fixtures'
import { FakeCanvas, fakeFactory, type DrawableFake } from '../test-support/fake-canvas'
import { extendEdges, fillPixel, repeatColumn, repeatRow } from './bleed'
import {
  CanvasUnavailableError,
  releaseCanvas,
  releaseStepLevels,
  renderTile,
  type StepLevelSlot,
} from './render-tile'
import { forScaledSource, planTilePixels } from './tile-plan'

const RED = [255, 0, 0, 255]
const GREEN = [0, 255, 0, 255]
const BLUE = [0, 0, 255, 255]
const BLACK = [0, 0, 0, 255]

describe('bleed helpers', () => {
  it('repeatRow stacks a row', () => {
    const out = new Uint8ClampedArray(2 * 3 * 4)
    repeatRow(new Uint8ClampedArray([...RED, ...GREEN]), 3, out)
    expect(Array.from(out)).toEqual([...RED, ...GREEN, ...RED, ...GREEN, ...RED, ...GREEN])
  })
  it('repeatColumn widens a column', () => {
    const out = new Uint8ClampedArray(2 * 2 * 4)
    repeatColumn(new Uint8ClampedArray([...RED, ...GREEN]), 2, out)
    expect(Array.from(out)).toEqual([...RED, ...RED, ...GREEN, ...GREEN])
  })
  it('fillPixel floods', () => {
    const out = new Uint8ClampedArray(3 * 4)
    fillPixel(new Uint8ClampedArray(BLUE), out)
    expect(Array.from(out)).toEqual([...BLUE, ...BLUE, ...BLUE])
  })
})

describe('extendEdges', () => {
  // 2×2 image at (2,2) inside a 6×6 canvas (bleed 2): TL red, TR green, BL blue, BR black.
  const make = () => {
    const c = new FakeCanvas(6, 6)
    c.setPixel(2, 2, RED)
    c.setPixel(3, 2, GREEN)
    c.setPixel(2, 3, BLUE)
    c.setPixel(3, 3, BLACK)
    return c
  }

  it('replicates edge pixels outward and fills corners from corner pixels', () => {
    const c = make()
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no ctx')
    extendEdges(ctx, 2, 2, 2)
    expect(c.pixel(2, 0)).toEqual(RED) // above TL
    expect(c.pixel(3, 1)).toEqual(GREEN) // above TR
    expect(c.pixel(0, 3)).toEqual(BLUE) // left of BL
    expect(c.pixel(5, 3)).toEqual(BLACK) // right of BR
    expect(c.pixel(2, 5)).toEqual(BLUE) // below BL
    expect(c.pixel(0, 0)).toEqual(RED) // TL corner
    expect(c.pixel(5, 0)).toEqual(GREEN) // TR corner
    expect(c.pixel(0, 5)).toEqual(BLUE) // BL corner
    expect(c.pixel(5, 5)).toEqual(BLACK) // BR corner
    expect(c.pixel(2, 2)).toEqual(RED) // image untouched
  })

  it('does nothing without bleed', () => {
    const c = make()
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no ctx')
    extendEdges(ctx, 0, 2, 2)
    expect(c.pixel(0, 0)).toEqual([0, 0, 0, 0])
  })
})

describe('renderTile', () => {
  const source = {} as CanvasImageSource

  it('draws the crop once, oriented by the plan matrix, on white', () => {
    const made: FakeCanvas[] = []
    const plan = planTilePixels(
      drawTile({ crop: { x: 10, y: 20, w: 1181, h: 591 }, rotation: 180 }),
    )
    const out = renderTile(source, plan, fakeFactory(made))
    expect(made).toHaveLength(1)
    expect(out.width).toBe(plan.canvasW)
    expect(out.draws).toEqual([
      {
        source,
        args: [10, 20, 1181, 591, 0, 0, plan.scaledW, plan.scaledH],
        transform: [...plan.matrix],
        smoothing: true,
      },
    ])
    expect(out.pixel(0, 0)).toEqual([255, 255, 255, 255])
  })

  it('draws the same region of a smaller bitmap onto the same output', () => {
    const tile = drawTile({ crop: { x: 400, y: 200, w: 1600, h: 800 }, rotation: 180, flipV: true })
    const plan = planTilePixels(tile)
    const full = renderTile(source, plan, fakeFactory())
    const small = renderTile(source, forScaledSource(plan, 0.25, 0.25), fakeFactory())
    expect(full.draws[0]?.args).toEqual([400, 200, 1600, 800, 0, 0, plan.scaledW, plan.scaledH])
    expect(small.draws[0]?.args).toEqual([100, 50, 400, 200, 0, 0, plan.scaledW, plan.scaledH])
    expect(small.draws[0]?.transform).toEqual(full.draws[0]?.transform)
    expect([small.width, small.height]).toEqual([full.width, full.height])
  })

  it('steps down large reductions and releases the temporaries', () => {
    const made: FakeCanvas[] = []
    const plan = planTilePixels(drawTile({ crop: { x: 0, y: 0, w: 3000, h: 1500 } }), { dpi: 60 })
    renderTile(source, plan, fakeFactory(made))
    const temps = made.slice(0, -1)
    expect(temps.length).toBeGreaterThan(0)
    for (const t of temps) expect([t.width, t.height]).toEqual([0, 0])
    expect(made[0]?.draws[0]?.args.slice(0, 4)).toEqual([0, 0, 3000, 1500])
  })

  it('fills the bleed ring by copying the edge pixels outward', () => {
    // 100 × 50 image at 1 px/mm, bleed 3 px; image pixel (x, y) has colour [x, y, 7, 255].
    const plan = planTilePixels(drawTile({ bleedMm: 3, crop: { x: 0, y: 0, w: 100, h: 50 } }), {
      dpi: 25.4,
    })
    const src = { paint: (x: number, y: number) => [x, y, 7, 255] } as unknown as CanvasImageSource
    const out = renderTile(src, plan, fakeFactory())
    expect([out.width, out.height]).toEqual([106, 56])
    expect(out.pixel(3, 3)).toEqual([0, 0, 7, 255]) // image top-left
    expect(out.pixel(5, 0)).toEqual([2, 0, 7, 255]) // top strip = row 0
    expect(out.pixel(5, 2)).toEqual([2, 0, 7, 255])
    expect(out.pixel(0, 10)).toEqual([0, 7, 7, 255]) // left strip = column 0
    expect(out.pixel(105, 10)).toEqual([99, 7, 7, 255]) // right strip = column 99
    expect(out.pixel(20, 55)).toEqual([17, 49, 7, 255]) // bottom strip = row 49
    expect(out.pixel(0, 0)).toEqual([0, 0, 7, 255]) // corners
    expect(out.pixel(105, 0)).toEqual([99, 0, 7, 255])
    expect(out.pixel(0, 55)).toEqual([0, 49, 7, 255])
    expect(out.pixel(105, 55)).toEqual([99, 49, 7, 255])
  })

  it('posterises the image area to the ramp and extends the studied edge into the bleed', () => {
    const plan = planTilePixels(drawTile({ bleedMm: 3, crop: { x: 0, y: 0, w: 100, h: 50 } }), {
      dpi: 25.4,
    })
    const src = {
      paint: (x: number) => [x * 2, x * 2, x * 2, 255],
    } as unknown as CanvasImageSource
    const values = { count: 3, hue: 0, neutral: true }
    const out = renderTile(src, plan, fakeFactory(), { blurPct: null, values })
    const ramp = valueRamp(values).map((c) => [c.r, c.g, c.b, 255].join())
    const seen = new Set<string>()
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) seen.add(out.pixel(x, y).join())
    expect([...seen].sort()).toEqual([...ramp].sort())
    expect(out.pixel(0, 10)).toEqual(out.pixel(3, 10))
    expect(out.pixel(105, 10)).toEqual(out.pixel(102, 10))
    expect(out.pixel(0, 10)).not.toEqual(out.pixel(105, 10))
  })

  it('refuses step-down temporaries above the canvas cap and releases what it made', () => {
    const made: FakeCanvas[] = []
    const plan = {
      ...planTilePixels(drawTile({ crop: { x: 0, y: 0, w: 3000, h: 1500 } }), { dpi: 5 }),
      src: { x: 0, y: 0, w: 40000, h: 20000 },
    }
    expect(() => renderTile(source, plan, fakeFactory(made))).toThrow(CanvasUnavailableError)
  })

  it('releases the output canvas when drawing fails', () => {
    const made: FakeCanvas[] = []
    const factory = (w: number, h: number) => {
      const c = fakeFactory(made)(w, h)
      if (made.length === 1) c.getContext = () => null
      return c
    }
    expect(() => renderTile(source, planTilePixels(drawTile()), factory)).toThrow(
      CanvasUnavailableError,
    )
    expect([made[0]?.width, made[0]?.height]).toEqual([0, 0])
  })

  it('throws CanvasUnavailableError when 2D contexts are missing', () => {
    const broken = () =>
      Object.assign(new FakeCanvas(1, 1), { getContext: () => null }) as unknown as FakeCanvas &
        CanvasImageSource
    expect(() => renderTile(source, planTilePixels(drawTile()), broken)).toThrow(
      CanvasUnavailableError,
    )
  })

  describe('with a step-down level slot', () => {
    const emptySlot = (): StepLevelSlot<DrawableFake> => ({ levels: [] })
    const tile = drawTile({ crop: { x: 0, y: 0, w: 3000, h: 1500 } })
    const at = (dpi: number) => planTilePixels(tile, { dpi })
    const lastDraw = (c: FakeCanvas) => c.draws.at(-1)
    const kept = (slot: StepLevelSlot<DrawableFake>) =>
      slot.levels.map((l) => [l.depth, l.canvas.width, l.canvas.height])
    // At 100 mm wide from a 3000 px crop: dpi 600 needs no halving, 200 one, 100 two, 60 three, 40 four.

    it('keeps the deepest level the render used and the one above it', () => {
      const slot = emptySlot()
      const made: FakeCanvas[] = []
      renderTile(source, at(60), fakeFactory(made), null, slot)
      expect(kept(slot)).toEqual([
        [2, 750, 375],
        [3, 375, 188],
      ])
      expect(slot.levels.map((l) => l.canvas)).toEqual([made[1], made[2]])
      expect([made[0]?.width, made[0]?.height]).toEqual([0, 0])
    })

    it('a render at another size with the same halvings draws only the output, from the kept level', () => {
      const slot = emptySlot()
      renderTile(source, at(60), fakeFactory(), null, slot)
      const before = [...slot.levels]
      const made: FakeCanvas[] = []
      const plan = at(58)
      const out = renderTile(source, plan, fakeFactory(made), null, slot)
      expect(made).toEqual([out])
      expect(lastDraw(out)?.source).toBe(before[1]?.canvas)
      expect(lastDraw(out)?.args).toEqual([0, 0, 375, 188, 0, 0, plan.scaledW, plan.scaledH])
      expect(slot.levels).toEqual(before)
    })

    it('draws the output exactly as a render without the slot does', () => {
      const slot = emptySlot()
      renderTile(source, at(60), fakeFactory(), null, slot)
      const plan = at(58)
      const made: FakeCanvas[] = []
      const fresh = renderTile(source, plan, fakeFactory(made))
      const cached = renderTile(source, plan, fakeFactory(), null, slot)
      expect(made.map((c) => c.draws.map((d) => d.args))).toEqual([
        [[0, 0, 3000, 1500, 0, 0, 1500, 750]],
        [[0, 0, 1500, 750, 0, 0, 750, 375]],
        [[0, 0, 750, 375, 0, 0, 375, 188]],
        [[0, 0, 375, 188, 0, 0, plan.scaledW, plan.scaledH]],
      ])
      expect(kept(slot).at(-1)?.slice(1)).toEqual(made.at(-2)?.draws[0]?.args.slice(6))
      expect({ ...lastDraw(cached), source: null }).toEqual({ ...lastDraw(fresh), source: null })
    })

    it('one halving fewer draws from the level above, and keeps it', () => {
      const slot = emptySlot()
      renderTile(source, at(60), fakeFactory(), null, slot)
      const [above, deepest] = slot.levels
      const made: FakeCanvas[] = []
      renderTile(source, at(100), fakeFactory(made), null, slot)
      expect(made).toHaveLength(1)
      expect(made[0]?.draws[0]?.source).toBe(above?.canvas)
      expect(slot.levels).toEqual([above])
      expect([deepest?.canvas.width, deepest?.canvas.height]).toEqual([0, 0])
    })

    it('more halvings continue from the deepest kept level', () => {
      const slot = emptySlot()
      renderTile(source, at(200), fakeFactory(), null, slot)
      const [shallow] = slot.levels
      expect(kept(slot)).toEqual([[1, 1500, 750]])
      const made: FakeCanvas[] = []
      renderTile(source, at(40), fakeFactory(made), null, slot)
      expect(made[0]?.draws[0]?.source).toBe(shallow?.canvas)
      expect(made[0]?.draws[0]?.args.slice(0, 4)).toEqual([0, 0, 1500, 750])
      expect(slot.levels.map((l) => l.canvas)).toEqual([made[1], made[2]])
      expect(kept(slot).map(([depth]) => depth)).toEqual([3, 4])
      expect([shallow?.canvas.width, made[0]?.width]).toEqual([0, 0])
    })

    it('two or more halvings fewer start again from the source', () => {
      const slot = emptySlot()
      renderTile(source, at(40), fakeFactory(), null, slot)
      const old = [...slot.levels]
      const made: FakeCanvas[] = []
      renderTile(source, at(200), fakeFactory(made), null, slot)
      expect(made[0]?.draws[0]?.source).toBe(source)
      expect(kept(slot)).toEqual([[1, 1500, 750]])
      expect(old.map((l) => l.canvas.width)).toEqual([0, 0])
    })

    it('levels of another source or crop are not used, and are released', () => {
      const slot = emptySlot()
      renderTile(source, at(60), fakeFactory(), null, slot)
      const old = [...slot.levels]
      const other = {} as CanvasImageSource
      const fromOther: FakeCanvas[] = []
      renderTile(other, at(58), fakeFactory(fromOther), null, slot)
      expect(fromOther[0]?.draws[0]?.source).toBe(other)
      expect(old.map((l) => l.canvas.width)).toEqual([0, 0])
      const moved = { ...at(58), src: { x: 1, y: 0, w: 2999, h: 1500 } }
      const fromMoved: FakeCanvas[] = []
      renderTile(other, moved, fakeFactory(fromMoved), null, slot)
      expect(fromMoved[0]?.draws[0]?.source).toBe(other)
      expect(fromMoved[0]?.draws[0]?.args.slice(0, 4)).toEqual([1, 0, 2999, 1500])
    })

    it('never keeps a step that the output size shaped', () => {
      const slot = emptySlot()
      const clamped = { ...at(60), src: { x: 0, y: 0, w: 1000, h: 100 }, scaledW: 200, scaledH: 80 }
      const made: FakeCanvas[] = []
      renderTile(source, clamped, fakeFactory(made), null, slot)
      expect(made[0]?.draws[0]?.args.slice(6)).toEqual([500, 80])
      expect(slot.levels).toEqual([])
      expect([made[0]?.width, made[0]?.height]).toEqual([0, 0])
    })

    it('keeps the halvings before a step that the output size shaped', () => {
      const slot = emptySlot()
      const plan = { ...at(60), src: { x: 0, y: 0, w: 4000, h: 400 }, scaledW: 400, scaledH: 90 }
      const made: FakeCanvas[] = []
      renderTile(source, plan, fakeFactory(made), null, slot)
      expect(made.slice(0, -1).map((c) => c.draws[0]?.args.slice(6))).toEqual([
        [2000, 200],
        [1000, 100],
        [500, 90],
      ])
      expect(slot.levels.map((l) => [l.depth, l.canvas])).toEqual([
        [1, made[0]],
        [2, made[1]],
      ])
    })

    it('a render that fails leaves the slot as it was', () => {
      const slot = emptySlot()
      renderTile(source, at(60), fakeFactory(), null, slot)
      const before = [...slot.levels]
      const made: FakeCanvas[] = []
      const factory = (w: number, h: number) => {
        const c = fakeFactory(made)(w, h)
        c.getContext = () => null
        return c
      }
      expect(() => renderTile(source, at(30), factory, null, slot)).toThrow(CanvasUnavailableError)
      expect(slot.levels).toEqual(before)
      expect(kept(slot)).toEqual([
        [2, 750, 375],
        [3, 375, 188],
      ])
      expect(made.map((c) => c.width)).toEqual([0])
    })

    it('a render without halvings leaves the slot empty and releases the old levels', () => {
      const slot = emptySlot()
      renderTile(source, at(60), fakeFactory(), null, slot)
      const old = [...slot.levels]
      renderTile(source, at(600), fakeFactory(), null, slot)
      expect(slot.levels).toEqual([])
      expect(old.map((l) => l.canvas.width)).toEqual([0, 0])
    })

    it('releaseStepLevels releases every kept level and empties the slot', () => {
      const slot = emptySlot()
      renderTile(source, at(60), fakeFactory(), null, slot)
      const old = [...slot.levels]
      releaseStepLevels(slot)
      expect(slot.levels).toEqual([])
      expect(old.map((l) => l.canvas.width)).toEqual([0, 0])
    })
  })

  it('releaseCanvas zeroes the backing store', () => {
    const c = new FakeCanvas(10, 10)
    releaseCanvas(c)
    expect([c.width, c.height]).toEqual([0, 0])
  })
})
