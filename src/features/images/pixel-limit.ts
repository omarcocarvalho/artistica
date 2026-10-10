import { MAX_DECODED_PIXELS, MAX_DECODED_PIXELS_TOUCH } from './limits'

/** The primary pointer: phones and tablets, not a laptop that also has a touch screen. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** The most pixels a photo may declare or decode to when it is added on this device now. */
export function decodedPixelLimit(): number {
  const coarse =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia(COARSE_POINTER_QUERY).matches
  return coarse ? MAX_DECODED_PIXELS_TOUCH : MAX_DECODED_PIXELS
}
