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
