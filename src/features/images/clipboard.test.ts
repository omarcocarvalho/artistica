import { describe, expect, it } from 'vitest'
import {
  extractImageUrls,
  pastedName,
  sourcesFromDataTransfer,
  type DataTransferLike,
} from './clipboard'

const file = (name: string, type = 'image/png') => new File([new Uint8Array([1])], name, { type })
const dt = (
  over: Partial<DataTransferLike> & { text?: string; uris?: string },
): DataTransferLike => ({
  files: [],
  items: [],
  getData: (f) =>
    f === 'text/plain' ? (over.text ?? '') : f === 'text/uri-list' ? (over.uris ?? '') : '',
  ...over,
})

describe('extractImageUrls', () => {
  it('finds http(s) URLs across lines, dedupes and ignores prose and comments', () => {
    const text =
      '# comment\nhttps://a.com/1.jpg\nsee http://b.com/2.png  and https://a.com/1.jpg\nhello'
    expect(extractImageUrls(text)).toEqual(['https://a.com/1.jpg', 'http://b.com/2.png'])
  })
  it('strips angle brackets and quotes, and caps the count', () => {
    expect(extractImageUrls('<https://a.com/x.jpg> "https://b.com/y.jpg"')).toEqual([
      'https://a.com/x.jpg',
      'https://b.com/y.jpg',
    ])
    const many = Array.from({ length: 50 }, (_, i) => `https://a.com/${String(i)}.jpg`).join('\n')
    expect(extractImageUrls(many)).toHaveLength(20)
  })
  it('returns nothing for plain text', () => {
    expect(extractImageUrls('just some words')).toEqual([])
  })
})

describe('sourcesFromDataTransfer', () => {
  it('prefers files', () => {
    const out = sourcesFromDataTransfer(
      dt({ files: [file('a.png')], text: 'https://a.com/x.jpg' }),
      true,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'file', pasted: true })
  })
  it('falls back to file items (Chromium sometimes leaves files empty)', () => {
    const f = file('image.png')
    const out = sourcesFromDataTransfer(
      dt({
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => f },
        ],
      }),
      true,
    )
    expect(out).toEqual([{ kind: 'file', file: f, pasted: true }])
  })
  it('falls back to URLs from uri-list then text', () => {
    expect(sourcesFromDataTransfer(dt({ uris: 'https://a.com/1.jpg' }), false)).toEqual([
      { kind: 'url', url: 'https://a.com/1.jpg' },
    ])
    expect(sourcesFromDataTransfer(dt({ text: 'https://a.com/2.jpg' }), true)).toEqual([
      { kind: 'url', url: 'https://a.com/2.jpg' },
    ])
  })
  it('returns [] for non-image clipboard content (plain text, empty)', () => {
    expect(sourcesFromDataTransfer(dt({ text: 'hello there' }), true)).toEqual([])
    expect(sourcesFromDataTransfer(dt({}), true)).toEqual([])
  })
})

describe('pastedName', () => {
  it('numbers pasted images and picks the extension from the MIME type', () => {
    expect(pastedName(1, 'image/png')).toBe('pasted-image-1.png')
    expect(pastedName(2, 'image/jpeg')).toBe('pasted-image-2.jpg')
    expect(pastedName(3, '')).toBe('pasted-image-3.png')
  })
})
