import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { axeFindings } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import {
  DEFAULT_ALLOW,
  FILE_NAME,
  findEnglish,
  findOverflow,
  findPseudoLeak,
  findUntranslated,
  labelInName,
  pageLanguage,
  REFLOW_VIEWPORT,
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
import { LANGUAGES, type LanguageCode } from '../src/shared/i18n/languages.ts'

// The screen set of M6-R26 in the pseudo-locale and the seven languages (or E2E_LANG). The
// pseudo-locale finds untranslated text; each language is checked for its `lang` and title, a
// pseudo-locale leak, English left on screen and axe (light and dark at desktop, light on the
// phone). Every walk checks overflow and that each control's visible text is inside its name.
// States are built in English, then switched.

const LANGS: readonly ScreenLanguage[] = process.env.E2E_LANG
  ? process.env.E2E_LANG.split(',')
      .map((code) => code.trim())
      .filter(Boolean)
  : ['pseudo', ...LANGUAGES]

/** chromium and mobile-chromium walk every language; the other projects these. */
const FULL = ['chromium', 'mobile-chromium']
const OTHER_LANGS: readonly ScreenLanguage[] = ['pseudo', 'ja', 'pt-BR']
const PHONE = ['mobile-chromium', 'mobile-webkit']

/** Names the walk types or loads: photo and preset names are the user's, never translated. */
const USER_NAMES = /^(A4 values|Values 2)$/u
const ALLOW = [...DEFAULT_ALLOW, USER_NAMES]
const STRIP = [FILE_NAME, /A4 values|Values 2/iu]

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

function landingTitle(lang: LanguageCode): string {
  const strings = JSON.parse(
    readFileSync(new URL(`../landing/locales/${lang}.json`, import.meta.url), 'utf8'),
  ) as { meta: { title: string } }
  return strings.meta.title
}

interface Where {
  readonly lang: ScreenLanguage
  readonly id: string
  /** The title the page must have in `lang`. */
  readonly title: string | null
  /** Axe in light and dark (desktop), light only (phone), or not at all (the 320 px pass). */
  readonly axe: readonly ('light' | 'dark')[]
  readonly phone: boolean
}

async function axeIn(page: Page, schemes: Where['axe']): Promise<string[]> {
  const found: string[] = []
  for (const scheme of schemes) {
    await page.emulateMedia({ colorScheme: scheme })
    found.push(...(await axeFindings(page)).map((f) => `axe (${scheme}) ${f}`))
  }
  await page.emulateMedia({ colorScheme: 'light' })
  return found
}

async function probe(page: Page, where: Where, stale: readonly RegExp[]): Promise<string[]> {
  const { lang, id } = where
  const tag = (kind: string) => (f: string) => `${id}: ${kind} ${f}`
  const found = (await findOverflow(page)).map(tag('overflow'))
  const shown = await pageLanguage(page)
  if (where.phone && shown.sideScroll > 0)
    found.push(`${id}: the page scrolls ${String(shown.sideScroll)} px sideways`)
  if (lang === 'pseudo') {
    found.push(...(await findUntranslated(page, [...ALLOW, ...stale])).map(tag('untranslated')))
    return found
  }
  if (shown.lang !== lang) found.push(`${id}: lang "${shown.lang}", not "${lang}"`)
  if (where.title !== null && shown.title !== where.title)
    found.push(`${id}: title "${shown.title}", not "${where.title}"`)
  found.push(...(await findPseudoLeak(page)).map(tag('pseudo leak')))
  // Messages already announced keep their language until they go (M6-R16).
  if (lang !== 'en')
    found.push(...(await findEnglish(page, undefined, [...stale, ...STRIP])).map(tag('English')))
  found.push(...(await labelInName(page)).map(tag('label not in name')))
  found.push(...(await axeIn(page, where.axe)).map((f) => `${id}: ${f}`))
  return found
}

function visitIn(
  page: Page,
  lang: ScreenLanguage,
  axe: Where['axe'],
  phone: boolean,
  found: string[],
): Visit {
  const title = lang === 'pseudo' ? null : textIn(lang, 'app:documentTitle')
  return async (id, again) => {
    const stale = await staleAnnouncements(page)
    await setLanguage(page, lang === 'pseudo' ? 'pseudo' : (lang as LanguageCode))
    if (again) await again((key, vars) => textIn(lang, key, vars))
    found.push(...(await probe(page, { lang, id, title, axe, phone }, stale)))
    await setLanguage(page, 'en')
    // The padding and brackets of the pseudo-locale keep a visible word from matching inside a
    // longer name, so its label-in-name check runs on the same state in English.
    if (lang === 'pseudo')
      found.push(...(await labelInName(page)).map((f) => `${id}: label not in name ${f}`))
  }
}

function runsIn(project: string, lang: ScreenLanguage): boolean {
  return FULL.includes(project) || OTHER_LANGS.includes(lang)
}

LANGS.forEach((lang) => {
  const n = LANGUAGES.indexOf(lang as LanguageCode)
  const name = n < 0 ? `L10N ${lang}` : `L10N-${String(n + 1)} ${lang}`

  test.describe(`${name}: every screen fits and is translated`, () => {
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(
        !runsIn(testInfo.project.name, lang),
        `${testInfo.project.name} walks ${OTHER_LANGS.join(', ')}`,
      )
    })

    test(`the workspace (${lang})`, async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      guard = guardNetwork(page)
      const phone = PHONE.includes(testInfo.project.name)
      const found: string[] = []
      const axe = phone ? (['light'] as const) : (['light', 'dark'] as const)
      await (phone ? phoneWalk : desktopWalk)(page, visitIn(page, lang, axe, phone, found))
      expect(found).toEqual([])
    })

    test(`the landing page (${lang})`, async ({ page }, testInfo) => {
      guard = guardNetwork(page)
      const phone = PHONE.includes(testInfo.project.name)
      const found: string[] = []
      await landingWalk(page, lang, async (id) => {
        if (lang === 'pseudo') {
          found.push(
            ...(await findOverflow(page)).map((f) => `${id}: overflow ${f}`),
            ...(await labelInName(page)).map((f) => `${id}: label not in name ${f}`),
          )
          return
        }
        const code = lang as LanguageCode
        const axe = phone ? (['light'] as const) : (['light', 'dark'] as const)
        found.push(...(await probe(page, { lang, id, title: landingTitle(code), axe, phone }, [])))
      })
      expect(found).toEqual([])
    })

    test.describe('at 320 px', () => {
      test.use({ viewport: REFLOW_VIEWPORT })

      test(`the phone walk reflows (${lang})`, async ({ page }, testInfo) => {
        test.skip(!PHONE.includes(testInfo.project.name), 'the phone layout')
        test.skip(
          lang === 'pseudo',
          "the pseudo-locale's padding outgrows every language in the 320 px top bar (D1-Q1)",
        )
        test.setTimeout(300_000)
        guard = guardNetwork(page)
        const found: string[] = []
        await phoneWalk(page, visitIn(page, lang, [], true, found))
        expect(found).toEqual([])
      })
    })
  })
})

/** The top bar's Export, then Create PDF and Download PDF, found by their names in `lang`. */
async function exportIn(page: Page, lang: LanguageCode): Promise<{ bytes: Buffer; name: string }> {
  await page.getByRole('button', { name: textIn(lang, 'app:topBar.export'), exact: true }).click()
  const dialog = page.getByRole('dialog')
  const create = dialog.getByRole('button', { name: textIn(lang, 'export:create'), exact: true })
  const link = dialog.getByRole('link', { name: textIn(lang, 'export:done.download'), exact: true })
  await expect(create.or(link)).toBeVisible()
  if (await create.isVisible()) await create.click()
  const download = page.waitForEvent('download', { timeout: 120_000 })
  await link.click()
  const file = await download
  const chunks: Buffer[] = []
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  return { bytes: Buffer.concat(chunks), name: file.suggestedFilename() }
}

test.describe('L10N-D1: the UI language never changes the output (M6-R24)', () => {
  test('L10N-D1 the PDF is byte-identical in en and ja', async ({ page }, testInfo) => {
    test.skip(PHONE.includes(testInfo.project.name), 'the desktop export dialog')
    test.setTimeout(180_000)
    guard = guardNetwork(page)
    const app = new AppPage(page)
    await app.goto()
    await app.upload([FIXTURES.quadrantsJpg, FIXTURES.portraitJpg])
    await app.expectImages(2)
    await app.setPaper('Letter')
    await app.setSwitch('Bleed', true)
    await app.openStudiesTab()
    await app.setVersions(['Original', 'Values'])
    await app.openLinesTab()
    await app.setLineSwitch('Rule of thirds', true)
    await app.expectPreviewSettled()

    const en = await exportIn(page, 'en')
    await setLanguage(page, 'ja')
    await app.expectPreviewSettled()
    const ja = await exportIn(page, 'ja')
    expect(ja.name).toBe(en.name)
    expect(ja.bytes.length).toBeGreaterThan(1000)
    expect(ja.bytes.equals(en.bytes), 'the same bytes in en and ja').toBe(true)
  })
})
