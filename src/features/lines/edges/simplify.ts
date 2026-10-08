/**
 * Ramer–Douglas–Peucker on flat x,y pairs, measured to the segment (not its line), so a hairpin
 * keeps its tip. Squared distances over the common denominator |AB|²: exact on integer points.
 * A point exactly ε away is dropped.
 */
export function rdp(points: readonly number[], epsilon: number): number[] {
  const n = points.length >> 1
  if (n <= 2) return points.slice(0, n * 2)
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const eps2 = epsilon * epsilon
  const stack: number[] = [0, n - 1]
  while (stack.length > 0) {
    const b = stack.pop() ?? 0
    const a = stack.pop() ?? 0
    if (b - a < 2) continue
    const ax = points[2 * a] ?? 0
    const ay = points[2 * a + 1] ?? 0
    const vx = (points[2 * b] ?? 0) - ax
    const vy = (points[2 * b + 1] ?? 0) - ay
    const len2 = vx * vx + vy * vy
    const den = len2 === 0 ? 1 : len2
    let best = -1
    let bestD = -1
    for (let k = a + 1; k < b; k++) {
      const px = (points[2 * k] ?? 0) - ax
      const py = (points[2 * k + 1] ?? 0) - ay
      const dot = px * vx + py * vy
      let d: number
      if (dot <= 0) {
        d = (px * px + py * py) * den
      } else if (dot >= len2) {
        const qx = px - vx
        const qy = py - vy
        d = (qx * qx + qy * qy) * den
      } else {
        const cross = px * vy - py * vx
        d = cross * cross
      }
      if (d > bestD) {
        bestD = d
        best = k
      }
    }
    if (bestD > eps2 * den) {
      keep[best] = 1
      stack.push(a, best, best, b)
    }
  }
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    if (keep[k] === 1) out.push(points[2 * k] ?? 0, points[2 * k + 1] ?? 0)
  }
  return out
}
