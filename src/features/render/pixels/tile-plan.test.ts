import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Rotation } from '../../../shared/model/image'
import { studyKey } from '../../../shared/model/study'
import { drawTile } from '../test-support/fixtures'
import {
  MAX_CANVAS_AREA_PX,
  applyMatrix,
  downscaleSteps,
  forCroppedSource,
  forScaledSource,
  integerCropBox,
  orientMatrix,
  planTilePixels,
  sourceRect,
  tileRenderKey,
  tileSourceDpi,
} from './tile-plan'

const corners = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]

describe('orientMatrix', () => {
  // Where the source's top-left corner lands, for a 200×100 image (scaled == source).
  it.each<[Rotation, boolean, boolean, { x: number; y: number }]>([
    [0, false, false, { x: 0, y: 0 }],
    [90, false, false, { x: 100, y: 0 }], // clockwise: top-left → top-right
    [180, false, false, { x: 200, y: 100 }],
    [270, false, false, { x: 0, y: 200 }],
    [0, true, false, { x: 200, y: 0 }],
    [0, false, true, { x: 0, y: 100 }],
    [90, true, false, { x: 0, y: 0 }],
    [270, false, true, { x: 0, y: 0 }],
    [270, true, true, { x: 100, y: 0 }],
    [180, true, true, { x: 0, y: 0 }],
  ])('rotation %i flipH=%s flipV=%s sends (0,0) to %o', (r, fh, fv, expected) => {
    const quarter = r === 90 || r === 270
    const outW = quarter ? 100 : 200
    const outH = quarter ? 200 : 100
    const m = orientMatrix(r, fh, fv, 200, 100, outW, outH, 0)
    const p = applyMatrix(m, 0, 0)
    expect(p.x).toBeCloseTo(expected.x, 9)
    expect(p.y).toBeCloseTo(expected.y, 9)
  })

  it('maps the image corners exactly onto the canvas rect inside the bleed (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Rotation>(0, 90, 180, 270),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 0, max: 60 }),
        (r, fh, fv, w, h, b) => {
          const quarter = r === 90 || r === 270
          const outW = quarter ? h : w
          const outH = quarter ? w : h
          const m = orientMatrix(r, fh, fv, w, h, outW, outH, b)
          const mapped = corners(w, h).map((c) => applyMatrix(m, c.x, c.y))
          const xs = mapped.map((p) => Math.round(p.x)).sort((a, z) => a - z)
          const ys = mapped.map((p) => Math.round(p.y)).sort((a, z) => a - z)
          expect([xs[0], xs[3]]).toEqual([b, b + outW])
          expect([ys[0], ys[3]]).toEqual([b, b + outH])
        },
      ),
    )
  })
})

describe('planTilePixels', () => {
  it('targets 300 DPI for the printed size when the source has enough pixels', () => {
    // 100 × 50 mm at 300 DPI = 1181 × 591 px; source 3000 × 1500.
    const plan = planTilePixels(drawTile())
    expect(plan.outW).toBe(1181)
    expect(plan.outH).toBe(591)
    expect(plan.bleedPx).toBe(0)
    expect(plan.canvasW).toBe(1181)
    expect(plan.dpi).toBeCloseTo(300, 0)
  })

  it('never upscales past the source pixels', () => {
    const plan = planTilePixels(drawTile({ crop: { x: 0, y: 0, w: 600, h: 300 } }))
    expect(plan.outW).toBe(600)
    expect(plan.outH).toBe(300)
    expect(plan.dpi).toBeCloseTo(152.4, 1)
  })

  it('swaps the source axes for quarter turns', () => {
    const plan = planTilePixels(
      drawTile({
        trim: { x: 0, y: 0, w: 50, h: 100 },
        crop: { x: 0, y: 0, w: 3000, h: 1500 },
        rotation: 90,
      }),
    )
    expect([plan.outW, plan.outH]).toEqual([591, 1181])
    expect([plan.scaledW, plan.scaledH]).toEqual([1181, 591])
  })

  it('extends the canvas by the bleed at the output resolution', () => {
    const plan = planTilePixels(drawTile({ bleedMm: 3 }))
    expect(plan.bleedPx).toBe(35) // 3 mm × 1181 px / 100 mm
    expect(plan.canvasW).toBe(1181 + 70)
    expect(plan.canvasH).toBe(591 + 70)
    expect(plan.matrix[4]).toBe(35)
  })

  it('keeps at least 1 px of bleed at tiny preview resolutions', () => {
    expect(planTilePixels(drawTile({ bleedMm: 3 }), { dpi: 5 }).bleedPx).toBe(1)
    expect(planTilePixels(drawTile({ bleedMm: 1 }), { dpi: 5 }).bleedPx).toBe(1)
  })

  it('stays under the cap when rounding and the 1 px bleed floor would overshoot', () => {
    // Without re-planning from the rounded result this gives ~16,779,535 px.
    const plan = planTilePixels(
      drawTile({
        trim: { x: 0, y: 0, w: 1037, h: 468 },
        crop: { x: 0, y: 0, w: 9000, h: 9000 },
        bleedMm: 0.304,
      }),
    )
    expect(plan.canvasW * plan.canvasH).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX)
  })

  it('caps the canvas area for iOS Safari', () => {
    const plan = planTilePixels(
      drawTile({
        trim: { x: 0, y: 0, w: 400, h: 400 },
        crop: { x: 0, y: 0, w: 9000, h: 9000 },
        bleedMm: 3,
      }),
    )
    expect(plan.canvasW * plan.canvasH).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX)
  })

  it('uses the requested preview DPI', () => {
    expect(planTilePixels(drawTile(), { dpi: 96 }).outW).toBe(378)
  })

  it('keeps fractional crops as fractional source pixels', () => {
    expect(sourceRect(drawTile({ crop: { x: 10.4, y: 0.6, w: 99.3, h: 50.5 } }))).toEqual({
      x: 10.4,
      y: 0.6,
      w: 99.3,
      h: 50.5,
    })
  })

  it('stays within limits for any tile (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 1500, noNaN: true }),
        fc.double({ min: 5, max: 1500, noNaN: true }),
        fc.integer({ min: 1, max: 20000 }),
        fc.integer({ min: 1, max: 20000 }),
        fc.constantFrom<Rotation>(0, 90, 180, 270),
        fc.double({ min: 0.1, max: 6, noNaN: true }),
        (w, h, pw, ph, rotation, bleedMm) => {
          const plan = planTilePixels(
            drawTile({
              trim: { x: 0, y: 0, w, h },
              crop: { x: 0, y: 0, w: pw, h: ph },
              rotation,
              bleedMm,
            }),
          )
          const quarter = rotation === 90 || rotation === 270
          expect(plan.outW).toBeLessThanOrEqual(Math.max(1, quarter ? ph : pw) + 1)
          expect(plan.outH).toBeLessThanOrEqual(Math.max(1, quarter ? pw : ph) + 1)
          expect(plan.dpi).toBeLessThanOrEqual(300 + 300 / plan.outW + 1e-6)
          expect(plan.canvasW * plan.canvasH).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX)
        },
      ),
    )
  })
})

describe('planTilePixels guards', () => {
  it('rejects non-positive trims', () => {
    expect(() => planTilePixels(drawTile({ trim: { x: 0, y: 0, w: 0, h: 10 } }))).toThrow(
      RangeError,
    )
  })
  it('keeps a non-square tile with bleed under the cap after rounding', () => {
    const plan = planTilePixels(
      drawTile({
        trim: { x: 0, y: 0, w: 300, h: 500 },
        crop: { x: 0, y: 0, w: 9000, h: 9000 },
        bleedMm: 3,
      }),
    )
    expect(plan.canvasW * plan.canvasH).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX)
    expect(plan.outH / plan.outW).toBeCloseTo(500 / 300, 2)
  })
})

describe('forCroppedSource', () => {
  it('moves an integer source rect to the origin and keeps everything else', () => {
    const plan = planTilePixels(drawTile({ crop: { x: 100, y: 50, w: 2000, h: 1000 } }))
    const cropped = forCroppedSource(plan)
    expect(cropped.src).toEqual({ x: 0, y: 0, w: 2000, h: 1000 })
    expect(cropped.matrix).toEqual(plan.matrix)
  })

  it('keeps the fractional offset inside the integer crop box', () => {
    const plan = planTilePixels(drawTile({ crop: { x: 100.25, y: 50.75, w: 2000.5, h: 1000 } }))
    expect(integerCropBox(plan.src)).toEqual({ x: 100, y: 50, w: 2001, h: 1001 })
    expect(forCroppedSource(plan).src).toEqual({ x: 0.25, y: 0.75, w: 2000.5, h: 1000 })
    expect(tileRenderKey(drawTile({ crop: plan.src }), plan)).toContain('100.25')
  })
})

describe('forScaledSource', () => {
  it('maps a fractional crop of a rotated, flipped tile into a smaller bitmap', () => {
    const plan = planTilePixels(
      drawTile({ crop: { x: 100.5, y: 40.25, w: 2000.5, h: 1000 }, rotation: 90, flipH: true }),
    )
    const scaled = forScaledSource(plan, 0.5, 0.25)
    expect(scaled.src).toEqual({ x: 50.25, y: 10.0625, w: 1000.25, h: 250 })
    expect({ ...scaled, src: plan.src }).toEqual(plan)
  })

  it('is the identity at scale 1', () => {
    const plan = planTilePixels(drawTile({ crop: { x: 3.5, y: 2, w: 900, h: 450 } }))
    expect(forScaledSource(plan, 1, 1)).toEqual(plan)
  })

  it('keeps the crop at the same place relative to the whole image (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 64, max: 6000 }),
        fc.integer({ min: 64, max: 6000 }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0.01, max: 0.5, noNaN: true }),
        fc.double({ min: 0.01, max: 0.5, noNaN: true }),
        fc.integer({ min: 1, max: 2048 }),
        fc.constantFrom<Rotation>(0, 90, 180, 270),
        (pxW, pxH, fx, fy, fw, fh, previewLong, rotation) => {
          const s = Math.min(1, previewLong / Math.max(pxW, pxH))
          const bw = Math.max(1, Math.round(pxW * s))
          const bh = Math.max(1, Math.round(pxH * s))
          const crop = { x: fx * pxW, y: fy * pxH, w: fw * pxW, h: fh * pxH }
          const plan = planTilePixels(drawTile({ crop, rotation }), { dpi: 96 })
          const out = forScaledSource(plan, bw / pxW, bh / pxH)
          expect(out.src.x / bw).toBeCloseTo(plan.src.x / pxW, 9)
          expect(out.src.y / bh).toBeCloseTo(plan.src.y / pxH, 9)
          expect(out.src.w / bw).toBeCloseTo(plan.src.w / pxW, 9)
          expect(out.src.h / bh).toBeCloseTo(plan.src.h / pxH, 9)
          expect(out.src.x + out.src.w).toBeLessThanOrEqual(bw + 1e-6)
          expect(out.src.y + out.src.h).toBeLessThanOrEqual(bh + 1e-6)
          expect(out.matrix).toEqual(plan.matrix)
        },
      ),
    )
  })
})

describe('downscaleSteps', () => {
  it('halves until within 2× of the target', () => {
    expect(downscaleSteps(4000, 3000, 500, 375)).toEqual([
      { w: 2000, h: 1500 },
      { w: 1000, h: 750 },
    ])
  })
  it('needs no steps for small reductions or upscales', () => {
    expect(downscaleSteps(1000, 800, 600, 480)).toEqual([])
    expect(downscaleSteps(100, 80, 600, 480)).toEqual([])
  })
})

describe('tileRenderKey', () => {
  it('is equal for identical copies and differs when anything visible differs', () => {
    const a = drawTile()
    expect(tileRenderKey(a)).toBe(tileRenderKey({ ...a, trim: { ...a.trim, x: 150 } }))
    expect(tileRenderKey(a)).not.toBe(tileRenderKey({ ...a, flipH: true }))
    expect(tileRenderKey(a)).not.toBe(tileRenderKey({ ...a, trim: { ...a.trim, w: 80 } }))
    expect(tileRenderKey(a)).not.toBe(tileRenderKey({ ...a, bleedMm: 3 }))
  })
})

describe('tileSourceDpi', () => {
  it('reports the source resolution over the printed width', () => {
    expect(tileSourceDpi(drawTile({ crop: { x: 0, y: 0, w: 800, h: 400 } }))).toBe(203)
  })

  it('uses the crop height as the printed width after a quarter turn', () => {
    const crop = { x: 0, y: 0, w: 800, h: 400 }
    expect(tileSourceDpi(drawTile({ crop, rotation: 90 }))).toBe(102)
    expect(tileSourceDpi(drawTile({ crop, rotation: 270 }))).toBe(102)
  })
})

describe('tileRenderKey with studies (M2)', () => {
  const base = drawTile()
  const blurred = drawTile({ version: 'blurred', study: { blurPct: 40, values: null } })
  const blurred70 = drawTile({ version: 'blurred', study: { blurPct: 70, values: null } })
  const values = drawTile({
    version: 'values',
    study: { blurPct: null, values: { count: 5, hue: 55, neutral: false } },
  })
  const values6 = drawTile({
    version: 'values',
    study: { blurPct: null, values: { count: 6, hue: 55, neutral: false } },
  })
  const blurValues = drawTile({
    version: 'blurValues',
    study: { blurPct: 40, values: { count: 5, hue: 55, neutral: false } },
  })

  it('differs per version and per study parameter', () => {
    const keys = [base, blurred, blurred70, values, values6, blurValues].map((t) =>
      tileRenderKey(t),
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is equal for identical copies of the same version (one embedded image)', () => {
    const copy = { ...blurred, trim: { ...blurred.trim, y: 200 } }
    expect(tileRenderKey(copy)).toBe(tileRenderKey(blurred))
  })

  it('ends with the version and the study key', () => {
    expect(tileRenderKey(values).endsWith(`|values|${studyKey(values.study)}`)).toBe(true)
    expect(tileRenderKey(base).endsWith('|original|-')).toBe(true)
  })
})
