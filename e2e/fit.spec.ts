import { expect, test, type Page } from '@playwright/test'
import { LANGUAGES, type LanguageCode } from '../src/shared/i18n/languages.ts'
import { setLanguage } from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'

// Text that must fit in every language whatever font the system falls back to: the hand-lettered
// notes of the landing page, the compact add buttons and the phone step tabs.

runOnly('chromium', 'firefox', 'webkit')

const APP_LANGS: readonly (LanguageCode | 'pseudo')[] = [...LANGUAGES, 'pseudo']
const ADD_BUTTONS = '[data-import-actions] > button'
const ADD_ROW = '[data-import-actions]'
const STEP_TABS = 'nav > ol > li > button'

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

/**
 * Each element of `selector` whose text runs past its own box (sideways, past its padding too) or
 * whose box runs past its parent (positioned boxes excepted), and each word (a run without spaces)
 * that is split over two lines.
 * The pseudo-locale's brackets are not part of a word: WebKit may break after ⟦.
 */
async function misfits(page: Page, selector: string): Promise<string[]> {
  return page.evaluate<string[]>(`((sel) => {
    const out = []
    const past = (a, b) =>
      a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1
    for (const el of document.querySelectorAll(sel)) {
      const label = (el.textContent || '').trim()
      const box = el.getBoundingClientRect()
      if (box.width === 0) continue
      const style = getComputedStyle(el)
      const inset = (side) =>
        parseFloat(style.getPropertyValue('padding-' + side)) +
        parseFloat(style.getPropertyValue('border-' + side + '-width'))
      const inner = {
        left: box.left + inset('left'),
        right: box.right - inset('right'),
        top: box.top,
        bottom: box.bottom,
      }
      const placed = /^(absolute|fixed)$/.test(style.position)
      if (!placed && el.parentElement && past(box, el.parentElement.getBoundingClientRect()))
        out.push('"' + label + '": box past its parent')
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(n)
        if (range.getClientRects().length && past(range.getBoundingClientRect(), inner))
          out.push('"' + label + '": text past its box')
        for (const word of n.data.matchAll(/[^\\s⟦⟧]+/gu)) {
          range.setStart(n, word.index)
          range.setEnd(n, word.index + word[0].length)
          const rects = Array.from(range.getClientRects())
            .filter((r) => r.width > 0)
            .sort((a, b) => a.top - b.top)
          let lines = rects.length > 0 ? 1 : 0
          for (let i = 1; i < rects.length; i++)
            if (rects[i].top - rects[i - 1].top > rects[i - 1].height / 2) lines++
          if (lines > 1) out.push('"' + label + '": "' + word[0] + '" broken over ' + lines + ' lines')
        }
      }
    }
    return out
  })(${JSON.stringify(selector)})`)
}

test('FIT-1 the hand-lettered notes of every landing page stay inside their boxes', async ({
  page,
}) => {
  guard = guardNetwork(page)
  const found: string[] = []
  for (const code of LANGUAGES) {
    await page.goto(code === 'en' ? './' : `${code}/`)
    await page.evaluate('document.fonts.ready.then(() => true)')
    found.push(...(await misfits(page, '.font-hand')).map((f) => `${code}: ${f}`))
  }
  expect(found).toEqual([])
})

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 960, height: 800 },
  { width: 320, height: 640 },
]) {
  test(`FIT-2 the add buttons keep every word whole at ${String(viewport.width)} px`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    guard = guardNetwork(page)
    await page.setViewportSize(viewport)
    await page.goto('app/')
    await expect(page.locator(ADD_BUTTONS).first()).toBeVisible()
    const found: string[] = []
    for (const code of APP_LANGS) {
      await setLanguage(page, code)
      found.push(...(await misfits(page, `${ADD_ROW}, ${ADD_BUTTONS}`)).map((f) => `${code}: ${f}`))
      if (code === 'pseudo') await setLanguage(page, 'en')
    }
    expect(found).toEqual([])
  })
}

test('FIT-3 the phone step tabs keep every word whole at 320 px', async ({ page }) => {
  test.setTimeout(120_000)
  guard = guardNetwork(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('app/')
  const tabs = page.locator(STEP_TABS)
  await expect(tabs).toHaveCount(5)
  const found: string[] = []
  for (const code of APP_LANGS) {
    await setLanguage(page, code)
    // The current step is semibold, so each tab is measured while it is the current one.
    for (let i = 0; i < 5; i++) {
      await tabs.nth(i).click()
      await expect(tabs.nth(i)).toHaveAttribute('aria-current', 'step')
      found.push(
        ...(await misfits(page, STEP_TABS)).map((f) => `${code} (step ${String(i + 1)}): ${f}`),
      )
    }
    await tabs.first().click()
    if (code === 'pseudo') await setLanguage(page, 'en')
  }
  expect([...new Set(found)]).toEqual([])
})
