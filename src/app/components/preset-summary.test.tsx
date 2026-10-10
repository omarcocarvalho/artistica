import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../shared/i18n'
import type { I18nT } from './preset-summary'
import { DEFAULT_LINES, type LineSettings } from '../../shared/model/lines'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../../shared/model/page-setup'
import { presetFromSettings } from '../../shared/model/preset'
import { DEFAULT_STUDY, type StudySettings } from '../../shared/model/study'
import { presetSummary } from './preset-summary'

let t: I18nT
beforeAll(async () => {
  const i18n = await initI18n()
  t = i18n.getFixedT('en', 'presets')
})

function summary(
  page: Partial<PageSetup>,
  study: Partial<StudySettings>,
  lines: Partial<LineSettings>,
  unit: 'mm' | 'in' = 'mm',
): string {
  const preset = presetFromSettings('P', {
    pageSetup: { ...DEFAULT_PAGE_SETUP, ...page },
    study: { ...DEFAULT_STUDY, ...study },
    lines: { ...DEFAULT_LINES, ...lines },
  })
  return presetSummary(preset, unit, t)
}

describe('presetSummary', () => {
  it('reads paper · orientation · studies · lines', () => {
    expect(summary({}, { versions: ['values'] }, { thirds: true })).toBe(
      'A4 · Auto · values 5 · thirds',
    )
  })

  it('adds the bleed when it is on, in the user’s unit, and joins versions with +', () => {
    expect(
      summary(
        { paper: 'Letter', orientation: 'landscape', bleed: { enabled: true, mm: 3 } },
        { versions: ['original', 'values'], values: { count: 4, hue: 265, neutral: false } },
        {},
      ),
    ).toBe('Letter · Landscape · bleed 3 mm · original + values 4')
  })

  it('names the blur, the blurred values and every composition line in canonical order', () => {
    expect(
      summary(
        { paper: 'A3', orientation: 'portrait' },
        { versions: ['blurred', 'blurValues'], blurPct: 60 },
        {
          centre: true,
          grid: { on: true, cols: 3, rows: 3 },
          armature: true,
          golden: true,
          spiral: { on: true, corner: 'topLeft' },
        },
      ),
    ).toBe(
      'A3 · Portrait · blurred 60% + blurred values 5 · grid + armature + golden ratio + spiral + centre lines',
    )
  })

  it('gives a custom paper its size in the user’s unit', () => {
    expect(summary({ paper: 'Custom', customSize: { w: 200, h: 300 } }, {}, {})).toBe(
      'Custom 200 × 300 mm · Auto · original',
    )
    expect(
      summary(
        { paper: 'Custom', customSize: { w: 254, h: 304.8 }, bleed: { enabled: true, mm: 3 } },
        {},
        {},
        'in',
      ),
    ).toBe('Custom 10 × 12 in · Auto · bleed 0.12 in · original')
  })
})
