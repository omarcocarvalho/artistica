/** Lazy: the `heic-to` chunk (libheif WASM) is only fetched when native decoding failed. */
export async function loadHeicConverter(): Promise<(blob: Blob) => Promise<Blob>> {
  const { heicTo } = await import('heic-to')
  return (blob) => heicTo({ blob, type: 'image/jpeg', quality: 0.95 })
}
