/**
 * Parse what a person types into a number field. Accepts "5", "5.5", "5,5", " 5 ", ".5", "5.".
 * Returns null for anything else (empty, letters, "1,000.5" with two separators, Infinity).
 */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d*[.,]?\d*$/.test(trimmed) || !/\d/.test(trimmed)) return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
