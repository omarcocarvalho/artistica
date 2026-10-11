import { describe, expect, it } from 'vitest'
import { PSEUDO_LANGUAGE, pseudoLocalize, pseudoResources } from './pseudo'

const PLACEHOLDER = /\{\{[^}]*\}\}|\$t\([^)]*\)|<\/?[A-Za-z0-9]+\s*\/?>/g

/** The text a reader sees: brackets, variables, tags and nesting removed. */
function visible(text: string): string {
  return text.replace(PLACEHOLDER, '').replace(/[⟦⟧]/g, '')
}

const placeholders = (text: string) => text.match(PLACEHOLDER) ?? []

describe('pseudoLocalize', () => {
  it('uses the en-XA code', () => {
    expect(PSEUDO_LANGUAGE).toBe('en-XA')
  })

  it('wraps in ⟦…⟧', () => {
    for (const text of ['Upload', 'Add some reference photos', '{{count, number}} images']) {
      const out = pseudoLocalize(text)
      expect(out.startsWith('⟦'), out).toBe(true)
      expect(out.endsWith('⟧'), out).toBe(true)
      expect(out.slice(1, -1)).not.toMatch(/[⟦⟧]/)
    }
  })

  it('accents Latin letters', () => {
    const out = pseudoLocalize('The quick brown fox jumps over the lazy dog. PACK MY BOX!')
    expect(visible(out)).not.toMatch(/[A-Za-z]/)
    expect(visible(out)).toMatch(/^Ţĥé ʠúíçķ ƀŕóŵñ ƒóẋ ĵúɱƥš óʋéŕ ţĥé ĺážý ďóĝ\. ƤÁÇĶ ṀÝ ƁÓẊ!/)
  })

  it('leaves digits, punctuation and non-Latin text as they are', () => {
    expect(
      visible(pseudoLocalize('A4 · 210 × 297 — 日本語')).startsWith('Á4 · 210 × 297 — 日本語'),
    ).toBe(true)
  })

  it('pads ×2 / ×1.8 / ×1.4 by length', () => {
    const cases: [string, number][] = [
      ['a', 2],
      ['Upload', 12],
      ['0123456789', 20],
      ['01234567890', 20],
      ['01234567890123456789', 36],
      ['012345678901234567890', 30],
      ['Add some reference photos to start', 48],
    ]
    for (const [text, length] of cases) {
      expect(Array.from(visible(pseudoLocalize(text))).length, text).toBe(length)
    }
  })

  it('counts only the visible text when it pads', () => {
    expect(Array.from(visible(pseudoLocalize('{{name}}: <strong>Done</strong>'))).length).toBe(12)
  })

  it('pads with words that can wrap and never ends the padding on a space', () => {
    const out = pseudoLocalize('Add some reference photos to start, then arrange them on pages')
    expect(out.slice(0, -1)).not.toMatch(/\s$/)
    expect(visible(out).split(' ').length).toBeGreaterThan(12)
  })

  it('keeps {{variables}}, {{count, number}}, <0>…</0> and $t() intact', () => {
    const samples = [
      '{{count, number}} images',
      'Step {{current}} of {{total}}: {{name}}',
      'Add some <highlight>reference photos</highlight>',
      'Drop <0>files</0> or <1>paste</1>',
      'A line<br/>break and <name/>',
      'See $t(common:theme.auto) and {{- raw}}',
    ]
    for (const text of samples) {
      expect(placeholders(pseudoLocalize(text)), text).toEqual(placeholders(text))
    }
  })

  it('returns an empty string unchanged', () => {
    expect(pseudoLocalize('')).toBe('')
  })

  it('is deterministic', () => {
    expect(pseudoLocalize('Export PDF')).toBe(pseudoLocalize('Export PDF'))
  })
})

describe('pseudoResources', () => {
  const en = {
    images: {
      list: { count_one: '{{count, number}} image', count_other: '{{count, number}} images' },
      title: 'Images',
    },
    common: { joinSentences: '{{a}} {{b}}', limit: 3 },
  }

  it('keeps every key and plural suffix', () => {
    expect(pseudoResources(en)).toEqual({
      images: {
        list: {
          count_one: pseudoLocalize('{{count, number}} image'),
          count_other: pseudoLocalize('{{count, number}} images'),
        },
        title: pseudoLocalize('Images'),
      },
      common: { joinSentences: pseudoLocalize('{{a}} {{b}}'), limit: 3 },
    })
  })

  it('does not change the English it reads', () => {
    const copy = structuredClone(en)
    pseudoResources(en)
    expect(en).toEqual(copy)
  })
})
