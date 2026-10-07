import type { TileStudy } from '../../shared/model/study'
import type { PixelCtx } from '../render/pixels/bleed'
import type { TilePixelPlan } from '../render/pixels/tile-plan'
import { blurSigmaPx, gaussianBlurRGBA } from './blur'
import { lightnessRange, posterizeRGBA } from './posterize'
import { valueRamp } from './ramp'

/** In place. Blur first, then values (spec §2.6), with the lightness range measured after the blur. */
export function applyStudy(data: Uint8ClampedArray, w: number, h: number, study: TileStudy): void {
  if (study.blurPct !== null) gaussianBlurRGBA(data, w, h, blurSigmaPx(study.blurPct, w, h))
  if (study.values !== null) {
    posterizeRGBA(data, w, h, valueRamp(study.values), lightnessRange(data, w, h))
  }
}

/** Studies only the outW × outH image area inside the bleed ring (M2-R5). */
export function applyStudyToContext(
  ctx: PixelCtx,
  plan: Pick<TilePixelPlan, 'bleedPx' | 'outW' | 'outH'>,
  study: TileStudy,
): void {
  const image = ctx.getImageData(plan.bleedPx, plan.bleedPx, plan.outW, plan.outH)
  applyStudy(image.data, plan.outW, plan.outH, study)
  ctx.putImageData(image, plan.bleedPx, plan.bleedPx)
}
