import type { DecodeDeps } from './decode'
import { injectExifOrientation } from './exif'

/**
 * Does this browser rotate pixels for `imageOrientation: 'from-image'`? Builds a 2x1 JPEG at runtime,
 * tags it EXIF orientation 6 (rotate 90 CW) and checks whether the decoded bitmap is 1x2.
 */
export async function probeBrowserAppliesExif(
  deps: Pick<DecodeDeps, 'createCanvas' | 'createImageBitmap'>,
): Promise<boolean> {
  try {
    const canvas = deps.createCanvas(2, 1)
    const blob = await canvas.toBlob('image/jpeg', 0.9)
    canvas.release()
    if (blob === null) return false
    const tagged = injectExifOrientation(new Uint8Array(await blob.arrayBuffer()), 6)
    const bmp = await deps.createImageBitmap(
      new Blob([tagged as BlobPart], { type: 'image/jpeg' }),
      {
        imageOrientation: 'from-image',
      },
    )
    const applied = bmp.height > bmp.width
    bmp.close()
    return applied
  } catch {
    return false
  }
}
