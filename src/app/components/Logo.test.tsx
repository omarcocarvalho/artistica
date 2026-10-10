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

/** Every drawn shape of the first `<svg>` in `markup`, as its tag and geometry attributes. */
function shapes(markup: string): string[] {
  const type = markup.startsWith('<svg xmlns') ? 'image/svg+xml' : 'text/html'
  const svg = new DOMParser().parseFromString(markup, type).querySelector('svg')
  expect(svg).not.toBeNull()
  return [...(svg?.querySelectorAll('g, rect, path') ?? [])].map((el) =>
    [
      el.tagName.toLowerCase(),
      ...GEOMETRY.flatMap((a) => {
        const v = el.getAttribute(a)
        return v === null ? [] : [`${a}=${v.replace(/\s+/g, ' ').trim()}`]
      }),
    ].join(' '),
  )
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
  })

  it('has the same shapes as the landing page, the favicon and the share image', () => {
    const { container } = render(<Logo />)
    const ours = shapes(container.innerHTML)
    expect(ours.length).toBeGreaterThanOrEqual(5)
    const landing = read('../../../index.html')
    const header = landing.slice(landing.indexOf('<header'), landing.indexOf('</header>'))
    expect(shapes(header), 'index.html').toEqual(ours)
    expect(shapes(read('../../../public/favicon.svg')), 'favicon.svg').toEqual(ours)
    expect(shapes(read('../../../scripts/og-image.html')), 'og-image.html').toEqual(ours)
    expect(shapes(read('../../../scripts/apple-touch-icon.html')), 'apple-touch-icon.html').toEqual(
      ours,
    )
  })
})
