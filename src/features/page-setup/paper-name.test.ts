import type { TFunction } from 'i18next'
import { afterAll, describe, expect, it } from 'vitest'
import { PAPER_IDS, type PaperId } from '../../shared/model/paper'
import { PT_BR, switchLanguage } from '../../test/languages'
import { paperName } from './paper-name'

afterAll(async () => {
  await switchLanguage('en')
})

describe('paperName (M6-R25)', () => {
  it.each(['A3', 'A4', 'A5', 'A6'] as const)(
    'shows the ISO size %s as it is, without a key',
    (id) => {
      const t = ((key: string) => `translated ${key}`) as unknown as TFunction
      expect(paperName(id, t)).toBe(id)
    },
  )

  it.each([
    ['Letter', 'pageSetup:paper.name.letter'],
    ['Legal', 'pageSetup:paper.name.legal'],
    ['Tabloid', 'pageSetup:paper.name.tabloid'],
    ['Custom', 'pageSetup:paper.name.custom'],
  ] as const)('reads %s from %s', (id, key) => {
    const t = ((k: string) => `<${k}>`) as unknown as TFunction
    expect(paperName(id, t)).toBe(`<${key}>`)
  })

  it('gives every paper a name in English, the same as its id', async () => {
    const i18n = await switchLanguage('en')
    expect(PAPER_IDS.map((id: PaperId) => paperName(id, i18n.t))).toEqual([...PAPER_IDS])
  })

  it('translates the named sizes and keeps the ISO ones in Portuguese (Brazil)', async () => {
    const i18n = await switchLanguage('pt-BR', PT_BR)
    expect(PAPER_IDS.map((id: PaperId) => paperName(id, i18n.t))).toEqual([
      'A4',
      'Carta',
      'A3',
      'A5',
      'A6',
      'Ofício',
      'Tabloide',
      'Personalizado',
    ])
  })
})
