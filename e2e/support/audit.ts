import { expect, type Page } from '@playwright/test'
import { settleAnimations } from './axe.ts'

/**
 * In-page helpers for the accessibility audit, as one script string: the e2e tsconfig has no DOM
 * lib, and these walk the DOM far more than the typed helpers elsewhere. `page.evaluate` runs it
 * outside the page's own scripts, so nothing here is left behind in the app.
 */
const LIB = String.raw`(() => {
  const ctx = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    return c.getContext('2d', { willReadFrequently: true })
  })()
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const over = (top, under) => {
    const a = top[3]
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a))
  }
  // The sheet and its arrange layer are paper white in both themes (arrange.css).
  const PAPER = '.arrange-layer'
  const bgBehind = (el) => {
    const layers = []
    for (let p = el; p; p = p.parentElement) {
      if (p.matches && p.matches(PAPER)) {
        layers.push([255, 255, 255, 1])
        break
      }
      const c = rgba(getComputedStyle(p).backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 1) break
    }
    let out = [255, 255, 255]
    const page = rgba(getComputedStyle(document.body).backgroundColor)
    if (page[3] > 0) out = page.slice(0, 3)
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out)
    return out
  }
  const hidden = (el) =>
    el.closest('[aria-hidden="true"], [inert]') !== null ||
    getComputedStyle(el).visibility !== 'visible'
  const box = (el) => el.getBoundingClientRect()
  const srOnly = (el) => {
    const r = box(el)
    return r.width <= 1.5 || r.height <= 1.5
  }
  const shown = (el) => {
    const r = box(el)
    return r.width > 0 && r.height > 0 && !hidden(el)
  }
  const describe = (el) => {
    if (!el || el === document.body) return 'body'
    const name =
      el.getAttribute('aria-label') ||
      (el.labels && el.labels[0] && el.labels[0].textContent) ||
      el.textContent ||
      el.getAttribute('title') ||
      ''
    return el.tagName.toLowerCase() + (el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : '') +
      ' "' + name.replace(/\s+/g, ' ').trim().slice(0, 50) + '"'
  }
  const modal = () => {
    const open = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(shown)
    return open.length ? open[open.length - 1] : null
  }
  const tabbable = (el) => {
    if (el.tabIndex < 0 || el.disabled || !shown(el)) return false
    const top = modal()
    if (top && !top.contains(el)) return false
    if (el.closest('[data-radix-focus-guard]')) return false
    if (el.matches('input[type="radio"]') && el.name) {
      const group = [...document.querySelectorAll('input[type="radio"]')].filter((r) => r.name === el.name)
      if (group.some((r) => r.checked) && !el.checked) return false
    }
    return true
  }
  const tabbables = () => [...document.querySelectorAll('*')].filter(tabbable)
  const ring = (el) => {
    const parts = [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after')]
    let best = null
    for (const s of parts) {
      const w = parseFloat(s.outlineWidth)
      if (s.outlineStyle !== 'none' && w > 0) {
        const c = rgba(s.outlineColor)
        if (!best || w > best.width) best = { width: w, color: c, kind: 'outline' }
      }
      if (s.boxShadow && s.boxShadow !== 'none') {
        const m = s.boxShadow.match(/(rgba?\([^)]*\)|#[0-9a-f]+)[^,]*?(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/i)
        if (m) {
          const spread = parseFloat(m[5])
          if (spread > 0 && (!best || spread > best.width)) best = { width: spread, color: rgba(m[1]), kind: 'shadow' }
        }
      }
    }
    return best
  }
  const notObscured = (el) => {
    const r = box(el)
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 2, r.top + 2],
      [r.right - 2, r.top + 2],
      [r.left + 2, r.bottom - 2],
      [r.right - 2, r.bottom - 2],
    ]
    return pts.some(([x, y]) => {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false
      const top = document.elementFromPoint(x, y)
      return top !== null && (top === el || el.contains(top) || (el.labels && [...el.labels].some((l) => l.contains(top))))
    })
  }
  const focusStop = () => {
    const el = document.activeElement
    if (!document.hasFocus() || !el || el === document.body || el === document.documentElement)
      return { body: true }
    if (!el.dataset.auditId) el.dataset.auditId = String(Math.random()).slice(2)
    const shownAs = srOnly(el) && el.labels && el.labels[0] ? el.labels[0] : el
    const r = ring(shownAs)
    const bg = bgBehind(shownAs.parentElement || shownAs)
    return {
      body: false,
      id: el.dataset.auditId,
      name: describe(el),
      focusVisible: el.matches(':focus-visible'),
      ringWidth: r ? r.width : 0,
      ringContrast: r ? Math.round(ratio(over(r.color, bg), bg) * 100) / 100 : 0,
      notObscured: notObscured(shownAs),
      outsideModal: modal() !== null && !modal().contains(el),
      within: [...(function* () { for (let p = el.parentElement; p; p = p.parentElement) if (p.dataset && p.dataset.auditId) yield p.dataset.auditId })()],
    }
  }
  const markTabbables = (skip) =>
    tabbables().filter((el) => !skip || !el.matches(skip)).map((el) => {
      if (!el.dataset.auditId) el.dataset.auditId = String(Math.random()).slice(2)
      return { id: el.dataset.auditId, name: describe(el) }
    })
  const TARGETS = 'button, input:not([type="hidden"]), select, textarea, a[href], [role="slider"], [role="switch"], [role="radio"], [role="tab"], [role="button"], [role="checkbox"]'
  const inlineLink = (el) =>
    el.matches('a') && el.parentElement && el.parentElement.matches('p, li, span') &&
    (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length
  const targets = () =>
    [...document.querySelectorAll(TARGETS)].filter(
      (el) => shown(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !srOnly(el) &&
        !inlineLink(el) && !el.closest('[data-radix-focus-guard]') && box(el).bottom > 0 && box(el).top < innerHeight,
    )
  const smallTargets = (min, spacing) => {
    const all = targets()
    const rects = all.map(box)
    const out = []
    all.forEach((el, i) => {
      const r = rects[i]
      if (r.width >= min - 0.05 && r.height >= min - 0.05) return
      if (spacing) {
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const clear = rects.every((o, j) => {
          if (j === i || all[j].contains(el) || el.contains(all[j])) return true
          const dx = Math.max(o.left - cx, 0, cx - o.right)
          const dy = Math.max(o.top - cy, 0, cy - o.bottom)
          return Math.hypot(dx, dy) >= min / 2
        })
        if (clear) return
      }
      out.push(describe(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
    })
    return out
  }
  const horizontalOverflow = () => {
    const out = []
    if (document.documentElement.scrollWidth > innerWidth + 1)
      out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + innerWidth)
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el) || srOnly(el)) continue
      const r = box(el)
      if (r.right <= innerWidth + 1 && r.left >= -1) continue
      let scroller = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (/(auto|scroll)/.test(s.overflowX)) {
          scroller = true
          break
        }
      }
      if (!scroller && el.children.length === 0 && (el.textContent || '').trim()) out.push(describe(el))
    }
    return out
  }
  const clippedText = () => {
    const out = []
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el) || srOnly(el)) continue
      const s = getComputedStyle(el)
      if (!/(hidden|clip)/.test(s.overflowX + s.overflowY)) continue
      if (s.textOverflow === 'ellipsis') continue
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!own) continue
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(describe(el))
    }
    return out
  }
  return { rgba, ratio, over, bgBehind, describe, tabbables, markTabbables, focusStop, smallTargets, horizontalOverflow, clippedText, ring }
})()`

export async function inPage<T>(page: Page, body: string): Promise<T> {
  return page.evaluate<T>(`(() => { const A = ${LIB}; ${body} })()`)
}

export interface FocusStop {
  body: boolean
  id?: string
  name?: string
  focusVisible?: boolean
  ringWidth?: number
  ringContrast?: number
  notObscured?: boolean
  outsideModal?: boolean
  /** Audit ids of marked ancestors: a roving group's root counts as reached through its item. */
  within?: string[]
}

export interface TabWalk {
  stops: FocusStop[]
  closed: boolean
  missed: string[]
  problems: string[]
}

/** The Tab key that moves through every control (WebKit needs Alt to reach buttons and links). */
export function tabKey(browserName: string): string {
  return browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
}

/**
 * Tabs from the current focus until a stop repeats (WCAG 2.1.2: the loop closes, so focus is never
 * trapped), checking every stop for a visible ring of 2 px or more at 3:1 (2.4.7) that is not
 * fully hidden by sticky bars or overlays (2.4.11), and that every tabbable control was reached
 * (2.1.1).
 */
export async function walkTab(page: Page, key: string, skip = '', max = 250): Promise<TabWalk> {
  await settleAnimations(page)
  const start = await inPage<FocusStop>(page, 'return A.focusStop()')
  const want = await inPage<{ id: string; name: string }[]>(
    page,
    `return A.markTabbables(${JSON.stringify(skip)})`,
  )
  const first = want.at(0)?.id
  const last = want.at(-1)?.id
  const problems: string[] = []
  // One pass in a direction: ends on a repeat (the loop closed), or on a press that does not move
  // focus off the first or last control (focus left for the browser, or a dialog that only wraps
  // on a plain Tab); not moving anywhere else is a trap.
  const pass = async (press: string, edge: string | undefined) => {
    const stops: FocusStop[] = []
    const seen = new Set<string>()
    let previous = start.body ? undefined : start.id
    for (let i = 0; i < max; i++) {
      await page.keyboard.press(press)
      const stop = await inPage<FocusStop>(page, 'return A.focusStop()')
      if (stop.body) {
        stops.push(stop)
        previous = undefined
        continue
      }
      const id = stop.id ?? ''
      if (id === previous) {
        if (id !== edge) problems.push(`${stop.name ?? ''}: ${press} does not move focus`)
        return { stops, cycled: false }
      }
      stops.push(stop)
      if (seen.has(id)) return { stops, cycled: true }
      seen.add(id)
      previous = id
    }
    problems.push(`no repeat after ${String(max)} presses`)
    return { stops, cycled: false }
  }
  const forward = await pass(key, last)
  const stops = [...forward.stops]
  if (!forward.cycled) stops.push(...(await pass(`Shift+${key}`, first)).stops)
  const visited = new Set([start, ...stops].flatMap((s) => [s.id, ...(s.within ?? [])]))
  const missed = want.filter((w) => !visited.has(w.id)).map((w) => w.name)
  for (const s of stops) {
    if (s.body) continue
    if (!s.focusVisible) problems.push(`${s.name ?? ''}: not :focus-visible`)
    else if ((s.ringWidth ?? 0) < 2)
      problems.push(`${s.name ?? ''}: ring ${String(s.ringWidth)} px`)
    else if ((s.ringContrast ?? 0) < 3)
      problems.push(`${s.name ?? ''}: ring ${String(s.ringContrast)}:1`)
    if (!s.notObscured) problems.push(`${s.name ?? ''}: hidden by other content`)
    if (s.outsideModal) problems.push(`${s.name ?? ''}: outside the open dialog`)
  }
  return {
    stops,
    closed: problems.every((p) => !p.includes('does not move') && !p.startsWith('no repeat')),
    missed,
    problems: [...new Set(problems)],
  }
}

export async function expectTabLoop(
  page: Page,
  key: string,
  label: string,
  skip = '',
): Promise<number> {
  const walk = await walkTab(page, key, skip)
  expect(walk.closed, `${label}: Tab loop closes`).toBe(true)
  expect(walk.missed, `${label}: tabbable controls Tab never reached`).toEqual([])
  expect(walk.problems, `${label}: focus stops`).toEqual([])
  return walk.stops.filter((s) => !s.body).length
}

/** Targets under `min` px (2.5.8); with `spacing`, an undersized target clear of others passes. */
export async function smallTargets(page: Page, min: number, spacing: boolean): Promise<string[]> {
  return inPage<string[]>(page, `return A.smallTargets(${String(min)}, ${String(spacing)})`)
}

export async function horizontalOverflow(page: Page): Promise<string[]> {
  return inPage<string[]>(page, 'return A.horizontalOverflow()')
}

export async function clippedText(page: Page): Promise<string[]> {
  return inPage<string[]>(page, 'return A.clippedText()')
}

/** WCAG 1.4.12's minimum text spacing, applied to every element. */
export const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`

/** Contrast of the computed `color` of each match against what is behind it. */
export async function textContrasts(
  page: Page,
  selector: string,
): Promise<{ name: string; ratio: number }[]> {
  return inPage(
    page,
    `return [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const own = A.rgba(getComputedStyle(el).backgroundColor)
        const bg = own[3] >= 1 ? own.slice(0, 3) : A.over(own, A.bgBehind(el.parentElement || el))
        const fg = A.over(A.rgba(getComputedStyle(el).color), bg)
        return { name: A.describe(el), ratio: Math.round(A.ratio(fg, bg) * 100) / 100 }
      })`,
  )
}

/** Contrast of a CSS colour against another (both any CSS colour syntax). */
export async function colourContrast(page: Page, a: string, b: string): Promise<number> {
  return inPage<number>(
    page,
    `const x = A.rgba(${JSON.stringify(a)}); const y = A.rgba(${JSON.stringify(b)});
     return Math.round(A.ratio(A.over(x, y.slice(0, 3)), y.slice(0, 3)) * 100) / 100`,
  )
}

export interface LiveEvent {
  frame: number
  region: string
  text: string
  bornWithText: boolean
}

/**
 * Records, from now on, every text a live region gains: a status, alert or log role, or an
 * aria-live region, including ones added later. `bornWithText` marks a region inserted with its
 * text already in it, which Safari and VoiceOver can miss (the region must exist first).
 */
export async function recordLiveRegions(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const w = window
    w.__live = []
    w.__frame = 0
    const tick = () => { w.__frame++; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    const LIVE = '[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"])'
    const born = new WeakMap()
    const last = new WeakMap()
    const regionOf = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest(LIVE) ?? null
    const read = (r) => (r.textContent || '').replace(/\\s+/g, ' ').trim()
    for (const r of document.querySelectorAll(LIVE)) { born.set(r, -1); last.set(r, read(r)) }
    const label = (r) => (r.getAttribute('role') || 'live') + (r.getAttribute('aria-label') ? ' ' + r.getAttribute('aria-label') : '')
    new MutationObserver((records) => {
      const touched = new Set()
      for (const rec of records) {
        for (const n of rec.addedNodes) {
          if (n.nodeType === 1) {
            const inner = [n, ...n.querySelectorAll(LIVE)].filter((e) => e.matches(LIVE))
            for (const r of inner) if (!born.has(r)) { born.set(r, w.__frame); last.set(r, ''); touched.add(r) }
          }
        }
        const r = regionOf(rec.target)
        if (r) touched.add(r)
      }
      for (const r of touched) {
        if (!born.has(r)) { born.set(r, w.__frame); last.set(r, '') }
        const text = read(r)
        if (text && text !== last.get(r)) {
          w.__live.push({ frame: w.__frame, region: label(r), text, bornWithText: born.get(r) === w.__frame })
        }
        last.set(r, text)
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })()`)
}

export async function liveEvents(page: Page): Promise<LiveEvent[]> {
  return page.evaluate<LiveEvent[]>('window.__live || []')
}
