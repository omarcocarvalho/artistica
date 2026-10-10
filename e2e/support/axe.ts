import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

type Result = Awaited<ReturnType<AxeBuilder['analyze']>>['incomplete'][number]
type NodeResult = Result['nodes'][number]

export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export interface AxeOptions {
  include?: string
  exclude?: string
  disableRules?: string[]
}

/**
 * An axe `incomplete` result checked by hand. It covers a node when the rule matches, the node
 * matches `selector`, axe's reason is one of `messageKeys` (any reason when absent) and, with
 * `forcedColors`, only while forced colours are active.
 */
export interface ReviewedIncomplete {
  readonly rule: string
  readonly selector: string
  readonly messageKeys?: readonly string[]
  readonly forcedColors?: true
  readonly reason: string
}

/**
 * Every entry names what was checked and where the check lives. Contrast nodes that axe could not
 * judge because they were partly scrolled out or under a sticky bar are not listed: the helper
 * scrolls each into view and asks axe again (`OBSCURED`).
 */
export const REVIEWED_INCOMPLETE: readonly ReviewedIncomplete[] = [
  {
    rule: 'aria-hidden-focus',
    selector: '[data-aria-hidden="true"], [data-radix-focus-guard]',
    reason:
      'Radix hides everything outside an open dialog or sheet (data-aria-hidden) and adds focus guards that hand focus straight back; the dialog traps focus, so none of these is reachable by Tab. a11y-audit "2.1.2" walks Tab through every dialog and sheet and never leaves it.',
  },
  {
    rule: 'color-contrast',
    selector: 'select.ds-select',
    messageKeys: ['bgGradient', 'bgImage'],
    reason:
      'The chevron is a background image on the right, away from the text. a11y-audit "1.4.3 text axe cannot judge" measures the text colour against the select background in light and dark.',
  },
  {
    rule: 'color-contrast',
    selector: '.page-tile-label',
    messageKeys: ['imgNode', 'bgOverlap', 'colorParse'],
    reason:
      'Version labels sit on the photo with an 85 % white backing (a color-mix, which axe cannot parse in every engine); over pure black it is #d9d9d9, 11:1 with the label ink. a11y-audit "1.4.3 text axe cannot judge" measures them.',
  },
  {
    rule: 'color-contrast',
    selector: '.ds-badge',
    messageKeys: ['bgOverlap'],
    reason:
      'Warning chips on a page tile have an opaque badge background over the canvas. a11y-audit "1.4.3 text axe cannot judge" measures the badge text against it.',
  },
  {
    rule: 'color-contrast',
    selector: '.ds-dialog p, .ds-sheet p',
    messageKeys: ['elmPartiallyObscuring'],
    reason:
      'Dialog and sheet text over the dashed sketch card or a nested dialog, which axe reads as overlapping; the text sits on the opaque surface. a11y-audit "1.4.3 text axe cannot judge" measures it in light and dark.',
  },
  {
    rule: 'color-contrast',
    selector: 'button[aria-label]',
    messageKeys: ['nonBmp'],
    reason:
      'Glyph-only buttons named by aria-label (the − and + copy steppers): axe skips symbol text. a11y-audit "1.4.3 text axe cannot judge" measures them.',
  },
  {
    rule: 'color-contrast',
    selector: '.lines-pair__times',
    messageKeys: ['shortTextContent'],
    reason:
      'The "×" between Columns and Rows is aria-hidden decoration in the muted ink (5:1 or more).',
  },
  {
    rule: 'color-contrast',
    selector: '*',
    messageKeys: ['equalRatio', 'bgGradient', 'bgImage', 'imgNode', 'bgOverlap'],
    forcedColors: true,
    reason:
      'Under forced colours the browser paints system colours that axe reads back as the author ones; contrast is then the user theme. a11y-audit "forced colours" checks each control family keeps a visible boundary and state.',
  },
]

/** Marks a node replaced since axe looked at it (a redrawn tile): the scan is run again. */
const GONE = 'gone: '

/** Reasons axe gives when part of a node is outside its scroller or under another element. */
const OBSCURED = new Set(['elmPartiallyObscured', 'elmPartiallyObscuring', 'outsideViewport'])

interface AnimationLike {
  readonly finished: Promise<unknown>
  readonly effect: { getComputedTiming(): { endTime?: number | string } } | null
}
interface ElementLike {
  matches(selector: string): boolean
  scrollIntoView(options: { block: 'center'; inline: 'center' }): void
  parentElement: ElementLike | null
  scrollTop: number
  scrollLeft: number
}
declare const document: {
  getAnimations(): AnimationLike[]
  querySelector(selector: string): ElementLike | null
  createElement(tag: 'template'): {
    innerHTML: string
    content: { firstElementChild: ElementLike | null }
  }
}
declare function matchMedia(query: string): { matches: boolean }

/**
 * Waits for every finite CSS animation and transition (dialog pop-in, sheet slide, theme
 * colour change): a half-faded element has a lower contrast than the one the user reads.
 * Infinite ones (the progress stripes) never finish and are left running.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
  })
}

function messageKey(node: NodeResult): string | undefined {
  for (const check of [...node.any, ...node.all, ...node.none]) {
    const data: unknown = check.data
    if (data && typeof data === 'object' && 'messageKey' in data) {
      const key = (data as { messageKey?: unknown }).messageKey
      if (typeof key === 'string') return key
    }
  }
  return undefined
}

function selectorOf(node: NodeResult): string | null {
  const parts = node.target
  if (parts.length !== 1 || typeof parts[0] !== 'string') return null
  return parts[0]
}

interface RecheckResult {
  verdict: 'passes' | 'gone' | 'violation' | 'incomplete'
  detail: string
}

/**
 * Scrolls the node to the middle of its scrollers, asks axe (already in the page from the scan)
 * about its contrast, and scrolls back, in one round trip.
 */
async function recheckContrast(page: Page, selector: string): Promise<string> {
  const r = await page.evaluate<RecheckResult>(
    `(async (sel) => {
      const el = document.querySelector(sel)
      if (!el) return { verdict: 'gone', detail: '' }
      const scrolls = []
      for (let p = el.parentElement; p; p = p.parentElement) scrolls.push([p, p.scrollTop, p.scrollLeft])
      el.scrollIntoView({ block: 'center', inline: 'center' })
      try {
        const res = await window.axe.run(el, { runOnly: ['color-contrast'] })
        const v = res.violations[0]
        if (v) return { verdict: 'violation', detail: v.nodes[0] ? v.nodes[0].failureSummary : '' }
        const i = res.incomplete[0]
        if (i) {
          const d = i.nodes[0] && i.nodes[0].any[0] && i.nodes[0].any[0].data
          return { verdict: 'incomplete', detail: (d && d.messageKey) || 'no reason' }
        }
        return { verdict: 'passes', detail: '' }
      } finally {
        for (const [p, top, left] of scrolls) { p.scrollTop = top; p.scrollLeft = left }
      }
    })(${JSON.stringify(selector)})`,
  )
  if (r.verdict === 'passes' || r.verdict === 'gone') return r.verdict
  if (r.verdict === 'violation') return `color-contrast: ${r.detail}`
  return `still incomplete (${r.detail})`
}

/** Incomplete nodes that no reviewed entry covers, as readable lines. */
export async function unreviewedIncomplete(
  page: Page,
  incomplete: readonly Result[],
  reviewed: readonly ReviewedIncomplete[] = REVIEWED_INCOMPLETE,
): Promise<string[]> {
  const forced = await page.evaluate(() => matchMedia('(forced-colors: active)').matches)
  const open: string[] = []
  for (const result of incomplete) {
    for (const node of result.nodes) {
      const selector = selectorOf(node)
      const key = messageKey(node)
      const line = `${result.id} (${key ?? 'no reason'}): ${node.target.join(' ')} ${node.html.slice(0, 120)}`
      if (!selector) {
        open.push(line)
        continue
      }
      const candidates = reviewed.filter(
        (r) =>
          r.rule === result.id &&
          (!r.messageKeys || (key !== undefined && r.messageKeys.includes(key))) &&
          (!r.forcedColors || forced),
      )
      // Firefox sometimes reports a node's target as `:root`; its markup still identifies it.
      const covered = await page.evaluate(
        ([sel, html, selectors]) => {
          let el = document.querySelector(sel)
          if (sel === ':root') {
            const t = document.createElement('template')
            t.innerHTML = html
            el = t.content.firstElementChild
          }
          if (el === null) return 'gone'
          return selectors.some((s) => el.matches(s)) ? 'yes' : 'no'
        },
        [selector, node.html, candidates.map((c) => c.selector)] as const,
      )
      if (covered === 'yes') continue
      if (covered === 'gone') {
        open.push(`${GONE}${line}`)
        continue
      }
      if (result.id === 'color-contrast' && key !== undefined && OBSCURED.has(key)) {
        const verdict = await recheckContrast(page, selector)
        if (verdict === 'passes' || verdict === 'gone') continue
        open.push(`${line} → in view: ${verdict}`)
        continue
      }
      open.push(line)
    }
  }
  return open
}

export async function expectNoAxeViolations(page: Page, options: AxeOptions = {}): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    await settleAnimations(page)
    const builder = new AxeBuilder({ page }).withTags(WCAG_22_AA)
    if (options.include) builder.include(options.include)
    if (options.exclude) builder.exclude(options.exclude)
    if (options.disableRules) builder.disableRules(options.disableRules)
    const results = await builder.analyze()
    expect(
      results.violations.map(
        (v) =>
          `${v.id}: ${v.help} (${String(v.nodes.length)} nodes) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([])
    const open = await unreviewedIncomplete(page, results.incomplete)
    if (attempt < 2 && open.some((line) => line.startsWith(GONE))) continue
    expect(open, 'unreviewed axe incomplete').toEqual([])
    return
  }
}
