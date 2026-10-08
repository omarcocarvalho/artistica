/** Side neighbours before corner ones, so a staircase is walked step by step and no pixel is skipped. */
const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

function degree(edges: Uint8Array, w: number, h: number, x: number, y: number): number {
  let n = 0
  for (const [dx, dy] of STEPS) {
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && edges[ny * w + nx] === 1) n++
  }
  return n
}

/**
 * 8-connected chains of pixel indices covering every edge pixel once, in a fixed order: walks from
 * each endpoint (at most one neighbour) in scan order, then from the first unvisited pixel of each
 * remaining loop. A chain whose last pixel touches its first (three pixels or more) is closed: it
 * ends with its first index again.
 */
export function traceChains(edges: Uint8Array, w: number, h: number): Int32Array[] {
  const visited = new Uint8Array(w * h)
  const buf = new Int32Array(w * h + 1)
  const chains: Int32Array[] = []

  const walk = (start: number) => {
    let n = 0
    let cur = start
    visited[cur] = 1
    buf[n++] = cur
    for (;;) {
      const x = cur % w
      const y = (cur - x) / w
      let next = -1
      for (const [dx, dy] of STEPS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const k = ny * w + nx
        if (edges[k] === 1 && visited[k] === 0) {
          next = k
          break
        }
      }
      if (next < 0) break
      visited[next] = 1
      buf[n++] = next
      cur = next
    }
    const sx = start % w
    const ex = cur % w
    const sy = (start - sx) / w
    const ey = (cur - ex) / w
    if (n >= 3 && Math.abs(sx - ex) <= 1 && Math.abs(sy - ey) <= 1) buf[n++] = start
    chains.push(buf.slice(0, n))
  }

  for (let i = 0; i < edges.length; i++) {
    if (edges[i] !== 1 || visited[i] === 1) continue
    const x = i % w
    if (degree(edges, w, h, x, (i - x) / w) <= 1) walk(i)
  }
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] === 1 && visited[i] === 0) walk(i)
  }
  return chains
}
