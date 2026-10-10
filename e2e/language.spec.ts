import { expect, test, type Page } from '@playwright/test'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'

declare const localStorage: { getItem(key: string): string | null }

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
  await expect(page.getByRole('button', { name: 'Export PDF' }).first()).toBeAttached()
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
