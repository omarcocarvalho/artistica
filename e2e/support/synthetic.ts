import type { Page } from '@playwright/test'

export interface UploadFile {
  name: string
  mimeType: string
  buffer: Buffer
}

/**
 * `count` gradient JPEGs of width x height pixels, encoded by the page's own canvas. `noisy` adds
 * thousands of small coloured rectangles so the files compress like camera photos.
 */
export async function syntheticJpegs(
  page: Page,
  count: number,
  width: number,
  height: number,
  { noisy = false }: { noisy?: boolean } = {},
): Promise<UploadFile[]> {
  // The e2e tsconfig has no DOM lib, so the page-side code uses structural types.
  const encoded = await page.evaluate(
    async ({ count, width, height, noisy }) => {
      interface Grad {
        addColorStop(offset: number, color: string): void
      }
      interface Ctx2d {
        fillStyle: unknown
        createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad
        fillRect(x: number, y: number, w: number, h: number): void
      }
      interface Canvas {
        width: number
        height: number
        getContext(id: '2d'): Ctx2d | null
        toBlob(
          cb: (b: { arrayBuffer(): Promise<ArrayBuffer> } | null) => void,
          type: string,
          q: number,
        ): void
      }
      const doc = (globalThis as unknown as { document: { createElement(tag: 'canvas'): Canvas } })
        .document
      const out: Uint8Array[] = []
      const canvas = doc.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const g = canvas.getContext('2d')
      if (!g) throw new Error('canvas is not 2d')
      for (let i = 0; i < count; i++) {
        const grad = g.createLinearGradient(0, 0, width, height)
        grad.addColorStop(0, `hsl(${String((i * 47) % 360)} 60% 45%)`)
        grad.addColorStop(1, `hsl(${String((i * 47 + 90) % 360)} 60% 75%)`)
        g.fillStyle = grad
        g.fillRect(0, 0, width, height)
        for (let k = 0; noisy && k < 4000; k++) {
          g.fillStyle = `hsl(${String((k * 97 + i * 31) % 360)} 70% ${String(20 + ((k * 13) % 60))}%)`
          g.fillRect((k * 7919) % width, (k * 104729) % height, 3 + (k % 40), 3 + ((k * 3) % 40))
        }
        const blob = await new Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>(
          (resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.8)
          },
        )
        if (!blob) throw new Error('JPEG encoding failed')
        out.push(new Uint8Array(await blob.arrayBuffer()))
      }
      return out
    },
    { count, width, height, noisy },
  )
  return encoded.map((bytes, i) => ({
    name: `synthetic-${String(i + 1).padStart(2, '0')}.jpg`,
    mimeType: 'image/jpeg',
    buffer: Buffer.from(bytes),
  }))
}

/** Width : height of the photos `mixedJpegs` cycles through: landscape, portrait and square. */
export const MIXED_ASPECTS = [4 / 3, 3 / 4, 1, 3 / 2, 2 / 3, 16 / 9] as const

/**
 * `count` synthetic JPEGs whose long side is `longSide` px, cycling through MIXED_ASPECTS, named
 * `mixed-001.jpg` onwards in that order.
 */
export async function mixedJpegs(
  page: Page,
  count: number,
  longSide: number,
  options: { noisy?: boolean } = {},
): Promise<UploadFile[]> {
  const byAspect: UploadFile[][] = []
  for (const [k, aspect] of MIXED_ASPECTS.entries()) {
    const n = Math.ceil((count - k) / MIXED_ASPECTS.length)
    const w = aspect >= 1 ? longSide : Math.round(longSide * aspect)
    const h = aspect >= 1 ? Math.round(longSide / aspect) : longSide
    byAspect.push(n > 0 ? await syntheticJpegs(page, n, w, h, options) : [])
  }
  const rounds = Math.max(...byAspect.map((files) => files.length))
  const interleaved = Array.from({ length: rounds }, (_, r) =>
    byAspect.flatMap((f) => f.slice(r, r + 1)),
  ).flat()
  return interleaved.map((file, i) => ({
    ...file,
    name: `mixed-${String(i + 1).padStart(3, '0')}.jpg`,
  }))
}
