import { readdirSync, readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'
import { ENDONYMS, LANGUAGES, type LanguageCode } from '../../src/shared/i18n/languages.ts'
import { PSEUDO_LANGUAGE } from '../../src/shared/i18n/pseudo.ts'

export { pseudoLocalize } from '../../src/shared/i18n/pseudo.ts'

/** The window event `src/app/language.ts` listens for. */
const PSEUDO_EVENT = 'artistica:pseudo-locale'

/** The top bar's language select, found by place rather than by its translated name. */
export function languageSelect(page: Page): Locator {
  return page.locator('header select')
}

/** The languages the switcher offers, in its order. */
export async function offeredLanguages(page: Page): Promise<string[]> {
  const options = await languageSelect(page).locator('option').all()
  return Promise.all(options.map(async (o) => (await o.getAttribute('value')) ?? ''))
}

/**
 * Switches the page to `code` and waits until it shows: a language through the top bar's switcher,
 * the pseudo-locale by adding `?pseudo=1` to the address and sending the app's pseudo event (no
 * reload, so the photos stay).
 */
export async function setLanguage(page: Page, code: LanguageCode | 'pseudo'): Promise<void> {
  if (code === 'pseudo') {
    await page.evaluate(`(() => {
      const url = new URL(location.href)
      url.searchParams.set('pseudo', '1')
      history.replaceState(history.state, '', url.pathname + url.search + url.hash)
      dispatchEvent(new Event(${JSON.stringify(PSEUDO_EVENT)}))
    })()`)
    await expect(page.locator('html')).toHaveAttribute('lang', PSEUDO_LANGUAGE)
    return
  }
  await languageSelect(page).selectOption(code)
  await expect(page.locator('html')).toHaveAttribute('lang', code)
  await expect(languageSelect(page)).not.toHaveAttribute('aria-busy', 'true')
}

/**
 * Text that may show without the pseudo-locale's ⟦…⟧: numbers and symbols, quantities formatted
 * by `format.ts` (no key), the app's name, file names, ISO paper sizes and the switcher's endonyms.
 */
export const DEFAULT_ALLOW: readonly RegExp[] = [
  /^[\d\s.,:;×%°+\-–—−/()·…!?'"#]*$/u,
  /^[\d.,\s]+\s?(mm|in|MB|KB|px|DPI|%|°)$/u,
  /^(mm|in|MB|px)$/u,
  /^Artistica$/u,
  /\.(jpe?g|png|webp|gif|heic|heif|avif|json|pdf)$/iu,
  /^A[3-6]$/u,
  /^#[\da-f]{3,8}$/iu,
  new RegExp(`^(${LANGUAGES.map((code) => ENDONYMS[code]).join('|')})$`, 'u'),
]

/** In-page probes, as one script string: the e2e tsconfig has no DOM lib. */
const PROBES = String.raw`(() => {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()
  const rendered = (el) => {
    if (!el || el.getClientRects().length === 0) return false
    if (el.closest('details:not([open]) > :not(summary)')) return false
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.visibility !== 'visible' && p === el) return false
      if (s.display === 'none' || s.opacity === '0') return false
    }
    return true
  }
  const describe = (el) => {
    if (!el || el === document.body) return 'body'
    const parts = []
    for (let p = el; p && p !== document.body && parts.length < 4; p = p.parentElement) {
      let part = p.tagName.toLowerCase()
      if (p.id) part += '#' + p.id
      else if (typeof p.className === 'string' && p.className.trim())
        part += '.' + p.className.trim().split(/\s+/).filter((c) => !c.includes(':') && !c.includes('[')).slice(0, 2).join('.')
      parts.unshift(part)
    }
    return parts.join(' > ')
  }
  const srOnly = (el) => {
    const r = el.getBoundingClientRect()
    return r.width <= 1.5 || r.height <= 1.5
  }
  const blockOf = (el) => {
    let p = el
    while (p.parentElement && /^(inline|contents)$/.test(getComputedStyle(p).display)) p = p.parentElement
    return p
  }
  // Inside ⟦…⟧ when the text node holds a bracket, or when more ⟦ than ⟧ come before it in its
  // block: a <Trans> string spreads one bracketed message over several elements.
  const bracketed = (node) => {
    if (node.data.includes('⟦') || node.data.includes('⟧')) return true
    const block = blockOf(node.parentElement)
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let before = ''
    for (let n = walker.nextNode(); n && n !== node; n = walker.nextNode()) before += n.data
    return before.split('⟦').length - before.split('⟧').length > 0
  }
  const ATTRS = ['aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'title', 'placeholder', 'alt']

  const untranslated = (allowSources, leak) => {
    const allow = allowSources.map(([source, flags]) => new RegExp(source, flags))
    const allowed = (text) => !text || allow.some((r) => r.test(text))
    // The text outside every ⟦…⟧ (nested, or opened or closed in another node) must be allowed:
    // a literal joined to a translated message in code is untranslated too.
    const outside = (text) => {
      let rest = text
      for (let prev = ''; prev !== rest; ) {
        prev = rest
        rest = rest.replace(/⟦[^⟦⟧]*⟧/g, '\u0001')
      }
      return rest.replace(/⟦[\s\S]*$/, '\u0001').replace(/^[\s\S]*⟧/, '\u0001').split('\u0001').map(clean)
    }
    const ok = leak
      ? (text) => !/[⟦⟧]/.test(text)
      : (text) => (/[⟦⟧]/.test(text) ? outside(text).every(allowed) : allowed(text))
    const out = []
    if (!ok(clean(document.title))) out.push('document title: "' + clean(document.title) + '"')
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      const text = clean(n.data)
      if (!text || !el || el.closest('script, style, template, option')) continue
      if (!rendered(el)) continue
      if (ok(text) || (!leak && !/[⟦⟧]/.test(text) && bracketed(n))) continue
      out.push('text "' + text + '" in ' + describe(el))
    }
    for (const el of document.body.querySelectorAll('*')) {
      if (!rendered(el)) continue
      for (const attr of ATTRS) {
        const value = clean(el.getAttribute(attr))
        if (value && !ok(value)) out.push(attr + ' "' + value + '" on ' + describe(el))
      }
      if (el.tagName === 'SELECT' && el.selectedOptions[0] && getComputedStyle(el).opacity !== '0') {
        const value = clean(el.selectedOptions[0].textContent)
        if (value && !ok(value)) out.push('selected option "' + value + '" of ' + describe(el))
      }
    }
    return [...new Set(out)]
  }

  const boxed = (el) => {
    const s = getComputedStyle(el)
    const border = ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) => parseFloat(s['border' + side + 'Width']) > 0 && s['border' + side + 'Style'] !== 'none',
    )
    const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
    return border || bg || s.overflowX !== 'visible' || s.overflowY !== 'visible'
  }
  const scroller = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX + getComputedStyle(el).overflowY)
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (scroller(p)) return true
    return false
  }
  const ownTextRect = (el) => {
    let rect = null
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.data.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue
        rect = rect
          ? { left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) }
          : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      }
    }
    return rect
  }
  const past = (inner, outer) =>
    inner.left < outer.left - 1 || inner.right > outer.right + 1 || inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1
  const px = (r) => Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.right - r.left) + 'x' + Math.round(r.bottom - r.top)

  const overflow = () => {
    const out = []
    for (const el of document.body.querySelectorAll('*')) {
      if (!rendered(el) || srOnly(el) || el.closest('.sr-only')) continue
      const text = ownTextRect(el)
      if (!text) continue
      const s = getComputedStyle(el)
      if (s.textOverflow === 'ellipsis') continue
      const label = describe(el) + ' "' + clean(el.textContent).slice(0, 40) + '"'
      const clipsX = /(hidden|clip)/.test(s.overflowX)
      const clipsY = /(hidden|clip)/.test(s.overflowY)
      if (!scroller(el) && ((clipsX && el.scrollWidth > el.clientWidth + 1) || (clipsY && el.scrollHeight > el.clientHeight + 1))) {
        out.push(label + ': clipped (' + el.scrollWidth + 'x' + el.scrollHeight + ' in ' + el.clientWidth + 'x' + el.clientHeight + ')')
        continue
      }
      if (inScroller(el) && scroller(el)) continue
      let box = el
      while (box && box !== document.body && !boxed(box)) box = box.parentElement
      if (box && box !== document.body && !scroller(box) && past(text, box.getBoundingClientRect())) {
        out.push(label + ': text ' + px(text) + ' past ' + describe(box) + ' ' + px(box.getBoundingClientRect()))
        continue
      }
      if (box && box !== document.body && boxed(el) && el.parentElement) {
        const parent = el.parentElement
        if (!scroller(parent) && getComputedStyle(el).position !== 'absolute' && getComputedStyle(el).position !== 'fixed' && past(el.getBoundingClientRect(), parent.getBoundingClientRect()))
          out.push(label + ': box ' + px(el.getBoundingClientRect()) + ' past ' + describe(parent) + ' ' + px(parent.getBoundingClientRect()))
      }
    }
    return [...new Set(out)]
  }
  const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]'
  const live = () => {
    const out = []
    for (const region of document.querySelectorAll(LIVE)) {
      const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (clean(n.data)) out.push(clean(n.data))
    }
    return out
  }
  const CONTROLS = 'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"]'
  const norm = (t) => clean(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  // WCAG 2.5.3 for a control named by ARIA: the text it shows (aria-hidden parts and its own
  // description excepted) must be inside the name.
  const labelInName = () => {
    const out = []
    for (const el of document.querySelectorAll(CONTROLS)) {
      if (!rendered(el)) continue
      const labelledby = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      const label = el.getAttribute('aria-label')
      if (!labelledby.length && label === null) continue
      const name = labelledby.length
        ? labelledby.map((id) => (document.getElementById(id) || {}).textContent || '').join(' ')
        : label
      const described = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
      let shown = ''
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement
        if (!parent || !rendered(parent) || srOnly(parent)) continue
        if (parent.closest('[aria-hidden="true"]')) continue
        if (described.some((id) => { const d = document.getElementById(id); return d && d.contains(parent) })) continue
        shown += ' ' + n.data
      }
      const visible = norm(shown)
      if (visible && !(' ' + norm(name) + ' ').includes(' ' + visible + ' '))
        out.push(describe(el) + ': shows "' + clean(shown) + '", named "' + clean(name) + '"')
    }
    return out
  }
  return { untranslated, overflow, live, labelInName }
})()`

/**
 * Visible text, the document title and the names, descriptions, values, titles, placeholders and
 * alt texts of rendered elements that show no ⟦ (pseudo-locale) and match no `allow` pattern.
 */
export async function findUntranslated(
  page: Page,
  allow: readonly RegExp[] = DEFAULT_ALLOW,
): Promise<string[]> {
  const sources = allow.map((r) => [r.source, r.flags])
  return page.evaluate<string[]>(
    `(() => ${PROBES}.untranslated(${JSON.stringify(sources)}, false))()`,
  )
}

function englishStrings(tree: unknown): string[] {
  if (typeof tree === 'string') return [tree]
  if (tree === null || typeof tree !== 'object') return []
  return Object.values(tree).flatMap(englishStrings)
}

/** One or more English messages joined by spaces, each `{{variable}}` standing for any text. */
const ENGLISH_MESSAGES: RegExp = (() => {
  const dir = new URL('../../src/locales/en/', import.meta.url)
  const patterns = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => englishStrings(JSON.parse(readFileSync(new URL(name, dir), 'utf8'))))
    .filter((text) => /\p{L}/u.test(text.replace(/\{\{[^}]*\}\}/g, '')))
    .map((text) =>
      text
        .split(/\{\{[^}]*\}\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.+?'),
    )
  const one = `(?:${patterns.join('|')})`
  return new RegExp(`^${one}(?: ${one})*$`, 'u')
})()

/**
 * Allow patterns for the English messages live regions hold now, which keep their language after a
 * switch until they go (M6-R16). Call before switching; text that is no English message stays
 * reportable.
 */
export async function staleAnnouncements(page: Page): Promise<RegExp[]> {
  const texts = await page.evaluate<string[]>(`(() => ${PROBES}.live())()`)
  return [...new Set(texts)]
    .filter((text) => ENGLISH_MESSAGES.test(text))
    .map((text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'u'))
}

/** Any ⟦ or ⟧ on the page: the pseudo-locale leaking into a real language. */
export async function findPseudoLeak(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(`(() => ${PROBES}.untranslated([], true))()`)
}

/**
 * Elements whose own text is clipped, runs past the nearest ancestor that draws a box (border,
 * background or clip), or whose box runs past its parent. A text-overflow ellipsis is a deliberate
 * truncation, not an overflow; scrollers and visually hidden text are skipped.
 */
export async function findOverflow(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(`(() => ${PROBES}.overflow())()`)
}

/**
 * WCAG 2.5.3: each control whose name is set by ARIA keeps the text it shows inside that name
 * (text hidden from assistive technology and the control's own description excepted).
 */
export async function labelInName(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(`(() => ${PROBES}.labelInName())()`)
}
