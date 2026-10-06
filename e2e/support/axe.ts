import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export interface AxeOptions {
  include?: string
  exclude?: string
  disableRules?: string[]
}

interface AnimationLike {
  readonly finished: Promise<unknown>
  readonly effect: { getComputedTiming(): { endTime?: number | string } } | null
}
declare const document: { getAnimations(): AnimationLike[] }

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

export async function expectNoAxeViolations(page: Page, options: AxeOptions = {}): Promise<void> {
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
}
