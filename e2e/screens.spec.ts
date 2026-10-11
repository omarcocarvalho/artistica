import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { setLanguage } from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import {
  desktopWalk,
  landingWalk,
  phoneWalk,
  SCREENS,
  textIn,
  type ScreenLanguage,
  type Visit,
} from './support/screens.ts'
import { runOnly } from './support/projects.ts'
import type { LanguageCode } from '../src/shared/i18n/languages.ts'

// Captures the screen set of M6-R26 as screens/<screen>/<code>-<desktop|phone>.png for the
// contact sheet (scripts/screens-index.ts). Runs only through `pnpm e2e:screens`.

test.skip(!process.env.E2E_SCREENS, 'run with E2E_SCREENS=1 (pnpm e2e:screens)')
runOnly('chromium', 'mobile-chromium')

const OUT = new URL('../screens/', import.meta.url)

/** E2E_LANG, else every language with strings. */
const LANGS: readonly ScreenLanguage[] = process.env.E2E_LANG
  ? process.env.E2E_LANG.split(',')
      .map((code) => code.trim())
      .filter(Boolean)
  : readdirSync(new URL('../src/locales/', import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

let guard: NetworkGuard | undefined

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(new URL('screens.json', OUT), `${JSON.stringify(SCREENS, null, 2)}\n`)
})

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

async function capture(page: Page, id: string, lang: ScreenLanguage, width: string) {
  const dir = new URL(`${id}/`, OUT)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({
    path: new URL(`${lang}-${width}.png`, dir).pathname,
    // The workspace fills the viewport; a full-page capture resizes it under open dialogs.
    fullPage: id === 'landing',
    animations: 'disabled',
  })
}

for (const lang of LANGS) {
  test(`screens in ${lang}`, async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    guard = guardNetwork(page)
    const width = testInfo.project.name === 'mobile-chromium' ? 'phone' : 'desktop'
    const switchTo = lang === 'pseudo' ? 'pseudo' : (lang as LanguageCode)
    const visit: Visit = async (id, again) => {
      await setLanguage(page, switchTo)
      if (again) await again((key, vars) => textIn(lang, key, vars))
      await capture(page, id, lang, width)
      await setLanguage(page, 'en')
    }
    if (lang !== 'pseudo')
      await landingWalk(page, lang, async (id) => {
        await capture(page, id, lang, width)
      })
    await (width === 'phone' ? phoneWalk : desktopWalk)(page, visit)
  })
}
