import { crc32 } from 'node:zlib'
import type { LanguageCode } from '../src/shared/i18n/languages.ts'
import { shareImageFile, type LandingStrings } from './vite-landing.ts'

export { shareImageFile }

export interface ShareText {
  readonly lang: LanguageCode
  readonly hand: string
  readonly title: string
  readonly tagline: string
}

export interface ShareFonts {
  readonly fraunces: string
  readonly atkinson: string
  readonly caveat: string
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const RECORD_KEYWORD = 'artistica:share'

function lookup(strings: LandingStrings, key: string, lang: LanguageCode): string {
  let node: string | LandingStrings | undefined = strings
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined
  if (typeof node !== 'string') throw new Error(`share image: no string for "${key}" in ${lang}`)
  return node
}

/** The hero's own lines, the tagline joined as `landing/page.html` joins it. */
export function shareText(strings: LandingStrings, lang: LanguageCode): ShareText {
  return {
    lang,
    hand: lookup(strings, 'hero.hand', lang),
    title: lookup(strings, 'hero.title', lang),
    tagline: `${lookup(strings, 'privacy.claims.heroNeverLeave', lang)} · ${lookup(strings, 'hero.points', lang)}`,
  }
}

/** The `--font-cjk` list the app's tokens give `lang` (M6-R17), or '' when it has none. */
export function cjkFontStack(tokensCss: string, lang: LanguageCode): string {
  const block = new RegExp(`:lang\\(${lang}\\)\\s*\\{\\s*--font-cjk:\\s*([^;]+);`).exec(tokensCss)
  return block?.[1]?.trim() ?? ''
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const family = (latin: string, cjk: string, generic: string) =>
  cjk ? `${latin}, ${cjk}, sans-serif` : `${latin}, ${generic}`

export function shareImageHtml(
  template: string,
  text: ShareText,
  fonts: ShareFonts,
  cjk: string,
): string {
  const values: Readonly<Record<string, string | undefined>> = {
    LANG: escapeHtml(text.lang),
    HAND: escapeHtml(text.hand),
    TITLE: escapeHtml(text.title),
    TAGLINE: escapeHtml(text.tagline).replaceAll(' · ', '&nbsp;· '),
    FRAUNCES: fonts.fraunces,
    ATKINSON: fonts.atkinson,
    CAVEAT: fonts.caveat,
    DISPLAY_FONT: family('Fraunces', cjk, 'serif'),
    HAND_FONT: family('Caveat', cjk, 'cursive'),
    UI_FONT: family('Atkinson', cjk, 'sans-serif'),
  }
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`share image: unknown placeholder ${match}`)
    return value
  })
}

function assertPng(png: Uint8Array): Buffer {
  const buf = Buffer.from(png)
  if (buf.length < 8 || PNG_SIGNATURE.some((b, i) => buf[i] !== b))
    throw new Error('share image: not a PNG')
  return buf
}

interface Chunk {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly data: Buffer
}

function chunksOf(buf: Buffer): Chunk[] {
  const out: Chunk[] = []
  for (let o = 8; o + 12 <= buf.length;) {
    const len = buf.readUInt32BE(o)
    out.push({
      type: buf.toString('ascii', o + 4, o + 8),
      start: o,
      end: o + 12 + len,
      data: buf.subarray(o + 8, o + 8 + len),
    })
    o += 12 + len
  }
  return out
}

function isRecord(chunk: Chunk): boolean {
  return chunk.type === 'iTXt' && chunk.data.toString('latin1').startsWith(`${RECORD_KEYWORD}\0`)
}

/** `png` with an iTXt chunk after IHDR holding `text` as JSON, replacing an earlier one. */
export function withShareText(png: Uint8Array, text: ShareText): Uint8Array {
  const buf = assertPng(png)
  const header = Buffer.from(`${RECORD_KEYWORD}\0\0\0\0\0`, 'latin1')
  const data = Buffer.concat([header, Buffer.from(JSON.stringify(text), 'utf8')])
  const body = Buffer.concat([Buffer.from('iTXt', 'ascii'), data])
  const record = Buffer.alloc(12 + data.length)
  record.writeUInt32BE(data.length, 0)
  body.copy(record, 4)
  record.writeUInt32BE(crc32(body), 8 + data.length)
  const parts: Buffer[] = [buf.subarray(0, 8)]
  for (const chunk of chunksOf(buf)) {
    if (isRecord(chunk)) continue
    parts.push(buf.subarray(chunk.start, chunk.end))
    if (chunk.type === 'IHDR') parts.push(record)
  }
  return Buffer.concat(parts)
}

/** The text `withShareText` recorded in `png`, or null when it has none. */
export function readShareText(png: Uint8Array): ShareText | null {
  const record = chunksOf(assertPng(png)).find(isRecord)
  if (!record) return null
  const json = record.data.subarray(RECORD_KEYWORD.length + 5).toString('utf8')
  return JSON.parse(json) as ShareText
}
