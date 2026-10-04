import { describe, expect, it } from 'vitest'
import { applyTheme, nextTheme, parseTheme, saveTheme, SETTINGS_KEY } from './theme'

function memoryStorage(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(SETTINGS_KEY, initial)
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    raw: () => data.get(SETTINGS_KEY),
  }
}

describe('parseTheme', () => {
  it('reads state.theme and defaults to auto for anything else', () => {
    expect(parseTheme('{"state":{"theme":"dark"},"version":1}')).toBe('dark')
    expect(parseTheme('{"state":{"theme":"sepia"}}')).toBe('auto')
    expect(parseTheme('not json')).toBe('auto')
    expect(parseTheme(null)).toBe('auto')
  })
})

describe('nextTheme', () => {
  it('cycles auto, light, dark', () => {
    expect(nextTheme('auto')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('auto')
  })
})

describe('applyTheme', () => {
  it('sets the attribute for light/dark and removes it for auto', () => {
    const root = { dataset: {} as Record<string, string | undefined> }
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme(root, 'auto')
    expect(root.dataset.theme).toBeUndefined()
  })
})

describe('saveTheme', () => {
  it('merges into an existing settings blob without touching other fields', () => {
    const s = memoryStorage('{"state":{"theme":"auto","unit":"in"},"version":1}')
    saveTheme(s, 'dark')
    expect(JSON.parse(s.raw() ?? '{}')).toEqual({
      state: { theme: 'dark', unit: 'in' },
      version: 1,
    })
  })
  it('does not create a settings blob from nothing, and survives corrupt data', () => {
    const empty = memoryStorage()
    saveTheme(empty, 'dark')
    expect(empty.raw()).toBeUndefined()
    const bad = memoryStorage('{oops')
    saveTheme(bad, 'dark')
    expect(bad.raw()).toBe('{oops')
  })
})
