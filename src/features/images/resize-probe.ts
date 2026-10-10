import type { DecodeDeps } from './decode'

/**
 * True for WebKit (Safari and every iOS browser), the only engine where `resizeWidth`/`resizeHeight`
 * were measured to lower a decode's peak memory. Chromium and Firefox decode at full size first.
 */
export function resizeOnDecodeSavesMemory(userAgent: string): boolean {
  return userAgent.includes('AppleWebKit/') && !/(Chrome|Chromium|Edg)\//.test(userAgent)
}

/** Does `createImageBitmap` honour `resizeWidth`/`resizeHeight`? Decodes a 4x2 JPEG at 2x1. */
export async function probeResizeOnDecode(
  deps: Pick<DecodeDeps, 'createCanvas' | 'createImageBitmap'>,
): Promise<boolean> {
  try {
    const canvas = deps.createCanvas(4, 2)
    const blob = await canvas.toBlob('image/jpeg', 0.9)
    canvas.release()
    if (blob === null) return false
    const bmp = await deps.createImageBitmap(blob, {
      resizeWidth: 2,
      resizeHeight: 1,
      resizeQuality: 'high',
    })
    const honoured = bmp.width === 2 && bmp.height === 1
    bmp.close()
    return honoured
  } catch {
    return false
  }
}
