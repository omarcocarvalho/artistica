import { DEFAULT_PAGE_DRAW_COLORS, type PageDrawColors } from './draw-page'

/**
 * Guide colours from the design tokens, with fallbacks; `missing` and `group` are fixed.
 * Everything here is drawn on the white sheet, so nothing changes with the theme.
 */
export function readDrawColors(
  el: Element,
  getStyle: (el: Element) => Pick<CSSStyleDeclaration, 'getPropertyValue'> = (e) =>
    getComputedStyle(e),
): PageDrawColors {
  const css = getStyle(el)
  const pick = (name: string, fallback: string): string =>
    css.getPropertyValue(name).trim() || fallback
  const d = DEFAULT_PAGE_DRAW_COLORS
  return {
    paper: pick('--color-paper', d.paper),
    safe: pick('--color-guide-safe', d.safe),
    bleed: pick('--color-guide-bleed', d.bleed),
    cut: pick('--color-guide-cut', d.cut),
    mark: pick('--color-crop-mark', d.mark),
    missing: d.missing,
    group: d.group,
  }
}
