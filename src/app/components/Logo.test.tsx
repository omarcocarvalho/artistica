/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { Logo } from './Logo'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const basicsCss = read('../../shared/ui/css/basics.css')
const tokensCss = read('../../shared/theme/tokens.css')

const GEOMETRY = ['x', 'y', 'width', 'height', 'rx', 'd', 'transform', 'stroke-width'] as const
const PARTS = ['sheet', 'tile', 'spiral', 'rule'] as const
type Part = (typeof PARTS)[number]
/** The favicon is minified, so its parts carry one-letter classes. */
const FAVICON_CLASSES: Record<string, Part> = { s: 'sheet', t: 'tile', l: 'spiral', r: 'rule' }

function svgOf(markup: string): SVGSVGElement {
  const type = markup.startsWith('<svg xmlns') ? 'image/svg+xml' : 'text/html'
  const svg = new DOMParser().parseFromString(markup, type).querySelector('svg')
  if (!svg) throw new Error('no <svg> in the markup')
  return svg
}

/** Which part of the mark an element draws, from its class (`logo-mark__tile`, `mark__tile`, `t`). */
function partOf(el: Element): Part | undefined {
  for (const c of el.classList) {
    const named = /__([a-z]+)$/.exec(c)?.[1]
    if (named && (PARTS as readonly string[]).includes(named)) return named as Part
    if (FAVICON_CLASSES[c]) return FAVICON_CLASSES[c]
  }
  return undefined
}

/** Every drawn shape of the first `<svg>` in `markup`, as its tag, part and geometry attributes. */
function shapes(markup: string): string[] {
  return [...svgOf(markup).querySelectorAll('g, rect, path')].map((el) =>
    [
      el.tagName.toLowerCase(),
      ...(partOf(el) ? [`part=${partOf(el) ?? ''}`] : []),
      ...GEOMETRY.flatMap((a) => {
        const v = el.getAttribute(a)
        return v === null ? [] : [`${a}=${v.replace(/\s+/g, ' ').trim()}`]
      }),
    ].join(' '),
  )
}

/** `{ before, media }`: the CSS outside the dark-scheme media query, and the body of that query. */
function splitDark(css: string): { before: string; media: string } {
  const at = css.indexOf('@media (prefers-color-scheme: dark)')
  if (at < 0) return { before: css, media: '' }
  const open = css.indexOf('{', at)
  let depth = 1
  let i = open + 1
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    i++
  }
  return { before: css.slice(0, at) + css.slice(i), media: css.slice(open + 1, i - 1) }
}

/** `fill` and `stroke` declared for each simple class selector in flat CSS rules. */
function classPaint(css: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  for (const [, selectors = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = Object.fromEntries(
      body
        .split(';')
        .map((d) => d.split(':').map((x) => x.trim()))
        .filter(([k, v]) => (k === 'fill' || k === 'stroke') && v),
    ) as Record<string, string>
    for (const sel of selectors.split(',').map((x) => x.trim())) {
      const cls = /^\.([\w-]+)$/.exec(sel)?.[1]
      if (cls) out.set(cls, { ...out.get(cls), ...decls })
    }
  }
  return out
}

/** The fill and stroke each part of a standalone copy of the mark resolves to, light and dark. */
function paint(markup: string, scheme: 'light' | 'dark'): Record<Part, string> {
  const svg = svgOf(markup)
  const css = [...svg.ownerDocument.querySelectorAll('style')].map((s) => s.textContent).join('\n')
  const { before, media } = splitDark(css)
  const base = classPaint(before)
  const dark = classPaint(media)
  const out = {} as Record<Part, string>
  for (const el of svg.querySelectorAll('rect, path')) {
    const part = partOf(el)
    if (!part) continue
    const p: Record<string, string> = {}
    for (const c of el.classList)
      Object.assign(p, base.get(c), scheme === 'dark' ? dark.get(c) : {})
    out[part] = `fill:${hex(p.fill ?? 'black')} stroke:${hex(p.stroke ?? 'none')}`
  }
  return out
}

const hex = (c: string) => c.toLowerCase().replace(/^#(\w)(\w)(\w)$/, '#$1$1$2$2$3$3')

/** A colour token's value in the light theme (first declaration) or the manual dark theme. */
function token(name: string, scheme: 'light' | 'dark'): string {
  const css =
    scheme === 'dark' ? tokensCss.slice(tokensCss.indexOf(":root[data-theme='dark']")) : tokensCss
  const value = new RegExp(`${name}: (#[0-9a-f]{3,6});`, 'i').exec(css)?.[1]
  expect(value, name).toBeDefined()
  return hex(value ?? '')
}

/** The body of the first rule for `selector` inside the first `@media (forced-colors: active)` after `from`. */
function forcedRule(css: string, from: string, selector: string): string {
  const media = css.indexOf('@media (forced-colors: active)', css.indexOf(from))
  expect(media).toBeGreaterThan(-1)
  const at = css.indexOf(`${selector} {`, media)
  expect(at).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}

/** The body of the rule whose whole selector is `selector` (not a selector list). */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|[{}])\\s*${escaped} \\{`).exec(css)
  expect(match, selector).not.toBeNull()
  const at = match?.index ?? 0
  return css.slice(at, css.indexOf('}', at + 1))
}

beforeAll(async () => {
  await initI18n()
})

describe('Logo', () => {
  it('is one inline SVG image named Artistica', () => {
    const { container } = render(<Logo />)
    const img = screen.getByRole('img', { name: 'Artistica' })
    expect(img.tagName.toLowerCase()).toBe('svg')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(img).toHaveAttribute('viewBox', '0 0 32 32')
    expect(img.querySelector('text')).toBeNull()
  })

  it('draws direction A, the sheet and spiral: a tilted sheet, one tile, the spiral and a rule', () => {
    const { container } = render(<Logo />)
    const svg = container.querySelector('svg')
    expect(svg?.querySelector('g')).toHaveAttribute('transform', 'rotate(-6 16 16)')
    expect(svg?.querySelectorAll('.logo-mark__sheet')).toHaveLength(1)
    expect(svg?.querySelectorAll('.logo-mark__tile')).toHaveLength(1)
    expect(svg?.querySelectorAll('.logo-mark__spiral')).toHaveLength(1)
    expect(svg?.querySelectorAll('.logo-mark__rule')).toHaveLength(1)
  })

  it('takes every colour from the stylesheet, never from a literal in the markup', () => {
    const { container } = render(<Logo />)
    const markup = container.innerHTML
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(markup).not.toMatch(/\b(fill|stroke)="(?!none")/)
    expect(markup).not.toMatch(/rgb|hsl|oklch|style=/i)
  })

  it('maps its parts to theme tokens: white paper, terracotta tile, ochre spiral, ink outline', () => {
    const mark = rule(basicsCss, '.logo-mark')
    expect(mark).toContain('--logo-ink: var(--color-ink)')
    expect(mark).toContain('--logo-paper: var(--color-paper)')
    expect(mark).toContain('--logo-tile: var(--color-brand)')
    expect(mark).toContain('--logo-line: var(--color-ochre)')
    expect(mark).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rule(basicsCss, '.logo-mark__sheet')).toMatch(
      /fill: var\(--logo-paper\);\s*stroke: var\(--logo-ink\)/,
    )
    expect(rule(basicsCss, '.logo-mark__tile')).toContain('fill: var(--logo-tile)')
    expect(rule(basicsCss, '.logo-mark__spiral')).toContain('stroke: var(--logo-line)')
    expect(rule(basicsCss, '.logo-mark__rule')).toContain('stroke: var(--logo-ink)')
  })

  it('keeps the tile terracotta in both themes, as the white paper is', () => {
    expect(tokensCss).toMatch(/--color-brand: #b0432a;/)
    const dark = tokensCss.slice(tokensCss.indexOf('@media (prefers-color-scheme: dark)'))
    expect(dark).not.toContain('--color-brand')
  })

  it('follows forced colours with the system text and background colours', () => {
    const forced = forcedRule(basicsCss, '.logo-mark', '.logo-mark')
    expect(forced).toContain('--logo-ink: CanvasText')
    expect(forced).toContain('--logo-paper: Canvas')
    expect(forced).toContain('--logo-tile: CanvasText')
    expect(forced).toContain('--logo-line: Canvas')
    expect(forced).toContain('forced-color-adjust: none')
  })

  it('has the same shapes as the landing page, the favicon and the share image', () => {
    const { container } = render(<Logo />)
    const ours = shapes(container.innerHTML)
    expect(ours.length).toBeGreaterThanOrEqual(5)
    const landing = read('../../../landing/page.html')
    const header = landing.slice(landing.indexOf('<header'), landing.indexOf('</header>'))
    expect(svgOf(header).classList.contains('logo-mark'), 'landing/page.html logo-mark').toBe(true)
    expect(shapes(header), 'landing/page.html').toEqual(ours)
    expect(shapes(read('../../../public/favicon.svg')), 'favicon.svg').toEqual(ours)
    expect(shapes(read('../../../scripts/og-image.html')), 'og-image.html').toEqual(ours)
    expect(shapes(read('../../../scripts/apple-touch-icon.html')), 'apple-touch-icon.html').toEqual(
      ours,
    )
  })

  it('paints the favicon, share image and home-screen icon with the theme token values', () => {
    const light = {
      sheet: `fill:${token('--color-paper', 'light')} stroke:${token('--color-ink', 'light')}`,
      tile: `fill:${token('--color-brand', 'light')} stroke:none`,
      spiral: `fill:none stroke:${token('--color-ochre', 'light')}`,
      rule: `fill:none stroke:${token('--color-ink', 'light')}`,
    }
    for (const file of [
      'public/favicon.svg',
      'scripts/og-image.html',
      'scripts/apple-touch-icon.html',
    ]) {
      expect(paint(read(`../../../${file}`), 'light'), file).toEqual(light)
    }
    const darkInk = token('--color-ink', 'dark')
    expect(paint(read('../../../public/favicon.svg'), 'dark'), 'favicon.svg dark').toEqual({
      ...light,
      sheet: `fill:${token('--color-paper', 'light')} stroke:${darkInk}`,
      rule: `fill:none stroke:${darkInk}`,
    })
  })
})
