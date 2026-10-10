/** The gaps of a [dash, gap] pattern started at `phase` that lie wholly on a line of `length`, as [start, end] along it. */
export function wholeGaps(
  length: number,
  dash: number,
  gap: number,
  phase: number,
): [number, number][] {
  const period = dash + gap
  const eps = 1e-9 * (1 + length)
  const out: [number, number][] = []
  for (let k = -1; k * period <= length + period; k++) {
    const a = dash - phase + k * period
    const b = a + gap
    if (a >= -eps && b <= length + eps) out.push([a, b])
  }
  return out
}

/** How many whole gaps lie before and after the band `crossWidth` wide centred at `crossAt`. */
export function clearGaps(
  length: number,
  dash: number,
  gap: number,
  phase: number,
  crossAt: number,
  crossWidth: number,
): { before: number; after: number } {
  const eps = 1e-9 * (1 + length)
  const gaps = wholeGaps(length, dash, gap, phase)
  return {
    before: gaps.filter(([, b]) => b <= crossAt - crossWidth / 2 + eps).length,
    after: gaps.filter(([a]) => a >= crossAt + crossWidth / 2 - eps).length,
  }
}
