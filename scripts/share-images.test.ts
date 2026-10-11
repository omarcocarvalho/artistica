import { readFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  cjkFontStack,
  readShareText,
  shareImageFile,
  shareImageHtml,
  shareText,
  withShareText,
  type ShareText,
} from './share-images.ts'
import type { LandingStrings } from './vite-landing.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const TOKENS = read('src/shared/theme/tokens.css')
const TEMPLATE = read('scripts/og-image.html')
const FONTS = {
  fraunces: 'file:///f.woff2',
  atkinson: 'file:///a.woff2',
  caveat: 'file:///c.woff2',
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A 1 × 1 RGB PNG. */
function tinyPng(): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Chunk types in order, each with its CRC checked. */
function chunks(png: Uint8Array): string[] {
  const buf = Buffer.from(png)
  const types: string[] = []
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o)
    const body = buf.subarray(o + 4, o + 8 + len)
    expect(buf.readUInt32BE(o + 8 + len), 'chunk CRC').toBe(crc32(body))
    types.push(buf.toString('ascii', o + 4, o + 8))
    o += 12 + len
  }
  return types
}

const STRINGS: LandingStrings = {
  hero: { hand: 'for drawing & painting', title: 'Turn photos into sheets.', points: 'Free' },
  privacy: { claims: { heroNeverLeave: 'Photos never leave your device' } },
}

describe('share images', () => {
  it('names the English image og-image.png and the others og-image-<code>.png', () => {
    expect(shareImageFile('en')).toBe('og-image.png')
    expect(shareImageFile('pt-BR')).toBe('og-image-pt-BR.png')
    expect(shareImageFile('zh-CN')).toBe('og-image-zh-CN.png')
  })

  it('takes its text from the hero: the hand line, the title, and the privacy line with the points', () => {
    expect(shareText(STRINGS, 'ja')).toEqual({
      lang: 'ja',
      hand: 'for drawing & painting',
      title: 'Turn photos into sheets.',
      tagline: 'Photos never leave your device · Free',
    })
  })

  it('fails on a missing key, naming it and the language', () => {
    expect(() => shareText({ hero: { hand: 'h', title: 't' } }, 'ko')).toThrow(
      /privacy\.claims\.heroNeverLeave.*ko|ko.*privacy\.claims\.heroNeverLeave/,
    )
  })

  it('reads each CJK language its own font list from the app tokens (M6-R17), and none for the others', () => {
    expect(cjkFontStack(TOKENS, 'ja')).toMatch(/^"Hiragino Sans", "Hiragino Kaku Gothic ProN",/)
    expect(cjkFontStack(TOKENS, 'ko')).toMatch(/^"Apple SD Gothic Neo", "Malgun Gothic",/)
    expect(cjkFontStack(TOKENS, 'zh-CN')).toMatch(/^"PingFang SC", "Hiragino Sans GB",/)
    for (const lang of ['en', 'pt-BR', 'it', 'es'] as const)
      expect(cjkFontStack(TOKENS, lang)).toBe('')
  })

  it('fills the template: lang, text escaped, a separator kept on the line before a break, fonts, and the CJK list after each Latin family', () => {
    const text: ShareText = {
      lang: 'zh-CN',
      hand: 'a & b',
      title: '<script>alert(1)</script>',
      tagline: '"x" · <b>',
    }
    const html = shareImageHtml(TEMPLATE, text, FONTS, cjkFontStack(TOKENS, 'zh-CN'))
    expect(html).toMatch(/^<!doctype html>\s*<html lang="zh-CN">/)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('a &amp; b')
    expect(html).toContain('&quot;x&quot;&nbsp;· &lt;b&gt;')
    expect(html).toContain("url('file:///f.woff2')")
    expect(html).toContain('font-family: Fraunces, "PingFang SC", "Hiragino Sans GB"')
    expect(html).toContain('font-family: Caveat, "PingFang SC", "Hiragino Sans GB"')
    expect(html).toContain('font-family: Atkinson, "PingFang SC", "Hiragino Sans GB"')
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it('keeps the Latin fallbacks when the language has no CJK list', () => {
    const html = shareImageHtml(TEMPLATE, { ...shareText(STRINGS, 'en') }, FONTS, '')
    expect(html).toContain('font-family: Fraunces, serif')
    expect(html).toContain('font-family: Caveat, cursive')
    expect(html).toContain('font-family: Atkinson, sans-serif')
    expect(html).toContain('<html lang="en">')
  })

  it('records the text an image was rendered from in an iTXt chunk after IHDR, and reads it back', () => {
    const text: ShareText = {
      lang: 'ja',
      hand: 'デッサンと絵画に',
      title: '資料写真',
      tagline: 'a · b',
    }
    const png = withShareText(tinyPng(), text)
    expect(chunks(png)).toEqual(['IHDR', 'iTXt', 'IDAT', 'IEND'])
    expect(readShareText(png)).toEqual(text)
  })

  it('replaces an earlier record instead of adding a second one', () => {
    const first = withShareText(tinyPng(), { lang: 'en', hand: 'a', title: 'b', tagline: 'c' })
    const second = withShareText(first, { lang: 'en', hand: 'x', title: 'y', tagline: 'z' })
    expect(chunks(second)).toEqual(['IHDR', 'iTXt', 'IDAT', 'IEND'])
    expect(readShareText(second)?.title).toBe('y')
  })

  it('reads no record from a PNG without one, and refuses what is not a PNG', () => {
    expect(readShareText(tinyPng())).toBeNull()
    expect(() => readShareText(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/)
  })
})
