import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { languageSelect, offeredLanguages, setLanguage } from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'
import { isLanguageCode, type LanguageCode } from '../src/shared/i18n/languages.ts'

declare const localStorage: { getItem(key: string): string | null }
declare const document: { activeElement: { tagName: string; closest(s: string): unknown } | null }

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

  test('LANG-D5: gets English while Portuguese has no strings', async ({ page }) => {
    await openApp(page)
    await expectEnglish(page)
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

  test('LANG-S3: keyboard only: Tab to the select, change it, focus stays', async ({ page }) => {
    await openApp(page)
    const code = await firstTranslation(page)
    const offered = await offeredLanguages(page)
    for (let i = 0; i < 20 && !(await focusIsOnSelect(page)); i++) await page.keyboard.press('Tab')
    expect(await focusIsOnSelect(page)).toBe(true)
    for (let i = 0; i < offered.indexOf(code); i++) await page.keyboard.press('ArrowDown')
    if ((await languageSelect(page).inputValue()) !== code) {
      test.info().annotations.push({
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
