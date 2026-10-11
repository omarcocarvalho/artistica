import { expect, test, type Page } from '@playwright/test'
import { LANGUAGES, type LanguageCode } from '../src/shared/i18n/languages.ts'
import { FIXTURES } from './support/fixtures.ts'
import { setLanguage } from './support/l10n.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'
import { textIn } from './support/screens.ts'

// Text that must fit in every language whatever font the system falls back to: the hand-lettered
// notes of the landing page, the compact add buttons, the phone step tabs, the images panel, the
// preview toolbar, Japanese hints, Chinese quotes and the phone Edit sheet.

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

/** The line boxes `selector`'s text takes (visually hidden text excepted), per element, as `name: n`. */
async function lineCounts(page: Page, selector: string): Promise<string[]> {
  return page.evaluate<string[]>(`((sel) => {
    const out = []
    for (const el of document.querySelectorAll(sel)) {
      const tops = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement
        if (!n.data.trim() || !parent) continue
        const r = parent.getBoundingClientRect()
        if (r.width <= 1.5 || r.height <= 1.5) continue
        const range = document.createRange()
        range.selectNodeContents(n)
        for (const q of range.getClientRects()) if (q.width > 0) tops.push(q)
      }
      tops.sort((a, b) => a.top - b.top)
      let lines = tops.length > 0 ? 1 : 0
      for (let i = 1; i < tops.length; i++)
        if (tops[i].top - tops[i - 1].top > tops[i - 1].height / 2) lines++
      out.push('"' + (el.textContent || '').trim() + '": ' + lines)
    }
    return out
  })(${JSON.stringify(selector)})`)
}

const one = (counts: readonly string[]) => counts.filter((c) => !c.endsWith(': 1'))

/** The images panel's header (the count, then Remove all) and its photo rows. */
const PANEL_HEAD = 'aside[aria-labelledby="images-title"] ul:first-of-type'
const TOOLBAR = 'main#main > div:first-child'

for (const width of [1280, 960]) {
  test(`FIT-4 the images panel keeps its count, Remove all and each detail whole at ${String(width)} px`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    guard = guardNetwork(page)
    await page.setViewportSize({ width, height: 800 })
    await page.goto('app/')
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles([FIXTURES.quadrantsJpg, FIXTURES.portraitJpg])
    await expect(page.locator(`${PANEL_HEAD} > li`)).toHaveCount(2)
    // One row shows "Auto", the other a fixed size with its unit.
    await page.getByRole('button', { name: 'Edit quadrants.jpg', exact: true }).click()
    await page.getByRole('dialog').getByRole('radio', { name: 'Fixed' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const found: string[] = []
    for (const code of APP_LANGS) {
      await setLanguage(page, code)
      const head = await page.evaluate<string>(`(() => {
        const ul = document.querySelector(${JSON.stringify(PANEL_HEAD)})
        ul.previousElementSibling.dataset.fit = 'head'
        return ul.previousElementSibling.children.length
      })()`)
      expect(Number(head)).toBe(2)
      found.push(...(await misfits(page, '[data-fit="head"] > *')).map((f) => `${code}: ${f}`))
      // The count is a number and a word; Remove all fits on a line of its own in every language.
      const lines = await lineCounts(page, '[data-fit="head"] > *')
      found.push(
        ...one(code === 'pseudo' || width < 1200 ? lines.slice(0, 1) : lines).map(
          (f) => `${code}: ${f} lines`,
        ),
      )
      const rows = await page.evaluate<string[]>(`(() => {
        const out = []
        for (const li of document.querySelectorAll(${JSON.stringify(PANEL_HEAD)} + ' > li')) {
          const sep = [...li.querySelectorAll('span[aria-hidden="true"]')].find((s) => /^⟦?·/u.test(s.textContent.trim()))
          const item = sep && sep.nextElementSibling
          if (!sep || !item) { out.push('no separator and item'); continue }
          const a = sep.getBoundingClientRect()
          const b = item.getClientRects()[0]
          if (Math.abs(a.top - b.top) > a.height / 2) out.push('"' + item.textContent + '" on another line than its separator')
          li.dataset.fit = 'row'
          sep.parentElement.dataset.fit = 'detail'
        }
        return out
      })()`)
      found.push(...rows.map((f) => `${code}: ${f}`))
      const pixels = await lineCounts(page, '[data-fit="row"] span.font-mono')
      found.push(...one(pixels).map((f) => `${code}: ${f} lines`))
      found.push(
        ...(await misfits(page, '[data-fit="row"] span.font-mono, [data-fit="detail"]')).map(
          (f) => `${code}: ${f}`,
        ),
      )
      if (code === 'pseudo') await setLanguage(page, 'en')
    }
    expect(found).toEqual([])
  })

  test(`FIT-5 "No pages yet" stays whole in the preview toolbar at ${String(width)} px`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    guard = guardNetwork(page)
    await page.setViewportSize({ width, height: 800 })
    await page.goto('app/')
    await expect(page.locator(ADD_BUTTONS).first()).toBeVisible()
    const found: string[] = []
    for (const code of APP_LANGS) {
      await setLanguage(page, code)
      found.push(
        ...one(await lineCounts(page, `${TOOLBAR} > span:first-child`)).map(
          (f) => `${code}: ${f} lines`,
        ),
      )
      // The pseudo-locale's padded buttons outgrow the toolbar at 960 px; no language does.
      if (code === 'pseudo') {
        await setLanguage(page, 'en')
        continue
      }
      found.push(...(await misfits(page, `${TOOLBAR} > *`)).map((f) => `${code}: ${f}`))
      const scroll = await page.evaluate<number>(
        `(() => { const t = document.querySelector(${JSON.stringify(TOOLBAR)}); return t.scrollWidth - t.clientWidth })()`,
      )
      if (scroll > 1) found.push(`${code}: the toolbar overflows by ${String(scroll)} px`)
    }
    expect(found).toEqual([])
  })
}

test('FIT-6 Japanese hints and notices break between phrases and avoid a lone last character', async ({
  page,
}) => {
  guard = guardNetwork(page)
  await page.goto('app/')
  await setLanguage(page, 'ja')
  const styles = await page.evaluate<{
    wordBreak: string
    wrap: string
    phrase: boolean
    pretty: boolean
  }>(`(() => {
    const hint = document.querySelector('aside[aria-labelledby="images-title"] p')
    const s = getComputedStyle(hint)
    return {
      wordBreak: s.wordBreak,
      wrap: s.textWrapStyle || s.textWrap || '',
      phrase: CSS.supports('word-break', 'auto-phrase'),
      pretty: CSS.supports('text-wrap', 'pretty') || CSS.supports('text-wrap-style', 'pretty'),
    }
  })()`)
  if (styles.pretty) expect(styles.wrap).toContain('pretty')
  if (!styles.phrase) return
  expect(styles.wordBreak).toBe('auto-phrase')
  // 写真を追加して: the panel hint broke 追|加 before phrase breaking.
  for (const width of [1280, 960]) {
    await page.setViewportSize({ width, height: 800 })
    const broken = await page.evaluate<string[]>(`(() => {
      const out = []
      for (const p of document.querySelectorAll('aside p, main p')) {
        const n = p.firstChild
        if (!n || n.nodeType !== 3) continue
        for (const word of ['追加して', 'シートを', '作りましょう']) {
          const at = n.data.indexOf(word)
          if (at < 0) continue
          const range = document.createRange()
          range.setStart(n, at)
          range.setEnd(n, at + word.length)
          const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)))
          if (tops.size > 1) out.push(word + ' broken in "' + n.data + '"')
        }
      }
      return out
    })()`)
    expect(broken, String(width)).toEqual([])
  }
})

for (const width of [320, 390, 640, 768, 1024]) {
  test(`FIT-7 the landing hero's hand-lettered tip stays on one line inside its picture at ${String(width)} px`, async ({
    page,
  }) => {
    guard = guardNetwork(page)
    await page.setViewportSize({ width, height: 800 })
    const found: string[] = []
    for (const code of LANGUAGES) {
      await page.goto(code === 'en' ? './' : `${code}/`)
      await page.evaluate('document.fonts.ready.then(() => true)')
      const tip = 'main [aria-hidden="true"] > .font-hand'
      await expect(page.locator(tip)).toHaveCount(1)
      found.push(
        ...one(await lineCounts(page, tip)).map((f) => `${code}: ${f} lines`),
        ...(await misfits(page, tip)).map((f) => `${code}: ${f}`),
      )
      const inside = await page.evaluate<boolean>(`(() => {
        const t = document.querySelector(${JSON.stringify(tip)}).getBoundingClientRect()
        const p = document.querySelector(${JSON.stringify(tip)}).parentElement.getBoundingClientRect()
        return t.left >= p.left - 1 && t.right <= p.right + 1
      })()`)
      if (!inside) found.push(`${code}: the tip runs past its picture`)
    }
    expect(found).toEqual([])
  })
}

for (const width of [640, 700, 960]) {
  test(`FIT-10 the top bar's button text stays clear of the next control in every theme at ${String(width)} px`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    guard = guardNetwork(page)
    await page.setViewportSize({ width, height: 800 })
    await page.goto('app/')
    const found: string[] = []
    for (const code of LANGUAGES) {
      await setLanguage(page, code)
      for (const theme of ['auto', 'light', 'dark']) {
        const current = textIn(code, `app:theme.${theme}`)
        const button = page.getByRole('button', {
          name: textIn(code, 'app:theme.changeLabel', { current }),
          exact: true,
        })
        await expect(button).toHaveText(current)
        const wide = await page.evaluate<string[]>(`(() => {
          const out = []
          const shown = [...document.querySelector('header').children].filter(
            (el) => el.getBoundingClientRect().width > 1,
          )
          shown.forEach((el, i) => {
            if (el.tagName !== 'BUTTON') return
            const range = document.createRange()
            range.selectNodeContents(el)
            const text = range.getBoundingClientRect()
            const before = shown[i - 1]?.getBoundingClientRect()
            const after = shown[i + 1]?.getBoundingClientRect()
            if ((after && text.right > after.left) || (before && text.left < before.right))
              out.push('"' + el.textContent.trim() + '" runs into its neighbour')
          })
          return out
        })()`)
        found.push(...wide.map((f) => `${code}: ${f}`))
        await button.click()
      }
    }
    expect([...new Set(found)]).toEqual([])
  })
}

test('FIT-8 Chinese curly quotes come from a local Chinese font, never a download', async ({
  page,
}) => {
  guard = guardNetwork(page)
  await page.goto('app/')
  await setLanguage(page, 'zh-CN')
  const quotes = await page.evaluate<{
    faces: { range: string; status: string }[]
    first: string
    width: number
    size: number
  }>(`(async () => {
    const faces = []
    for (const face of document.fonts) {
      if (!/quotes/i.test(face.family)) continue
      try { await face.load() } catch {}
      faces.push({ range: face.unicodeRange, status: face.status })
    }
    const p = document.createElement('p')
    p.textContent = '“参考”'
    document.querySelector('main').append(p)
    const range = document.createRange()
    range.setStart(p.firstChild, 0)
    range.setEnd(p.firstChild, 1)
    const width = range.getBoundingClientRect().width
    const s = getComputedStyle(p)
    const first = s.fontFamily.split(',')[0].trim()
    const size = parseFloat(s.fontSize)
    p.remove()
    return { faces, first, width, size }
  })()`)
  expect(quotes.first).toMatch(/quotes/i)
  expect(quotes.faces.length).toBeGreaterThan(0)
  for (const face of quotes.faces) expect(face.range).toMatch(/U\+2018-2019, U\+201C-201D/i)
  // Where the system has one of the local Chinese fonts, the opening quote is drawn full width.
  if (quotes.faces.some((f) => f.status === 'loaded'))
    expect(quotes.width).toBeGreaterThan(quotes.size * 0.8)
})

for (const width of [320, 390, 412]) {
  test(`FIT-9 the phone Edit sheet fits ${String(width)} px in English, Japanese and the pseudo-locale`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    guard = guardNetwork(page)
    await page.setViewportSize({ width, height: 800 })
    await page.goto('app/')
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURES.quadrantsJpg)
    await page.getByRole('button', { name: 'Edit quadrants.jpg', exact: true }).click()
    await expect(page.getByTestId('crop-area')).toBeVisible()
    const found: string[] = []
    for (const code of ['en', 'ja', 'pseudo'] as const) {
      await setLanguage(page, code)
      // The crop stage takes the width it measures, a frame after a relayout.
      await page.evaluate(
        'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))',
      )
      const past = await page.evaluate<string[]>(`(() => {
        const body = document.querySelector('[role="dialog"] .ds-sheet__body')
        const out = []
        if (body.scrollWidth > body.clientWidth + 1)
          out.push('the sheet scrolls ' + (body.scrollWidth - body.clientWidth) + ' px sideways')
        const edge = body.getBoundingClientRect().right
        for (const el of body.querySelectorAll('canvas, button, p, label'))
          if (el.getBoundingClientRect().right > edge + 1)
            out.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30) + ' ends past the sheet')
        return out
      })()`)
      found.push(...past.map((f) => `${code}: ${f}`))
      if (code === 'pseudo') await setLanguage(page, 'en')
    }
    expect([...new Set(found)]).toEqual([])
  })
}
