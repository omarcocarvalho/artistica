import { crc32, deflateSync } from 'node:zlib'

type Rgb = readonly [number, number, number]

function pngRgb(w: number, h: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB
  const stride = w * 3 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * stride + 1 + x * 3)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export const VALUE_RAMP_W = 900
export const VALUE_RAMP_H = 600

/**
 * `value-ramp.png`: a horizontal ramp 0 → 255, grey on the top half and tinted towards ochre on
 * the bottom half, so every lightness band of a value study is populated.
 */
export function valueRampPng(): Buffer {
  return pngRgb(VALUE_RAMP_W, VALUE_RAMP_H, (x, y) => {
    const v = Math.round((x / (VALUE_RAMP_W - 1)) * 255)
    return y < VALUE_RAMP_H / 2 ? [v, v, v] : [v, Math.round(v * 0.85), Math.round(v * 0.55)]
  })
}
