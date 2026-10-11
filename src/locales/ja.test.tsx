import { render } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresetsDialog } from '../app/components/PresetsDialog'
import { TopBar } from '../app/components/TopBar'
import { stubDesktop } from '../app/test-utils'
import { useImages } from '../features/images'
import { makeLoadedImage } from '../features/images/test-utils'
import { PageSetupPanel } from '../features/page-setup/PageSetupPanel'
import { ExportPanel } from '../features/render/components/ExportPanel'
import { drawTile, id, pageModel } from '../features/render/test-support/fixtures'
import { useSettings } from '../features/settings'
import { StudiesPanel } from '../features/studies/components/StudiesPanel'
import { ENDONYMS, initI18n, setAppLanguage } from '../shared/i18n'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { DEFAULT_PAGE_SETUP } from '../shared/model/page-setup'
import { presetFromSettings } from '../shared/model/preset'
import { DEFAULT_STUDY } from '../shared/model/study'

const ENGLISH_WORDS = [
  'Add',
  'Apply',
  'Auto',
  'Bleed',
  'Blur',
  'Cancel',
  'Close',
  'Create',
  'Crop',
  'Dark',
  'Delete',
  'Export',
  'Gutter',
  'Hue',
  'Images',
  'Landscape',
  'Light',
  'Lines',
  'Orientation',
  'Page',
  'Paper',
  'Photos',
  'Portrait',
  'Presets',
  'Quality',
  'Remove',
  'Save',
  'Settings',
  'Studies',
  'Values',
]
const ENGLISH = new RegExp(`\\b(${ENGLISH_WORDS.join('|')})\\b`, 'iu')
const JAPANESE = /[぀-ヿ一-鿿]/u
// Latin words the Japanese UI keeps (style guide, "What is never translated"), the sample file
// name and the endonyms; any other Latin word is English left in the UI.
const LATIN_KEPT = new Set([
  ...['Artistica', 'PDF', 'DPI', 'mm', 'px', 'A3', 'A4', 'A5', 'A6', 'a', 'jpg'],
  ...['English', 'Português', 'Brasil', 'Italiano', 'Español'],
])
const latinLeft = (text: string): string[] =>
  [...text.matchAll(/\p{Script=Latin}[\p{Script=Latin}\d]*/gu)]
    .map((m) => m[0])
    .filter((w) => !LATIN_KEPT.has(w))
const ATTRIBUTES = ['aria-label', 'aria-valuetext', 'aria-description', 'title', 'placeholder']

/** Visible text plus the names and descriptions screen readers read. */
function textOf(root: Element): string {
  const parts: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    parts.push(node.nodeValue ?? '')
  for (const el of root.querySelectorAll('*'))
    for (const attr of ATTRIBUTES) parts.push(el.getAttribute(attr) ?? '')
  return parts.join('\n')
}

const PRESET_NAMES = ['肖像', '風景']

/** Japanese translated by the app: the endonyms and the user's preset names don't count. */
function hasJapanese(text: string): boolean {
  let rest = text
  for (const name of [...Object.values(ENDONYMS), ...PRESET_NAMES]) rest = rest.replaceAll(name, '')
  return JAPANESE.test(rest)
}

const A = 'a' as ImageId

beforeAll(async () => {
  await initI18n()
  expect(await setAppLanguage('ja')).toBe('changed')
})
afterAll(async () => {
  await i18next.changeLanguage('en')
})
beforeEach(() => {
  stubDesktop(true)
  localStorage.clear()
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm')
  useImages.setState({
    images: [makeLoadedImage({ id: A, name: 'a.jpg', study: DEFAULT_STUDY })],
    selectedId: A,
    importing: 0,
  })
})

const pages = [
  pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('b') })]),
  pageModel([drawTile({ imageId: id('c') })], { index: 1 }),
]

describe('Japanese (ja)', () => {
  it.each<[string, () => ReactElement]>([
    ['TopBar', () => <TopBar onExport={vi.fn()} exportDisabledReason={null} />],
    [
      'PageSetupPanel',
      () => <PageSetupPanel suggestedPerPage={4} resolvedOrientation="portrait" />,
    ],
    ['StudiesPanel', () => <StudiesPanel imageId={A} />],
    [
      'ExportPanel (ready)',
      () => <ExportPanel pages={pages} paper="Letter" getSource={() => undefined} />,
    ],
  ])('%s shows Japanese and no English UI word', (_name, make) => {
    const view = render(make())
    const text = textOf(view.container)
    expect(hasJapanese(text)).toBe(true)
    expect(ENGLISH.exec(text)?.[0]).toBeUndefined()
    expect(latinLeft(text)).toEqual([])
  })

  it('PresetsDialog with presets shows Japanese and no English UI word', () => {
    for (const name of PRESET_NAMES) {
      const preset = presetFromSettings(name, {
        pageSetup: { ...DEFAULT_PAGE_SETUP, paper: 'Letter', bleed: { enabled: true, mm: 3 } },
        study: { ...DEFAULT_STUDY, versions: ['original', 'blurred', 'values'] },
        lines: { ...DEFAULT_LINES, thirds: true, grid: { ...DEFAULT_LINES.grid, on: true } },
      })
      expect(useSettings.getState().savePreset(preset)).toBe('saved')
    }
    render(<PresetsDialog open onOpenChange={vi.fn()} />)
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    const text = textOf(dialog ?? document.body)
    expect(hasJapanese(text)).toBe(true)
    expect(text).toContain('肖像')
    expect(ENGLISH.exec(text)?.[0]).toBeUndefined()
    expect(latinLeft(text)).toEqual([])
  })

  // Japanese has one plural form (`_other`); the counter follows the number.
  const COUNTS = [0, 1, 2, 5, 1_000_000] as const
  it.each<[string, Record<string, unknown>, readonly string[]]>([
    ['images:list.count', {}, ['0枚', '1枚', '2枚', '5枚', '1,000,000枚']],
    ['studies:values.countText', {}, ['0階調', '1階調', '2階調', '5階調', '1,000,000階調']],
    [
      'presets:import.imported',
      {},
      [
        'プリセットを0件読み込みました。',
        'プリセットを1件読み込みました。',
        'プリセットを2件読み込みました。',
        'プリセットを5件読み込みました。',
        'プリセットを1,000,000件読み込みました。',
      ],
    ],
    [
      'export:summary.tilesValue',
      { tiles: 3 },
      [
        '3枠（画像0枚から）',
        '3枠（画像1枚から）',
        '3枠（画像2枚から）',
        '3枠（画像5枚から）',
        '3枠（画像1,000,000枚から）',
      ],
    ],
    ['app:import.more', {}, ['ほか0件', 'ほか1件', 'ほか2件', 'ほか5件', 'ほか1,000,000件']],
  ])('%s gives the right form for 0, 1, 2, 5 and 1,000,000', (key, vars, expected) => {
    expect(COUNTS.map((count) => i18next.t(key, { ...vars, count }))).toEqual(expected)
  })
})
