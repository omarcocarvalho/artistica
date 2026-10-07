/**
 * OKLab / OKLCH (Björn Ottosson, 2020) for sRGB (D65). Pure, no DOM. Used per pixel by the value
 * studies, so the hot path (lightness8) avoids allocation: one table lookup per channel, three cbrt.
 */

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255))

/** 8-bit gamma-encoded sRGB → linear [0, 1]. A value that is not an integer 0..255 skips the table. */
export function srgb8ToLinear(c8: number): number {
  return SRGB_TO_LINEAR[c8] ?? srgbToLinear(c8 / 255)
}

/** Linear [0, 1] → 8-bit sRGB, rounded and clamped to 0..255. */
export function linearToSrgb8(c: number): number {
  const x = Math.min(1, Math.max(0, c))
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  return Math.round(s * 255)
}

export interface Oklab {
  readonly L: number
  readonly a: number
  readonly b: number
}

export function linearRgbToOklab(r: number, g: number, b: number): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function oklabToLinearRgb(lab: Oklab): readonly [number, number, number] {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function oklchToOklab(L: number, C: number, hDeg: number): Oklab {
  const h = (hDeg * Math.PI) / 180
  return { L, a: C * Math.cos(h), b: C * Math.sin(h) }
}

/** OKLab L of one 8-bit sRGB pixel (the L row only). */
export function lightness8(r8: number, g8: number, b8: number): number {
  const r = srgb8ToLinear(r8)
  const g = srgb8ToLinear(g8)
  const b = srgb8ToLinear(b8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

const GAMUT_EPS = 1e-6

export function inSrgbGamut(L: number, C: number, hDeg: number): boolean {
  return oklabToLinearRgb(oklchToOklab(L, C, hDeg)).every(
    (c) => c >= -GAMUT_EPS && c <= 1 + GAMUT_EPS,
  )
}

/**
 * A chroma on the sRGB gamut boundary at (L, h): in gamut, and 1e-5 more is not (17 bisection steps
 * over [0, 0.4]). Where the in-gamut chromas at (L, h) are not one interval (very low L, and hues
 * within a fraction of a degree of the blue primary), it is not necessarily the largest.
 */
export function maxChroma(L: number, hDeg: number): number {
  if (!(L > 0 && L < 1)) return 0
  let lo = 0
  let hi = 0.4
  for (let i = 0; i < 17; i++) {
    const mid = (lo + hi) / 2
    if (inSrgbGamut(L, mid, hDeg)) lo = mid
    else hi = mid
  }
  return lo
}

export interface Rgb8 {
  readonly r: number
  readonly g: number
  readonly b: number
}

export function oklchToRgb8(L: number, C: number, hDeg: number): Rgb8 {
  const [r, g, b] = oklabToLinearRgb(oklchToOklab(L, C, hDeg))
  return { r: linearToSrgb8(r), g: linearToSrgb8(g), b: linearToSrgb8(b) }
}
