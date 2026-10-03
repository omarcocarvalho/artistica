import { MAX_PASTED_URLS } from './limits'

export type ImportSource =
  | { readonly kind: 'file'; readonly file: File; readonly pasted: boolean }
  | { readonly kind: 'url'; readonly url: string }

/** The slice of `DataTransfer` we read, so tests need no DOM. A real DataTransfer satisfies it. */
export interface DataTransferLike {
  readonly files?: ArrayLike<File> | null
  readonly items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null
  getData(format: string): string
}

export function extractImageUrls(text: string): string[] {
  const seen = new Set<string>()
  for (const token of text.split(/\s+/)) {
    const t = token.replace(/^[<"']+|[>"']+$/g, '')
    if (!/^https?:\/\//i.test(t)) continue
    try {
      new URL(t)
    } catch {
      continue
    }
    seen.add(t)
    if (seen.size >= MAX_PASTED_URLS) break
  }
  return [...seen]
}

/**
 * MUST be called synchronously inside the paste/drop handler: a DataTransfer is empty once the
 * handler returns.
 */
export function sourcesFromDataTransfer(dt: DataTransferLike, pasted: boolean): ImportSource[] {
  const files = Array.from(dt.files ?? [])
  if (files.length > 0) return files.map((file) => ({ kind: 'file', file, pasted }))
  const fromItems = Array.from(dt.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => i.getAsFile())
    .filter((f): f is File => f !== null)
  if (fromItems.length > 0) return fromItems.map((file) => ({ kind: 'file', file, pasted }))
  const text = `${dt.getData('text/uri-list')}\n${dt.getData('text/plain')}`
  return extractImageUrls(text).map((url) => ({ kind: 'url', url }))
}

const PASTE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heic',
}
export const pastedName = (n: number, mime: string): string =>
  `pasted-image-${String(n)}.${PASTE_EXT[mime] ?? 'png'}`
