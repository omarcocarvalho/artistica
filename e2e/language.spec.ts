import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { languageSelect, offeredLanguages, setLanguage } from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'
import { textIn } from './support/screens.ts'
import { isLanguageCode, type LanguageCode } from '../src/shared/i18n/languages.ts'

declare const localStorage: { getItem(key: string): string | null }
declare const document: { activeElement: { tagName: string; closest(s: string): unknown } | null }

/** Spec §3 and M6 performance budgets, asserted on chromium. */
const FIRST_PAINT_LAG_BUDGET_MS = 200
const SWITCH_BUDGET_MS = 300
const RUNS = 5

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

async function openApp(page: Page, path = 'app/'): Promise<void> {
  guard = guardNetwork(page)
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'Artistica' })).toBeAttached()
}

async function expectEnglish(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page).toHaveTitle('Artistica app')
  await expect(page.getByRole('button', { name: /^Change theme/ })).toBeVisible()
}

async function savedLanguage(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('artistica:settings')
    const parsed = raw === null ? {} : (JSON.parse(raw) as { state?: { language?: unknown } })
    return parsed.state?.language ?? null
  })
}

test.describe('an English browser', () => {
  test.use({ locale: 'en-US' })

  test('LANG-D1: gets English and lang="en"', async ({ page }) => {
    await openApp(page)
    await expectEnglish(page)
  })

  test('LANG-D2: ?lang=xx is ignored and removed from the URL', async ({ page }) => {
    await openApp(page, 'app/?lang=xx')
    await expectEnglish(page)
    expect(new URL(page.url()).search).toBe('')
  })

  test('LANG-D3: ?lang=en is removed and not saved', async ({ page }) => {
    await openApp(page, 'app/?lang=en&keep=1#top')
    await expectEnglish(page)
    const url = new URL(page.url())
    expect(url.search).toBe('?keep=1')
    expect(url.hash).toBe('#top')
    expect(await savedLanguage(page)).toBeNull()
  })
})

test.describe('a Traditional Chinese browser', () => {
  test.use({ locale: 'zh-TW' })

  test('LANG-D4: falls through to English', async ({ page }) => {
    await openApp(page)
    await expectEnglish(page)
  })
})

test.describe('a Portuguese (Brazil) browser', () => {
  test.use({ locale: 'pt-BR' })

  test('LANG-D5: gets Portuguese (Brazil) and lang="pt-BR", and nothing is saved', async ({
    page,
  }) => {
    await openApp(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page).toHaveTitle('Artistica app')
    await expect(page.getByRole('button', { name: /^Mudar tema/ })).toBeVisible()
    await expect(languageSelect(page)).toHaveValue('pt-BR')
    expect(await savedLanguage(page)).toBeNull()
  })
})

function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.describe('number formatting (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('F-D1 a 1200 mm custom paper: the fields never group, the readout does, and 12,5 reads as 12.5 mm', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await page.getByRole('radio', { name: 'mm', exact: true }).click()
    await app.setPaper('Custom…')
    await app.setField('Height', '1200')
    await app.setField('Width', '1200')
    const width = page.getByLabel('Width', { exact: true })
    const height = page.getByLabel('Height', { exact: true })
    await expect(width).toHaveValue('1200')
    await expect(height).toHaveValue('1200')
    await expect(width).toHaveAttribute('aria-valuetext', '1,200 mm')
    await expect(width).toHaveAttribute('aria-valuenow', '1200')
    await expect(page.getByText('1,200 × 1,200 mm', { exact: true })).toBeVisible()

    await app.setField('Safe area', '12,5')
    const safeArea = page.getByLabel('Safe area', { exact: true })
    await expect(safeArea).toHaveValue('12.5')
    await expect(safeArea).toHaveAttribute('aria-valuetext', '12.5 mm')
    await expect(safeArea).toHaveAttribute('aria-valuenow', '12.5')
  })
})

/** The first language besides English the switcher offers; skips the test while only English exists. */
async function firstTranslation(page: Page): Promise<LanguageCode> {
  const offered = await offeredLanguages(page)
  const code = offered.find((c) => c !== 'en')
  test.skip(
    code === undefined,
    'only English has strings: the switcher offers no other language until a translation merges',
  )
  if (!isLanguageCode(code)) throw new Error(`not a language code: ${String(code)}`)
  return code
}

async function focusIsOnSelect(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement
    return el?.tagName === 'SELECT' && el.closest('header') !== null
  })
}

test.describe('the language switcher', () => {
  test.use({ locale: 'en-US' })

  test('LANG-S1: the switcher saves the choice and a reload keeps it', async ({ page }) => {
    await openApp(page)
    const code = await firstTranslation(page)
    await setLanguage(page, code)
    expect(await savedLanguage(page)).toBe(code)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', code)
    await expect(languageSelect(page)).toHaveValue(code)
  })

  test('LANG-S2: a saved choice beats ?lang', async ({ page }) => {
    await openApp(page)
    const code = await firstTranslation(page)
    await setLanguage(page, code)
    await page.goto('app/?lang=en')
    await expect(page.locator('html')).toHaveAttribute('lang', code)
    expect(new URL(page.url()).search).toBe('')
    expect(await savedLanguage(page)).toBe(code)
  })

  test('LANG-S3: keyboard only: Tab to the select, change it, focus stays', async ({
    page,
  }, testInfo) => {
    await openApp(page)
    const code = await firstTranslation(page)
    const offered = await offeredLanguages(page)
    for (let i = 0; i < 20 && !(await focusIsOnSelect(page)); i++) await page.keyboard.press('Tab')
    expect(await focusIsOnSelect(page)).toBe(true)
    for (let i = 0; i < offered.indexOf(code); i++) await page.keyboard.press('ArrowDown')
    if ((await languageSelect(page).inputValue()) !== code) {
      // Ruling A5-4: on Linux, chromium and firefox change a native select with the arrow keys.
      expect(
        process.platform === 'linux' && ['chromium', 'firefox'].includes(testInfo.project.name),
        'arrow keys must change the select on Linux chromium and firefox',
      ).toBe(false)
      testInfo.annotations.push({
        type: 'native picker',
        description: 'arrow keys open the platform picker here, which Playwright cannot drive',
      })
      await languageSelect(page).selectOption(code)
    }
    await expect(page.locator('html')).toHaveAttribute('lang', code)
    await expect(languageSelect(page)).toHaveValue(code)
    expect(await focusIsOnSelect(page)).toBe(true)
  })
})

test.describe('the language switcher in the top bar', () => {
  runOnly('chromium', 'firefox', 'webkit')
  for (const scheme of ['light', 'dark'] as const) {
    test(`LANG-S4: the top bar is axe-clean at desktop and phone width (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: 1280, height: 900 })
      await openApp(page)
      const select = languageSelect(page)
      const name = page.locator('header [data-language-name]')
      await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
      await expect(name).toBeVisible()
      await expect(name).toHaveText('English')
      await expectNoAxeViolations(page, { include: 'header' })

      await page.setViewportSize({ width: 390, height: 844 })
      await expect(name).toBeHidden()
      const box = await select.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
      await expectNoAxeViolations(page, { include: 'header' })
    })
  }
})

/** The browser locale each context sets, and the language the app must open in. */
const BROWSER_LOCALES: readonly (readonly [string, LanguageCode])[] = [
  ['en-GB', 'en'],
  ['pt-BR', 'pt-BR'],
  ['ja-JP', 'ja'],
  ['ko-KR', 'ko'],
  ['it-IT', 'it'],
  ['es-MX', 'es'],
  ['zh-CN', 'zh-CN'],
  ['zh-TW', 'en'],
]

function themeLabel(code: LanguageCode): string {
  return textIn(code, 'app:theme.changeLabel', { current: textIn(code, 'app:theme.auto') })
}

for (const [locale, code] of BROWSER_LOCALES) {
  test.describe(`a ${locale} browser`, () => {
    test.use({ locale })

    test(`LANG-D6 ${locale}: a browser in each language opens the app in it (${code})`, async ({
      page,
    }) => {
      await openApp(page)
      await expect(page.locator('html')).toHaveAttribute('lang', code)
      await expect(page).toHaveTitle(textIn(code, 'app:documentTitle'))
      await expect(page.getByRole('button', { name: themeLabel(code), exact: true })).toBeVisible()
      await expect(languageSelect(page)).toHaveValue(code)
      expect(await savedLanguage(page)).toBeNull()
    })
  })
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] ?? NaN) : ((s[mid - 1] ?? NaN) + (s[mid] ?? NaN)) / 2
}

function record(testInfo: TestInfo, figures: Record<string, unknown>): void {
  for (const [type, value] of Object.entries(figures))
    testInfo.annotations.push({ type, description: JSON.stringify(value) })
  console.log(`${testInfo.title}: ${JSON.stringify(figures)}`)
}

/** A fresh context (empty cache and storage) with the browser language `locale`. */
async function freshPage(browser: Browser, testInfo: TestInfo, locale: string) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 },
    locale,
  })
  const page = await context.newPage()
  const network = guardNetwork(page)
  return { context, page, network }
}

declare const performance: {
  now(): number
  getEntriesByName(name: string): { startTime: number }[]
}

test.describe('language timings (chromium asserts)', () => {
  runOnly('chromium')

  test('LANG-P1: first paint in ja is within 200 ms of English (median of 5)', async ({
    browser,
  }, testInfo) => {
    const paints: Record<'en' | 'ja', number[]> = { en: [], ja: [] }
    for (let i = 0; i < RUNS; i++) {
      for (const [lang, locale] of [
        ['en', 'en-US'],
        ['ja', 'ja-JP'],
      ] as const) {
        const { context, page, network } = await freshPage(browser, testInfo, locale)
        await page.goto('app/')
        await expect(page.locator('html')).toHaveAttribute('lang', lang)
        await expect(page.getByRole('button', { name: themeLabel(lang) })).toBeVisible()
        const fcp = await page.evaluate(
          () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN,
        )
        expect(network.violations()).toEqual([])
        await context.close()
        paints[lang].push(Math.round(fcp))
      }
    }
    const lagMs = Math.round(median(paints.ja) - median(paints.en))
    record(testInfo, { firstPaintMs: paints, lagMs })
    expect([...paints.en, ...paints.ja].every(Number.isFinite)).toBe(true)
    expect(lagMs).toBeLessThanOrEqual(FIRST_PAINT_LAG_BUDGET_MS)
  })

  test('LANG-S5: switching to ja shows the translated top bar within 300 ms (median of 5)', async ({
    browser,
  }, testInfo) => {
    const switches: number[] = []
    for (let i = 0; i < RUNS; i++) {
      const { context, page, network } = await freshPage(browser, testInfo, 'en-US')
      await page.goto('app/')
      await expect(page.getByRole('button', { name: themeLabel('en') })).toBeVisible()
      const ms = await page.evaluate(`(async (label) => {
        const select = document.querySelector('header select')
        const shown = () =>
          [...document.querySelectorAll('header button')].some((b) => b.getAttribute('aria-label') === label)
        const t0 = performance.now()
        select.value = 'ja'
        select.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((done) => {
          const tick = () => (shown() ? done() : requestAnimationFrame(tick))
          tick()
        })
        return performance.now() - t0
      })(${JSON.stringify(themeLabel('ja'))})`)
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
      expect(network.violations()).toEqual([])
      await context.close()
      switches.push(Math.round(Number(ms)))
    }
    const medianMs = Math.round(median(switches))
    record(testInfo, { switchMs: switches, medianMs })
    expect(medianMs).toBeLessThan(SWITCH_BUDGET_MS)
  })
})
