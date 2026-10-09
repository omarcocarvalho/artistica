import type { PoseLandmarks } from '../types'

export const SYNTHETIC_W = 600
export const SYNTHETIC_H = 900

type Px = readonly [number, number]

/** MediaPipe pose order: 0 nose … 32 right foot index. "Left" is the person's left. */
function fromPx(px: readonly Px[]): PoseLandmarks {
  if (px.length !== 33) throw new Error(`a pose has 33 landmarks, got ${String(px.length)}`)
  return {
    points: px.map(([x, y]) => ({ x: x / SYNTHETIC_W, y: y / SYNTHETIC_H })),
    visibility: px.map(() => 1),
  }
}

/** Facing the camera, arms straight out, in a 600 × 900 image. */
export function tPose(): PoseLandmarks {
  return fromPx([
    [300, 120],
    [310, 110],
    [315, 110],
    [320, 110],
    [290, 110],
    [285, 110],
    [280, 110],
    [330, 118],
    [270, 118],
    [308, 135],
    [292, 135],
    [360, 220],
    [240, 220],
    [440, 220],
    [160, 220],
    [520, 220],
    [80, 220],
    [535, 222],
    [65, 222],
    [538, 218],
    [62, 218],
    [532, 216],
    [68, 216],
    [340, 460],
    [260, 460],
    [345, 620],
    [255, 620],
    [350, 780],
    [250, 780],
    [355, 800],
    [245, 800],
    [365, 795],
    [235, 795],
  ])
}

/** Mid-stride, seen from the side and a little turned, in a 600 × 900 image. */
export function walkingPose(): PoseLandmarks {
  return fromPx([
    [330, 140],
    [334, 130],
    [337, 130],
    [340, 130],
    [326, 131],
    [323, 131],
    [320, 131],
    [338, 138],
    [306, 140],
    [334, 156],
    [322, 156],
    [330, 240],
    [290, 236],
    [372, 330],
    [250, 320],
    [390, 420],
    [282, 400],
    [396, 432],
    [290, 412],
    [400, 428],
    [294, 408],
    [394, 424],
    [288, 404],
    [318, 470],
    [292, 466],
    [380, 610],
    [250, 620],
    [430, 760],
    [200, 770],
    [420, 780],
    [190, 790],
    [450, 772],
    [220, 790],
  ])
}
