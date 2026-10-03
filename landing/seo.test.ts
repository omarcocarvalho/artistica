/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const html = read('index.html')
const ORIGIN = 'https://omarcocarvalho.github.io/artistica/'

const squash = (t: string) => t.replace(/\s+/g, ' ').trim()

function jsonLd(): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1] ?? '') as Record<string, unknown>,
  )
}
const meta = (attr: 'name' | 'property', key: string) =>
  new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`).exec(html)?.[1]

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
  it('has exactly one h1 and links the CTA to ./app/', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(/href="\.\/app\/"/)
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
  it('sitemap and robots use absolute URLs under the project site', () => {
    const sitemap = read('public/sitemap.xml')
    expect(sitemap).toContain(`<loc>${ORIGIN}</loc>`)
    expect(sitemap).toContain(`<loc>${ORIGIN}app/</loc>`)
    expect(read('public/robots.txt')).toContain(`Sitemap: ${ORIGIN}sitemap.xml`)
  })
  it('og-image.png is a 1200x630 PNG under 300 KB', () => {
    const png = readFileSync(new URL('../public/og-image.png', import.meta.url))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(png.length).toBeLessThan(300_000)
  })
})
