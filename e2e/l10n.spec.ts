import { expect, test, type Page } from '@playwright/test'
import {
  DEFAULT_ALLOW,
  findOverflow,
  findPseudoLeak,
  findUntranslated,
  labelInName,
  setLanguage,
  staleAnnouncements,
} from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import {
  desktopWalk,
  landingWalk,
  phoneWalk,
  textIn,
  type ScreenLanguage,
  type Visit,
} from './support/screens.ts'
import type { LanguageCode } from '../src/shared/i18n/languages.ts'

// The screen set of M6-R26 in each language of E2E_LANG (default: the pseudo-locale): no
// untranslated text (pseudo-locale) or no pseudo-locale leak (a language), no overflow, and each
// control's visible text inside its name. States are built in English, then switched.

const LANGS: readonly ScreenLanguage[] = (process.env.E2E_LANG ?? 'pseudo')
  .split(',')
  .map((code) => code.trim())
  .filter(Boolean)

/** chromium and mobile-chromium walk every screen; the other projects the first two. */
const FULL = ['chromium', 'mobile-chromium']
const SHORT_WALK = 2
const PHONE = ['mobile-chromium', 'mobile-webkit']

/** Names the walk types or loads: photo and preset names are the user's, never translated. */
const ALLOW = [...DEFAULT_ALLOW, /^(A4 values|Values 2)$/u]

// CI's Linux Firefox has no WebGL (C1-R1). Turned off here too, so a local run takes CI's path.
test.use({
  launchOptions: { firefoxUserPrefs: { 'webgl.disabled': true } },
  actionTimeout: 20_000,
})

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

async function probe(
  page: Page,
  lang: ScreenLanguage,
  id: string,
  stale: readonly RegExp[],
): Promise<string[]> {
  const text =
    lang === 'pseudo'
      ? await findUntranslated(page, [...ALLOW, ...stale])
      : await findPseudoLeak(page)
  return [
    ...text.map((f) => `${id}: ${lang === 'pseudo' ? 'untranslated' : 'pseudo leak'} ${f}`),
    ...(await findOverflow(page)).map((f) => `${id}: overflow ${f}`),
    ...(lang === 'pseudo' ? [] : await labelInName(page)).map(
      (f) => `${id}: label not in name ${f}`,
    ),
  ]
}

function visitIn(page: Page, lang: ScreenLanguage, found: string[]): Visit {
  return async (id, again) => {
    const stale = await staleAnnouncements(page)
    await setLanguage(page, lang === 'pseudo' ? 'pseudo' : (lang as LanguageCode))
    if (again) await again((key, vars) => textIn(lang, key, vars))
    found.push(...(await probe(page, lang, id, stale)))
    await setLanguage(page, 'en')
    // The padding and brackets of the pseudo-locale keep a visible word from matching inside a
    // longer name, so its label-in-name check runs on the same state in English.
    if (lang === 'pseudo')
      found.push(...(await labelInName(page)).map((f) => `${id}: label not in name ${f}`))
  }
}

for (const lang of LANGS) {
  test.describe(`L10N ${lang}: every screen fits and is translated`, () => {
    test(`the workspace (${lang})`, async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      guard = guardNetwork(page)
      const project = testInfo.project.name
      const limit = FULL.includes(project) ? undefined : SHORT_WALK
      const found: string[] = []
      const walk = PHONE.includes(project) ? phoneWalk : desktopWalk
      await walk(page, visitIn(page, lang, found), { limit })
      expect(found).toEqual([])
    })

    test(`the landing page (${lang})`, async ({ page }) => {
      guard = guardNetwork(page)
      const found: string[] = []
      await landingWalk(page, lang, async (id) => {
        const leak = lang === 'pseudo' ? [] : await findPseudoLeak(page)
        found.push(
          ...leak.map((f) => `${id}: pseudo leak ${f}`),
          ...(await findOverflow(page)).map((f) => `${id}: overflow ${f}`),
          ...(await labelInName(page)).map((f) => `${id}: label not in name ${f}`),
        )
      })
      expect(found).toEqual([])
    })
  })
}
