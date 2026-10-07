import type { Locator } from '@playwright/test'
import { crc32, deflateSync } from 'node:zlib'

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

/** A solid 8-bit grayscale PNG (used for the 50 MP case). */
export function solidGrayPng(width: number, height: number, gray: number): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // colour type: grayscale
  const row = Buffer.alloc(width + 1, gray)
  row[0] = 0 // filter: none
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) row.copy(raw, y * (width + 1))
  // Copy into a standalone Uint8Array: pooled Buffers have a non-zero byteOffset, which some PNG
  // decoders (pdf-lib's) ignore.
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

// The e2e tsconfig has no DOM lib; these are the few browser globals used inside evaluate.
interface ImageLike {
  src: string
  decode(): Promise<void>
  naturalWidth: number
  naturalHeight: number
}
interface CanvasLike {
  width: number
  height: number
  getContext(id: '2d'): {
    drawImage(image: ImageLike, x: number, y: number): void
    getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
  } | null
}
declare const Image: new () => ImageLike
declare const document: { createElement(tag: 'canvas'): CanvasLike }

/**
 * The painted colour, as [r, g, b, a], at each point of the element's screenshot (CSS px from its
 * top-left corner). It reads what the browser drew, so it reaches parts `getComputedStyle` cannot,
 * such as a range input's track.
 */
export async function paintedPixels(
  target: Locator,
  points: readonly (readonly [number, number])[],
): Promise<number[][]> {
  const box = await target.boundingBox()
  if (!box) throw new Error('target is not laid out')
  const png = await target.screenshot({ animations: 'disabled', caret: 'hide' })
  return target.page().evaluate(
    async ([b64, pts, cssWidth]) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const g = canvas.getContext('2d')
      if (!g) throw new Error('canvas is not 2d')
      g.drawImage(img, 0, 0)
      const scale = img.naturalWidth / cssWidth
      return pts.map(([x, y]) =>
        Array.from(g.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data),
      )
    },
    [png.toString('base64'), points, box.width] as const,
  )
}
