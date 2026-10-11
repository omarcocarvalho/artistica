import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresetsButton } from '../app/components/PresetsButton'
import { TopBar } from '../app/components/TopBar'
import { stubDesktop } from '../app/test-utils'
import { useImages } from '../features/images'
import { makeLoadedImage } from '../features/images/test-utils'
import { PageSetupPanel } from '../features/page-setup/PageSetupPanel'
import { exportPdf } from '../features/render/export/export-pdf'
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

vi.mock('../features/render/export/export-pdf', () => ({ exportPdf: vi.fn() }))
const mockedExport = vi.mocked(exportPdf)

/** Frequent words of the English UI; none may show in the Korean UI. */
const ENGLISH_WORDS = [
  'the',
  'and',
  'your',
  'this',
  'to',
  'of',
  'Add',
  'Apply',
  'Auto',
  'Blur',
  'Cancel',
  'Close',
  'Create',
  'Crop',
  'Delete',
  'Download',
  'Export',
  'Image',
  'Images',
  'Page',
  'Paper',
  'Photo',
  'Photos',
  'Presets',
  'Save',
  'Settings',
  'Size',
  'Studies',
  'Theme',
  'Values',
]
const ENGLISH = new RegExp(`\\b(${ENGLISH_WORDS.join('|')})\\b`, 'iu')
const HANGUL = /\p{Script=Hangul}/u
/** Latin words a Korean screen may show: product names, formats, units and key names. */
const LATIN_ALLOWED = new Set(['Artistica', 'PDF', 'DPI', 'A', 'mm', 'in', 'px', 'MB'])
/** File names and hex colours are the user's data, not UI text. */
const DATA = /[\p{L}\p{N}_-]+\.(?:jpe?g|png|webp|gif|heic|pdf|json)\b|#[0-9a-f]{6}\b/giu
const NAMED = [
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'aria-roledescription',
  'title',
  'placeholder',
  'alt',
]

/** An element marked as another language, such as an endonym in the language menu. */
function inOtherLanguage(el: Element | null): boolean {
  const owner = el?.closest('[lang]')
  if (!owner || !document.body.contains(owner)) return false
  return owner.getAttribute('lang') !== 'ko'
}

/** Every text node, accessible name, description and hint in the document, one per line. */
function shownText(): string {
  const parts = [document.title]
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (!inOtherLanguage(node.parentElement)) parts.push(node.textContent ?? '')
  for (const el of document.body.querySelectorAll('*'))
    if (!inOtherLanguage(el)) for (const attr of NAMED) parts.push(el.getAttribute(attr) ?? '')
  return parts.join('\n')
}

function expectKorean(): void {
  const text = shownText()
  expect(text).toMatch(HANGUL)
  expect(ENGLISH.exec(text)?.[0] ?? null).toBeNull()
  const latin = text.replace(DATA, ' ').match(/[A-Za-z]+/g) ?? []
  expect([...new Set(latin.filter((word) => !LATIN_ALLOWED.has(word)))]).toEqual([])
}

beforeAll(async () => {
  await initI18n()
  expect(await setAppLanguage('ko')).toBe('changed')
})
afterAll(async () => {
  await i18next.changeLanguage('en')
})
beforeEach(() => {
  stubDesktop(true)
  localStorage.clear()
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm')
  useImages.setState({ images: [], selectedId: null, importing: 0 })
  mockedExport.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Korean (ko) sample screens', () => {
  it('the top bar, with Export unavailable', () => {
    render(
      <TopBar onExport={vi.fn()} exportDisabledReason={i18next.t('app:topBar.exportNoImages')} />,
    )
    expect(screen.getByRole('button', { name: 'PDF 내보내기' })).toBeInTheDocument()
    expectKorean()
  })

  it('the page setup panel, with bleed and a custom size', () => {
    useSettings.getState().setPageSetup({ paper: 'Custom', bleed: { enabled: true, mm: 3 } })
    render(<PageSetupPanel />)
    expect(screen.getByRole('switch', { name: '도련' })).toBeChecked()
    expectKorean()
  })

  it('the studies panel for a photo', () => {
    const image = makeLoadedImage({
      id: 'a' as ImageId,
      name: '인물.jpg',
      study: { ...DEFAULT_STUDY, versions: ['original', 'blurred', 'values', 'blurValues'] },
    })
    useImages.setState({ images: [image], selectedId: image.id, importing: 0 })
    render(<StudiesPanel imageId={image.id} />)
    expectKorean()
  })

  it('the Presets dialog, with presets', async () => {
    for (const [name, paper] of [
      ['인물 크로키', 'Letter'],
      ['풍경', 'A4'],
    ] as const) {
      const preset = presetFromSettings(name, {
        pageSetup: { ...DEFAULT_PAGE_SETUP, paper, bleed: { enabled: true, mm: 3 } },
        study: { ...DEFAULT_STUDY, versions: ['original', 'blurValues'] },
        lines: { ...DEFAULT_LINES, thirds: true, spiral: { ...DEFAULT_LINES.spiral, on: true } },
      })
      expect(useSettings.getState().savePreset(preset)).toBe('saved')
    }
    render(<PresetsButton />)
    await userEvent.setup().click(screen.getByRole('button', { name: '프리셋' }))
    expect(await screen.findByRole('dialog', { name: '프리셋' })).toBeInTheDocument()
    expectKorean()
  })

  it('the export panel, ready to download', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    let resolve: (blob: Blob) => void = () => undefined
    mockedExport.mockImplementation(
      () =>
        new Promise<Blob>((res) => {
          resolve = res
        }),
    )
    const pages = [
      pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('b') })]),
      pageModel([drawTile({ imageId: id('c') })], { index: 1 }),
    ]
    render(<ExportPanel pages={pages} paper="Letter" getSource={() => undefined} />)
    expectKorean()
    await userEvent.setup().click(screen.getByRole('button', { name: 'PDF 만들기' }))
    await act(async () => {
      resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    expect(screen.getByRole('link', { name: 'PDF 다운로드' })).toBeInTheDocument()
    expectKorean()
  })
})

describe('Korean plural forms (ko has only "other")', () => {
  const COUNTS = [0, 1, 2, 5, 1_000_000] as const
  const t = (key: string, count: number, vars: Record<string, unknown> = {}) =>
    i18next.t(key, { lng: 'ko', count, ...vars })

  it.each<[string, Record<string, unknown>, readonly string[]]>([
    ['images:list.count', {}, ['0장', '1장', '2장', '5장', '1,000,000장']],
    [
      'images:dropzone.importing',
      {},
      [
        '사진 0장 추가 중…',
        '사진 1장 추가 중…',
        '사진 2장 추가 중…',
        '사진 5장 추가 중…',
        '사진 1,000,000장 추가 중…',
      ],
    ],
    [
      'export:summary.tilesValue',
      { tiles: 4 },
      [
        '4칸 (이미지 0장)',
        '4칸 (이미지 1장)',
        '4칸 (이미지 2장)',
        '4칸 (이미지 5장)',
        '4칸 (이미지 1,000,000장)',
      ],
    ],
    [
      'presets:import.imported',
      {},
      [
        '프리셋 0개를 가져왔어요.',
        '프리셋 1개를 가져왔어요.',
        '프리셋 2개를 가져왔어요.',
        '프리셋 5개를 가져왔어요.',
        '프리셋 1,000,000개를 가져왔어요.',
      ],
    ],
    ['studies:values.countText', {}, ['0단계', '1단계', '2단계', '5단계', '1,000,000단계']],
    [
      'lines:applyAll.done',
      {},
      [
        '선 설정을 이미지 0장에 복사했어요.',
        '선 설정을 이미지 1장에 복사했어요.',
        '선 설정을 이미지 2장에 복사했어요.',
        '선 설정을 이미지 5장에 복사했어요.',
        '선 설정을 이미지 1,000,000장에 복사했어요.',
      ],
    ],
    [
      'app:import.more',
      {},
      [
        '다른 이미지 0장',
        '다른 이미지 1장',
        '다른 이미지 2장',
        '다른 이미지 5장',
        '다른 이미지 1,000,000장',
      ],
    ],
  ])('%s', (key, vars, expected) => {
    expect(COUNTS.map((count) => t(key, count, vars))).toEqual(expected)
  })
})
