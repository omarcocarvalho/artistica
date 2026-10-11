import { describe, expect, it } from 'vitest'
import { screensIndexHtml, type ScreenEntry } from './screens-index.ts'

const SCREENS: ScreenEntry[] = [
  { id: 'empty', width: 'desktop', description: 'Empty workspace' },
  { id: 'empty', width: 'phone', description: 'Images step, empty' },
  { id: 'export', width: 'desktop', description: 'Export dialog <summary> & "done"' },
]

const FILES = [
  'export/en-desktop.png',
  'empty/ja-phone.png',
  'empty/en-desktop.png',
  'empty/pseudo-desktop.png',
  'empty/en-phone.png',
  'empty/ja-desktop.png',
  'notes.txt',
  'stray/en-desktop.png',
]

function rows(html: string): string[] {
  return [...html.matchAll(/<tr data-screen="([^"]+)">/g)].map((m) => m[1])
}

describe('screensIndexHtml', () => {
  it('has one row per screen, in the order of the screen list', () => {
    expect(rows(screensIndexHtml(FILES, SCREENS))).toEqual(['empty', 'export'])
  })

  it('puts the languages side by side in LANGUAGES order, the pseudo-locale last', () => {
    const html = screensIndexHtml(FILES, SCREENS)
    const head = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? ''
    expect([...head.matchAll(/<th lang="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'en',
      'ja',
      'en-XA',
    ])
  })

  it('shows desktop and phone images for each language, linked to the full-size file', () => {
    const html = screensIndexHtml(FILES, SCREENS)
    const row = /<tr data-screen="empty">([\s\S]*?)<\/tr>/.exec(html)?.[1] ?? ''
    expect([...row.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'empty/en-desktop.png',
      'empty/en-phone.png',
      'empty/ja-desktop.png',
      'empty/ja-phone.png',
      'empty/pseudo-desktop.png',
    ])
    expect(row).toContain('<a href="empty/ja-phone.png">')
    expect(row).toContain('alt="Images step, empty — 日本語, phone"')
  })

  it('gives each screen its descriptions, escaped, and marks a missing capture', () => {
    const html = screensIndexHtml(FILES, SCREENS)
    expect(html).toContain('Empty workspace')
    expect(html).toContain('Images step, empty')
    expect(html).toContain('Export dialog &lt;summary&gt; &amp; &quot;done&quot;')
    const exportRow = /<tr data-screen="export">([\s\S]*?)<\/tr>/.exec(html)?.[1] ?? ''
    expect(exportRow.match(/class="missing"/g)).toHaveLength(2)
  })

  it('ignores files that are not captures of a listed screen', () => {
    const html = screensIndexHtml(FILES, SCREENS)
    expect(html).not.toContain('stray')
    expect(html).not.toContain('notes.txt')
  })

  it('loads nothing from another site', () => {
    const html = screensIndexHtml(FILES, SCREENS)
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//)
    expect(html).not.toMatch(/<link|<script/)
    expect(html.startsWith('<!doctype html>')).toBe(true)
  })
})
