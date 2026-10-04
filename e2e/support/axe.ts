import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export interface AxeOptions {
  include?: string
  exclude?: string
  disableRules?: string[]
}

export async function expectNoAxeViolations(page: Page, options: AxeOptions = {}): Promise<void> {
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
