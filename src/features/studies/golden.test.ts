import { describe, expect, it } from 'vitest'
import { STUDY_VERSIONS, tileStudyFor, type StudySettings } from '../../shared/model/study'
import { applyStudy } from './apply-study'
import { lightnessRampImage } from './test-support/lightness'
import { noise, rgba } from './test-support/pixels'

/** FNV-1a (32-bit) over bytes, as 8 hex digits. */
function fnv1a(bytes: Uint8ClampedArray): string {
  let h = 0x811c9dc5
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const W = 96
const H = 64
const IMAGES: Record<string, () => Uint8ClampedArray> = {
  lightness: () => lightnessRampImage(W, H, 0.1, 0.95),
  checker: () =>
    rgba(W, H, (x, y) => (((x >> 3) + (y >> 3)) % 2 === 0 ? [20, 40, 160] : [240, 200, 120])),
  noise: () => noise(W, H, 42),
  radial: () =>
    rgba(W, H, (x, y) => {
      const d = Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2)
      return [Math.round(255 * (1 - d)), Math.round(180 * d), 90]
    }),
}
const STUDY: StudySettings = {
  versions: [...STUDY_VERSIONS],
  blurPct: 40,
  values: { count: 5, hue: 55, neutral: false },
}

/**
 * Exact pixels for fixed inputs: any change to the blur, the ramp, the range or the binning fails
 * here. Update the snapshot only for an intended change, and say so in the PR.
 */
describe('study outputs', () => {
  it('match the golden hashes', () => {
    const out: Record<string, string> = {}
    for (const [name, make] of Object.entries(IMAGES)) {
      for (const version of STUDY_VERSIONS) {
        const d = make()
        const s = tileStudyFor(version, STUDY)
        if (s) applyStudy(d, W, H, s)
        out[`${name}/${version}`] = fnv1a(d)
      }
    }
    const originals = Object.keys(IMAGES).map((name) => out[`${name}/original`])
    expect(new Set(originals).size).toBe(originals.length)
    for (const [key, hash] of Object.entries(out)) {
      if (!key.endsWith('/original')) expect(originals).not.toContain(hash)
    }
    expect(out).toMatchSnapshot()
  })
})
