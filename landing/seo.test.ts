/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  landingLanguages,
  renderLandingPage,
  sitemapXml,
  SITE_ORIGIN,
  type LandingStrings,
} from '../scripts/vite-landing.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const langs = landingLanguages(readdirSync(new URL('./locales/', import.meta.url)))
const html = renderLandingPage(
  read('landing/page.html'),
  JSON.parse(read('landing/locales/en.json')) as LandingStrings,
  'en',
  langs,
)
const ORIGIN = 'https://omarcocarvalho.github.io/artistica/'

const squash = (t: string) => t.replace(/\s+/g, ' ').trim()

function jsonLd(): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1] ?? '') as Record<string, unknown>,
  )
}
const meta = (attr: 'name' | 'property', key: string) =>
  new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`).exec(html)?.[1]

/** The pixels of an 8-bit RGB PNG (colour type 2), as `#rrggbb` per (x, y). */
function rgbPixels(png: Buffer): (x: number, y: number) => string {
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  expect([png[24], png[25]]).toEqual([8, 2])
  const idat: Buffer[] = []
  for (let o = 8; o < png.length;) {
    const len = png.readUInt32BE(o)
    if (png.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = 3
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const at = (i: number) => out[i] ?? 0
      const a = x >= bpp ? at(y * stride + x - bpp) : 0
      const b = y > 0 ? at((y - 1) * stride + x) : 0
      const c = x >= bpp && y > 0 ? at((y - 1) * stride + x - bpp) : 0
      const pa = Math.abs(b - c)
      const pb = Math.abs(a - c)
      const pc = Math.abs(a + b - 2 * c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter ?? 0] ?? 0
      out[y * stride + x] = ((raw[y * (stride + 1) + 1 + x] ?? 0) + predictor) & 255
    }
  }
  return (x, y) =>
    `#${[...out.subarray(y * stride + x * bpp, y * stride + x * bpp + bpp)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

describe('landing SEO', () => {
  it('has a title and description of sensible length', () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? ''
    expect(title.length).toBeGreaterThan(10)
    expect(title.length).toBeLessThanOrEqual(65)
    const d = meta('name', 'description') ?? ''
    expect(d.length).toBeGreaterThan(70)
    expect(d.length).toBeLessThanOrEqual(160)
  })
  it('has canonical, Open Graph and Twitter tags with absolute URLs', () => {
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}"`)
    expect(meta('property', 'og:url')).toBe(ORIGIN)
    expect(meta('property', 'og:image')).toBe(`${ORIGIN}og-image.png`)
    expect(meta('property', 'og:image:width')).toBe('1200')
    expect(meta('property', 'og:image:height')).toBe('630')
    expect(meta('name', 'twitter:card')).toBe('summary_large_image')
    expect(meta('name', 'twitter:image')).toBe(`${ORIGIN}og-image.png`)
    expect(meta('property', 'og:title')).toBeTruthy()
    expect(meta('property', 'og:description')).toBeTruthy()
  })
  it('has exactly one h1 and links the CTA to /artistica/app/', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(/href="\/artistica\/app\/"/)
  })
  it('has WebApplication and FAQPage JSON-LD that parse', () => {
    const types = jsonLd().map((j) => j['@type'])
    expect(types).toContain('WebApplication')
    expect(types).toContain('FAQPage')
  })
  it('JSON-LD FAQ matches the visible FAQ exactly (questions and answers)', () => {
    const faq = jsonLd().find((j) => j['@type'] === 'FAQPage') as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[]
    }
    const visible = [
      ...html.matchAll(
        /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/details>/g,
      ),
    ].map((m) => ({ q: squash(m[1] ?? ''), a: squash((m[2] ?? '').replace(/<[^>]+>/g, '')) }))
    expect(visible.length).toBeGreaterThanOrEqual(5)
    expect(faq.mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }))).toEqual(visible)
  })
  it('credits the MediaPipe models in the FAQ, visibly and in the JSON-LD (owner Q14)', () => {
    const credit = "Face and pose guides use Google's MediaPipe models, running on your device."
    const faq = jsonLd().find((j) => j['@type'] === 'FAQPage') as {
      mainEntity: { acceptedAnswer: { text: string } }[]
    }
    expect(faq.mainEntity.map((e) => e.acceptedAnswer.text)).toContain(credit)
    const answers = [
      ...html.matchAll(
        /<details[^>]*>\s*<summary[^>]*>[\s\S]*?<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>/g,
      ),
    ].map((m) => squash((m[1] ?? '').replace(/<[^>]+>/g, '')))
    expect(answers).toContain(credit)
  })
  it('sitemap and robots use absolute URLs under the project site', () => {
    const sitemap = sitemapXml(SITE_ORIGIN, langs)
    expect(sitemap).toContain(`<loc>${ORIGIN}</loc>`)
    expect(sitemap).toContain(`<loc>${ORIGIN}app/</loc>`)
    expect(read('public/robots.txt')).toContain(`Sitemap: ${ORIGIN}sitemap.xml`)
  })
  it.each(['landing/page.html', 'app/index.html'])(
    '%s links the SVG favicon and the 180 px home-screen icon',
    (page) => {
      const doc = read(page)
      expect(doc).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
      expect(doc).toContain(
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
      )
    },
  )
  it('favicon.svg is the logo mark, standalone, with a dark-tab variant', () => {
    const svg = read('public/favicon.svg')
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 32"/)
    expect(svg).not.toContain('<text')
    expect(svg).not.toMatch(/var\(/)
    expect(svg).toContain('@media (prefers-color-scheme: dark)')
    expect(svg.length).toBeLessThan(2_048)
  })
  it('apple-touch-icon.png is an opaque 180x180 PNG', () => {
    const png = readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(180)
    expect(png.readUInt32BE(20)).toBe(180)
    // Colour type 2 is RGB without alpha: iOS fills transparent pixels with black.
    expect(png[25]).toBe(2)
    expect(png.length).toBeLessThan(30_000)
  })
  it('apple-touch-icon.png shows the mark on the light canvas: white sheet, terracotta tile', () => {
    const tokens = read('src/shared/theme/tokens.css')
    const light = (name: string) => new RegExp(`${name}: (#[0-9a-f]{6});`).exec(tokens)?.[1]
    const px = rgbPixels(readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url)))
    // The 32-unit mark is drawn at 132 px in the middle of the 180 px icon, turned -6°.
    expect(px(0, 0)).toBe(light('--color-canvas'))
    expect(px(179, 179)).toBe(light('--color-canvas'))
    expect(px(114, 100)).toBe(light('--color-brand'))
    expect(px(123, 111)).toBe(light('--color-paper'))
  })
  it('og-image.png is a 1200x630 PNG under 300 KB', () => {
    const png = readFileSync(new URL('../public/og-image.png', import.meta.url))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(png.length).toBeLessThan(300_000)
  })
})
