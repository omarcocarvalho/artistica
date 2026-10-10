import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Unit } from '../model/units'
import {
  formatDegrees,
  formatLength,
  formatLengthNumber,
  formatLengthValue,
  formatMegabytes,
  formatMegabytesNumber,
  formatNumber,
  formatPercent,
  joinSentences,
  unitLabel,
} from './format'
import { initI18n } from './init'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('formatLength', () => {
  it.each<[number, Unit, string, string]>([
    [12.5, 'mm', 'en', '12.5 mm'],
    [38.1, 'in', 'en', '1.5 in'],
    [1200, 'mm', 'en', '1,200 mm'],
    [12.5, 'mm', 'pt-BR', '12,5 mm'],
    [38.1, 'in', 'pt-BR', '1,5 pol.'],
    [1200, 'mm', 'pt-BR', '1.200 mm'],
    [12.5, 'mm', 'ja', '12.5 mm'],
    [38.1, 'in', 'ja', '1.5 in'],
    [1200, 'mm', 'ja', '1,200 mm'],
    [12.5, 'mm', 'ko', '12.5mm'],
    [38.1, 'in', 'ko', '1.5in'],
    [1200, 'mm', 'ko', '1,200mm'],
    [12.5, 'mm', 'it', '12,5 mm'],
    [38.1, 'in', 'it', '1,5 in'],
    [1200, 'mm', 'it', '1200 mm'],
    [12.5, 'mm', 'es', '12,5 mm'],
    [38.1, 'in', 'es', '1,5 in'],
    [1200, 'mm', 'es', '1200 mm'],
    [12.5, 'mm', 'zh-CN', '12.5毫米'],
    [38.1, 'in', 'zh-CN', '1.5英寸'],
    [1200, 'mm', 'zh-CN', '1,200毫米'],
  ])('%s %s in %s → %s', (mm, unit, lng, expected) => {
    expect(formatLength(mm, unit, lng)).toBe(expected)
  })

  it('rounds like the display rounding: mm to 1 decimal, inches to 2', () => {
    expect(formatLength(5.04, 'mm', 'en')).toBe('5 mm')
    expect(formatLength(5.08, 'in', 'en')).toBe('0.2 in')
    expect(formatLength(6.35, 'in', 'pt-BR')).toBe('0,25 pol.')
    expect(formatLength(215.9, 'mm', 'en')).toBe('215.9 mm')
    expect(formatLength(25.4, 'in', 'en')).toBe('1 in')
  })
})

describe('formatLengthValue', () => {
  it.each(['en', 'pt-BR', 'it', 'es', 'ja', 'ko', 'zh-CN'])('never groups (%s)', (lng) => {
    expect(formatLengthValue(1200, 'mm', lng)).toBe('1200')
  })

  it.each<[number, Unit, string, string]>([
    [12.5, 'mm', 'en', '12.5'],
    [12.5, 'mm', 'pt-BR', '12,5'],
    [1234.5, 'mm', 'pt-BR', '1234,5'],
    [12.5, 'mm', 'it', '12,5'],
    [12.5, 'mm', 'es', '12,5'],
    [12.5, 'mm', 'zh-CN', '12.5'],
    [6.35, 'in', 'es', '0,25'],
  ])('%s %s in %s → %s, with no unit', (mm, unit, lng, expected) => {
    expect(formatLengthValue(mm, unit, lng)).toBe(expected)
  })
})

describe('formatLengthNumber', () => {
  it('groups and rounds but shows no unit', () => {
    expect(formatLengthNumber(1200, 'mm', 'pt-BR')).toBe('1.200')
    expect(formatLengthNumber(210.04, 'mm', 'en')).toBe('210')
    expect(formatLengthNumber(215.9, 'in', 'it')).toBe('8,5')
  })
})

describe('unitLabel', () => {
  it.each<[Unit, string, string]>([
    ['mm', 'en', 'mm'],
    ['in', 'en', 'in'],
    ['in', 'pt-BR', 'pol.'],
    ['mm', 'zh-CN', '毫米'],
    ['in', 'zh-CN', '英寸'],
    ['mm', 'ko', 'mm'],
  ])('%s in %s → %s', (unit, lng, expected) => {
    expect(unitLabel(unit, lng)).toBe(expected)
  })
})

describe('percent, megabytes and degrees', () => {
  it('formats a 0–100 percentage as a whole number', () => {
    expect(formatPercent(50, 'en')).toBe('50%')
    expect(formatPercent(50, 'es')).toBe('50 %')
    expect(formatPercent(12.6, 'pt-BR')).toBe('13%')
  })

  it('formats bytes as decimal megabytes with one decimal', () => {
    expect(formatMegabytes(4_200_000, 'it')).toBe('4,2 MB')
    expect(formatMegabytes(12_000_000, 'en')).toBe('12.0 MB')
    expect(formatMegabytes(4_249_999, 'ko')).toBe('4.2MB')
    expect(formatMegabytesNumber(12_000_000, 'pt-BR')).toBe('12,0')
    expect(formatMegabytesNumber(1_234_500_000, 'pt-BR')).toBe('1.234,5')
  })

  it.each([
    [15_200_000, '15.2'],
    [4_149_999, '4.1'],
    [4_150_000, '4.2'],
    [20_900_000, '20.9'],
    [0, '0.0'],
    [1_000_000, '1.0'],
    [49_999, '0.0'],
    [50_000, '0.1'],
  ])('rounds %s bytes to %s megabytes', (bytes, expected) => {
    expect(formatMegabytesNumber(bytes, 'en')).toBe(expected)
    expect(formatMegabytes(bytes, 'en')).toBe(`${expected} MB`)
  })

  it('formats degrees with the narrow symbol', () => {
    expect(formatDegrees(45, 'en')).toBe('45°')
    expect(formatDegrees(45, 'ja')).toBe('45°')
    expect(formatDegrees(45, 'pt-BR')).toBe('45 °')
  })
})

describe('formatNumber', () => {
  it('groups by default and can turn grouping off', () => {
    expect(formatNumber(1234567, {}, 'pt-BR')).toBe('1.234.567')
    expect(formatNumber(1234567, { grouping: false }, 'pt-BR')).toBe('1234567')
    expect(formatNumber(1.25, { maxFractionDigits: 1 }, 'es')).toBe('1,3')
    expect(formatNumber(2, { minFractionDigits: 1 }, 'en')).toBe('2.0')
  })

  it('falls back to English before i18next has a language', () => {
    expect(i18next.language).toBeUndefined()
    expect(formatLength(1200, 'mm')).toBe('1,200 mm')
  })

  it("follows i18next's current language when none is given", async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    await i18n.changeLanguage('pt-BR')
    expect(formatLength(12.5, 'mm')).toBe('12,5 mm')
    await i18n.changeLanguage('en')
    expect(formatLength(12.5, 'mm')).toBe('12.5 mm')
  })
})

describe('the formatter cache', () => {
  it('builds one Intl.NumberFormat per language and options', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat')
    formatPercent(10, 'de')
    formatPercent(20, 'de')
    formatPercent(30, 'de')
    expect(spy).toHaveBeenCalledTimes(1)
    formatPercent(30, 'fr')
    expect(spy).toHaveBeenCalledTimes(2)
    formatLength(1, 'mm', 'de')
    formatLength(2, 'mm', 'de')
    unitLabel('mm', 'de')
    expect(spy).toHaveBeenCalledTimes(3)
    formatLengthValue(1, 'mm', 'de')
    formatLengthValue(9, 'mm', 'de')
    expect(spy).toHaveBeenCalledTimes(4)
  })
})

describe('joinSentences', () => {
  it("joins two sentences with the language's common:joinSentences", async () => {
    const i18n = i18next.createInstance()
    await i18n.init({
      lng: 'en',
      resources: {
        en: { common: { joinSentences: '{{a}} {{b}}' } },
        ja: { common: { joinSentences: '{{a}}{{b}}' } },
      },
      interpolation: { escapeValue: false },
      initAsync: false,
    })
    expect(joinSentences(i18n.t, 'One.', 'Two.')).toBe('One. Two.')
    await i18n.changeLanguage('ja')
    expect(joinSentences(i18n.t, '一。', '二。')).toBe('一。二。')
  })
})
