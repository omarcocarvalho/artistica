import { afterAll, describe, expect, it } from 'vitest'
import { PT_BR, switchLanguage } from '../../test/languages'

const files = import.meta.glob<string>('../../locales/en/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
})

describe('counts are shown through the number format (M6-R9)', () => {
  it('every {{count}} in English is {{count, number}}', () => {
    const texts = Object.values(files)
    expect(texts.length).toBeGreaterThan(0)
    const counts = texts.flatMap((text) => text.match(/\{\{\s*count[^}]*\}\}/g) ?? [])
    expect(counts.length).toBeGreaterThan(20)
    expect(new Set(counts)).toEqual(new Set(['{{count, number}}']))
  })

  afterAll(async () => {
    await switchLanguage('en')
  })

  it("groups a count with the language's separators", async () => {
    const en = await switchLanguage('en')
    expect(en.t('images:list.count', { count: 1234 })).toBe('1,234 images')
    const pt = await switchLanguage('pt-BR', PT_BR)
    expect(pt.t('images:list.count', { count: 1234 })).toBe('1.234 imagens')
    expect(pt.t('images:list.count', { count: 1_000_000 })).toBe('1.000.000 de imagens')
  })
})
