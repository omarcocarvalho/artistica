import { expect, test, type Locator, type Page } from '@playwright/test'
import { findOverflow } from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'

interface BrowserRect {
  readonly top: number
  readonly right: number
  readonly width: number
}
interface BrowserRange {
  setStart(node: unknown, offset: number): void
  setEnd(node: unknown, offset: number): void
  selectNodeContents(node: unknown): void
  getBoundingClientRect(): BrowserRect
  getClientRects(): { item(index: number): BrowserRect | null }
}
interface BrowserText {
  readonly data: string
  readonly length: number
}
interface BrowserElement {
  lang: string
  className: string
  type: string
  textContent: string | null
  readonly style: Record<string, string>
  readonly dataset: Record<string, string | undefined>
  readonly firstChild: unknown
  readonly scrollWidth: number
  readonly clientWidth: number
  append(...nodes: unknown[]): void
  prepend(...nodes: unknown[]): void
  remove(): void
  getBoundingClientRect(): BrowserRect
}
declare const document: {
  readonly documentElement: BrowserElement
  readonly body: BrowserElement
  createElement(tag: string): BrowserElement
  createRange(): BrowserRange
}
declare const getComputedStyle: (el: unknown) => { fontFamily: string; fontSize: string }
declare const Text: abstract new () => BrowserText

runOnly('chromium', 'firefox', 'webkit')

const UI_LATIN = [
  'Atkinson Hyperlegible Next Variable',
  'Atkinson Hyperlegible Next',
  'Atkinson Hyperlegible',
]
const DISPLAY_LATIN = ['Fraunces Variable', 'Fraunces']
const FIRST_CJK_FONT = {
  ja: 'Hiragino Sans',
  ko: 'Apple SD Gothic Neo',
  'zh-CN': 'PingFang SC',
} as const
/** zh-CN takes its curly quotes from a local Chinese face before the Latin family. */
const LEAD = { ja: [], ko: [], 'zh-CN': ['Artistica Quotes'] } as const
const CJK_NAME = /Hiragino|PingFang|YaHei|Gothic|Meiryo|Mincho|Malgun|CJK|Noto Sans (JP|KR|SC)/
const NO_LINE_START = [
  '。',
  '、',
  'ッ',
  'ャ',
  'ュ',
  'ョ',
  'ァ',
  'ィ',
  'ゥ',
  'ェ',
  'ォ',
  'ー',
  'っ',
  'ゃ',
  'ゅ',
  'ょ',
]

/** Closing punctuation never starts a line; small kana and ー don't either under `line-break: strict`. */
const NO_LINE_START_ZH = [...NO_LINE_START, '，', '；', '：', '？', '！', '）', '」', '』', '”']

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

/** The app sets `lang` from the resolved language at boot, so the test sets it once the app is up. */
async function openApp(page: Page, lang: string): Promise<void> {
  guard = guardNetwork(page)
  await page.goto('app/')
  await expect(page.getByRole('heading', { level: 1, name: 'Artistica' })).toBeAttached()
  await page.evaluate((code) => {
    document.documentElement.lang = code
  }, lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
}

async function families(target: Locator): Promise<string[]> {
  const value = await target.evaluate((el: unknown) => getComputedStyle(el).fontFamily)
  return value.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''))
}

/** Adds a chip in a 120 px box whose own language is `lang`. */
async function narrowChip(
  page: Page,
  lang: string,
  text: string,
): Promise<{ box: Locator; chip: Locator }> {
  await page.evaluate(
    ({ code, label }) => {
      const box = document.createElement('div')
      box.dataset.testid = 'narrow-box'
      box.lang = code
      box.style.width = '120px'
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'ds-chip'
      chip.dataset.testid = 'narrow-chip'
      const tick = document.createElement('span')
      tick.className = 'ds-chip__box'
      chip.append(tick, label)
      box.append(chip)
      document.body.prepend(box)
    },
    { code: lang, label: text },
  )
  return { box: page.getByTestId('narrow-box'), chip: page.getByTestId('narrow-chip') }
}

/** The first character of each line, and the one before it, in a paragraph laid out at 6 to 14 em. */
async function lineStarts(page: Page, text: string): Promise<{ char: string; before: string }[]> {
  return page.evaluate((sample) => {
    const p = document.createElement('p')
    p.style.fontSize = '16px'
    p.textContent = sample
    document.body.prepend(p)
    const node = p.firstChild
    const out: { char: string; before: string }[] = []
    for (let em = 6; em <= 14; em++) {
      p.style.width = `${String(em)}em`
      let top = Number.NEGATIVE_INFINITY
      if (!(node instanceof Text)) break
      for (let i = 0; i < node.length; i++) {
        const r = document.createRange()
        r.setStart(node, i)
        r.setEnd(node, i + 1)
        const rect = r.getClientRects().item(0)
        if (rect && rect.width > 0 && rect.top > top + 1) {
          out.push({ char: node.data[i] ?? '', before: node.data[i - 1] ?? '' })
          top = rect.top
        }
      }
    }
    p.remove()
    return out
  }, text)
}

test.describe('each CJK language takes its own fonts', () => {
  for (const lang of ['ja', 'ko', 'zh-CN'] as const) {
    test(`CJK-${lang}: body, h1 and buttons list the Latin family, then ${FIRST_CJK_FONT[lang]}`, async ({
      page,
    }) => {
      await openApp(page, lang)
      const ui = [...LEAD[lang], ...UI_LATIN, FIRST_CJK_FONT[lang]]
      const body = await families(page.locator('body'))
      expect(body.slice(0, ui.length)).toEqual(ui)
      const button = await families(page.locator('.ds-btn').first())
      expect(button.slice(0, ui.length)).toEqual(ui)
      const display = [...LEAD[lang], ...DISPLAY_LATIN, FIRST_CJK_FONT[lang]]
      const heading = await families(page.getByRole('heading', { level: 1 }))
      expect(heading.slice(0, display.length)).toEqual(display)
      expect(heading.at(-1)).toBe('sans-serif')
    })
  }

  test('CJK-en: English lists no CJK font, and a ko subtree inside it takes the Korean fonts', async ({
    page,
  }) => {
    await openApp(page, 'en')
    expect((await families(page.locator('body'))).filter((f) => CJK_NAME.test(f))).toEqual([])
    expect(
      (await families(page.getByRole('heading', { level: 1 }))).filter((f) => CJK_NAME.test(f)),
    ).toEqual([])
    const { chip } = await narrowChip(page, 'ko', '사진')
    expect((await families(chip)).slice(0, UI_LATIN.length + 1)).toEqual([
      ...UI_LATIN,
      FIRST_CJK_FONT.ko,
    ])
  })
})

test.describe('line breaking', () => {
  const cases = [
    { lang: 'ko', text: '얼굴구조선과삼분할안내선을함께' },
    { lang: 'ja', text: '顔のアタリ線と三分割法のガイド線' },
    { lang: 'zh-CN', text: '面部结构线与三分法参考线一起' },
    { lang: 'en', text: 'Faceconstructionandruleofthirds' },
  ] as const
  for (const { lang, text } of cases) {
    test(`CJK-wrap-${lang}: a long chip label wraps inside a narrow box instead of overflowing`, async ({
      page,
    }) => {
      await openApp(page, 'en')
      const { box, chip } = await narrowChip(page, lang, text)
      const oneLine = await chip.evaluate(
        (el: unknown) => parseFloat(getComputedStyle(el).fontSize) * 1.6,
      )
      expect((await findOverflow(page)).filter((f) => f.includes(text))).toEqual([])
      expect((await box.boundingBox())?.width).toBe(120)
      expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThan(oneLine)
    })
  }

  test('CJK-strict: no Japanese line starts with a small kana, ー, 。 or 、', async ({ page }) => {
    await openApp(page, 'ja')
    const starts = await lineStarts(
      page,
      'チェックリストをチェックして、シャッターをキャッチ。ショップでコピーしよう。',
    )
    expect(starts.length).toBeGreaterThan(20)
    expect(starts.map(({ char }) => char).filter((c) => NO_LINE_START.includes(c))).toEqual([])
  })

  test('CJK-strict-zh: no Chinese line starts with closing punctuation, a small kana or ー', async ({
    page,
  }) => {
    await openApp(page, 'zh-CN')
    const starts = await lineStarts(
      page,
      '把照片排列在页面上，然后导出。可以吗？好！（完成）选择“チェックリスト”中的ショップ、コピー、キャッチャー和シャッター。',
    )
    expect(starts.length).toBeGreaterThan(20)
    expect(starts.map(({ char }) => char).filter((c) => NO_LINE_START_ZH.includes(c))).toEqual([])
  })

  test('CJK-keep-all: Korean lines start only at the start of a word', async ({ page }) => {
    await openApp(page, 'ko')
    const starts = await lineStarts(
      page,
      '사진을 페이지에 배치하고 재단선을 추가해요. 흐림과 명도 스터디도 만들 수 있어요.',
    )
    expect(starts.length).toBeGreaterThan(20)
    expect(starts.filter(({ before }) => before !== '' && before !== ' ')).toEqual([])
  })
})
