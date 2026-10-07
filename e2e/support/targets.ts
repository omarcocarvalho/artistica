import { expect, type Locator } from '@playwright/test'

// The e2e tsconfig has no DOM lib; these are the few browser globals used inside evaluate.
interface ElementLike {
  contains(other: ElementLike | null): boolean
  scrollIntoView(options: { block: 'center'; inline: 'center' }): void
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
  getAnimations(options: { subtree: boolean }): { finished: Promise<unknown> }[]
  outerHTML: string
}
declare const document: { elementFromPoint(x: number, y: number): ElementLike | null }

export const MIN_TOUCH_TARGET_PX = 44
// WebKit snaps each hit-test edge to its 1/64 px layout unit.
const HIT_SNAP_PX = 2 / 64

export interface TargetSize {
  box: { width: number; height: number }
  /**
   * The area that hit-tests to the element (pseudo-elements included), measured along the two axes
   * through the centre of its box.
   */
  hit: { width: number; height: number }
}

/** Scrolls the element to the middle of the viewport, clear of fixed bars. */
export async function centre(target: Locator): Promise<void> {
  await target.evaluate((el: ElementLike) => {
    el.scrollIntoView({ block: 'center', inline: 'center' })
  })
}

/** Measures the element's box and its hit area where it is now (see `centre`). */
export async function targetSize(target: Locator): Promise<TargetSize> {
  return target.evaluate((el: ElementLike) => {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const hits = (x: number, y: number) => el.contains(document.elementFromPoint(x, y))
    const reach = (dx: number, dy: number) => {
      let lo = 0
      let hi = 200
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (hits(cx + dx * mid, cy + dy * mid)) lo = mid
        else hi = mid
      }
      return lo
    }
    return {
      box: { width: r.width, height: r.height },
      hit: { width: reach(-1, 0) + reach(1, 0), height: reach(0, -1) + reach(0, 1) },
    }
  })
}

/**
 * Asserts each target's box and hit area are both at least 44 x 44 px. Polls, because an overlay
 * scrollbar takes hits until it fades after the scroll.
 */
export async function expectTouchTargets(targets: readonly Locator[]): Promise<void> {
  for (const target of targets) {
    await expect(target).toBeVisible()
    const html = await target.evaluate((el: ElementLike) => el.outerHTML.slice(0, 100))
    await centre(target)
    await expect
      .poll(
        async () => {
          const { box, hit } = await targetSize(target)
          return Math.min(box.width, box.height, hit.width + HIT_SNAP_PX, hit.height + HIT_SNAP_PX)
        },
        { message: html },
      )
      .toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
  }
}

/** Resolves once every CSS animation and transition inside the element has finished. */
export async function settled(container: Locator): Promise<void> {
  await container.evaluate(async (el: ElementLike) => {
    await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
  })
}
