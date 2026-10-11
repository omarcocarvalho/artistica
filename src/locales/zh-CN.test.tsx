import { act, render } from '@testing-library/react'
import i18next from 'i18next'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { initI18n, setAppLanguage } from '../shared/i18n'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { DEFAULT_PAGE_SETUP } from '../shared/model/page-setup'
import { presetFromSettings } from '../shared/model/preset'
import { DEFAULT_STUDY } from '../shared/model/study'

/** Frequent words of the English UI; none may reach the screen in Chinese. */
const ENGLISH_WORDS = [
  'Add',
  'Apply',
  'Auto',
  'Blur',
  'Bleed',
  'Cancel',
  'Change',
  'Close',
  'Create',
  'Crop',
  'Dark',
  'Delete',
  'device',
  'Download',
  'Export',
  'Tiles',
  'Images',
  'Landscape',
  'Light',
  'Lines',
  'marks',
  'Page',
  'Paper',
  'Photos',
  'Portrait',
  'Presets',
  'Rename',
  'Save',
  'Studies',
  'Values',
] as const

function englishIn(root: HTMLElement): string[] {
  const texts: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    texts.push(node.nodeValue ?? '')
  for (const el of root.querySelectorAll('*')) {
    for (const attr of ['aria-label', 'aria-valuetext', 'title', 'placeholder', 'alt']) {
      const value = el.getAttribute(attr)
      if (value) texts.push(value)
    }
  }
  const all = texts.join('\n')
  return ENGLISH_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(all))
}

const A = 'a' as ImageId

beforeAll(async () => {
  await initI18n()
  expect(await setAppLanguage('zh-CN')).toBe('changed')
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
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Chinese (Simplified): a sample of screens shows no English', () => {
  it('the top bar', () => {
    const { container } = render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(container.textContent).toContain('照片留在本设备上')
    expect(englishIn(container)).toEqual([])
  })

  it('the page setup panel', () => {
    const { container } = render(<PageSetupPanel />)
    expect(container.textContent).toContain('裁切标记')
    expect(englishIn(container)).toEqual([])
  })

  it('the studies panel', () => {
    const { container } = render(<StudiesPanel imageId={A} />)
    expect(container.textContent).toContain('明暗')
    expect(englishIn(container)).toEqual([])
  })

  it('the presets dialog with presets', () => {
    const preset = presetFromSettings('海报', {
      pageSetup: { ...DEFAULT_PAGE_SETUP, paper: 'Letter', bleed: { enabled: true, mm: 3 } },
      study: { ...DEFAULT_STUDY, versions: ['original', 'values'] },
      lines: { ...DEFAULT_LINES, thirds: true, grid: { ...DEFAULT_LINES.grid, on: true } },
    })
    expect(useSettings.getState().savePreset(preset)).toBe('saved')
    render(<PresetsDialog open onOpenChange={vi.fn()} />)
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    if (!dialog) throw new Error('no dialog')
    expect(dialog.textContent).toContain('信纸')
    expect(englishIn(dialog)).toEqual([])
  })

  it('the export panel, ready', async () => {
    const pages = [pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('b') })])]
    const { container } = render(
      <ExportPanel pages={pages} paper="Letter" getSource={() => undefined} />,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).toContain('创建PDF')
    expect(englishIn(container)).toEqual([])
  })
})

describe('Chinese (Simplified) plural forms (only `other`)', () => {
  const COUNTS = [0, 1, 2, 5, 1_000_000] as const
  it.each<[string, Record<string, unknown>, readonly string[]]>([
    ['images:list.count', {}, ['0张图片', '1张图片', '2张图片', '5张图片', '1,000,000张图片']],
    [
      'studies:values.countText',
      {},
      ['0个层次', '1个层次', '2个层次', '5个层次', '1,000,000个层次'],
    ],
    [
      'presets:import.imported',
      {},
      [
        '已导入0个预设。',
        '已导入1个预设。',
        '已导入2个预设。',
        '已导入5个预设。',
        '已导入1,000,000个预设。',
      ],
    ],
    [
      'export:summary.tilesValue',
      { tiles: 7 },
      [
        '7个图块，来自0张图片',
        '7个图块，来自1张图片',
        '7个图块，来自2张图片',
        '7个图块，来自5张图片',
        '7个图块，来自1,000,000张图片',
      ],
    ],
    ['app:import.more', {}, ['另外0个', '另外1个', '另外2个', '另外5个', '另外1,000,000个']],
  ])('%s', (key, vars, expected) => {
    expect(COUNTS.map((count) => i18next.t(key, { ...vars, count }))).toEqual(expected)
  })
})
