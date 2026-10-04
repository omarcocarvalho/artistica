/** `list[i]`, or a RangeError when out of range (always a bug). Avoids `!` under noUncheckedIndexedAccess. */
export function nth<T>(list: readonly T[], i: number): T {
  const value = list[i]
  if (value === undefined)
    throw new RangeError(`index ${String(i)} out of range (${String(list.length)})`)
  return value
}
