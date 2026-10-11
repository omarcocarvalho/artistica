import { expect, type Locator, type Page } from '@playwright/test'
import type { LanguageCode } from '../../src/shared/i18n/languages.ts'

/** The top bar's language select, found by place rather than by its translated name. */
export function languageSelect(page: Page): Locator {
  return page.locator('header select')
}

/** The languages the switcher offers, in its order. */
export async function offeredLanguages(page: Page): Promise<string[]> {
  const options = await languageSelect(page).locator('option').all()
  return Promise.all(options.map(async (o) => (await o.getAttribute('value')) ?? ''))
}

/** Chooses `code` in the top bar's switcher and waits until the page is in it. */
export async function setLanguage(page: Page, code: LanguageCode): Promise<void> {
  await languageSelect(page).selectOption(code)
  await expect(page.locator('html')).toHaveAttribute('lang', code)
  await expect(languageSelect(page)).not.toHaveAttribute('aria-busy', 'true')
}
