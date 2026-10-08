import type { ImageDescriptor } from '../../../shared/model/image'
import type { PathCmd } from '../types'
import { meetsCrop } from './map'
import type { EdgeOutline } from './types'

/** Source px. A polyline that meets the crop is kept whole (the tile clip trims it, M3-R4). */
export function edgePaths(
  outline: EdgeOutline,
  img: Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>,
): PathCmd[] {
  const out: PathCmd[] = []
  for (const line of outline.polylines) {
    if (line.length < 2) continue
    const pts = line.map((p) => ({ x: p.x * img.pxW, y: p.y * img.pxH }))
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of pts) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    if (!meetsCrop({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, img)) continue
    pts.forEach((p, i) => out.push({ op: i === 0 ? 'M' : 'L', x: p.x, y: p.y }))
  }
  return out
}
