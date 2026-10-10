import { describe, expect, it } from 'vitest'
import { LINE_TYPES, SPIRAL_CORNERS } from '../model/lines'
import { LANGUAGES, NAMESPACES } from './languages'

const allFiles = import.meta.glob<Record<string, unknown>>('../../locales/*/*.json', {
  eager: true,
  import: 'default',
})
const files = Object.fromEntries(
  Object.entries(allFiles).filter(([path]) => path.includes('/locales/en/')),
)

function byLanguage(): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  for (const [path, content] of Object.entries(allFiles)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
    if (!match?.[1] || !match[2]) continue
    const tree = out.get(match[1]) ?? {}
    tree[match[2]] = content
    out.set(match[1], tree)
  }
  return out
}

const KEY = /^[a-z][A-Za-z0-9]*(_(zero|one|two|few|many|other))?$/

function collectBadKeys(value: unknown, path: string[] = []): string[] {
  if (typeof value === 'string') return []
  if (typeof value !== 'object' || value === null)
    return [`${path.join('.')} is not a string or object`]
  return Object.entries(value).flatMap(([key, child]) => [
    ...(KEY.test(key) ? [] : [[...path, key].join('.')]),
    ...collectBadKeys(child, [...path, key]),
  ])
}

describe('every locale folder', () => {
  const languages = byLanguage()

  it('is named after a language code and includes English', () => {
    expect(languages.has('en')).toBe(true)
    for (const lang of languages.keys()) expect(LANGUAGES, lang).toContain(lang)
  })

  it.each([...languages])('%s has exactly one file per namespace', (_lang, tree) => {
    expect(Object.keys(tree).sort()).toEqual([...NAMESPACES].sort())
  })

  it.each([...languages])('%s uses camelCase keys and string values everywhere', (lang, tree) => {
    for (const [ns, content] of Object.entries(tree)) {
      expect(collectBadKeys(content), `${lang}/${ns}`).toEqual([])
    }
  })
})

describe('English locale files', () => {
  it('has the error groups sub-plans C and D add to', () => {
    const errors = Object.entries(files).find(([p]) => p.endsWith('/errors.json'))?.[1]
    expect(errors).toBeDefined()
    expect(Object.keys(errors ?? {})).toEqual(
      expect.arrayContaining(['images', 'export', 'generic']),
    )
  })

  it('names every line type and spiral corner', () => {
    const lines = Object.entries(files).find(([p]) => p.endsWith('/lines.json'))?.[1] as
      { type?: Record<string, unknown>; corner?: Record<string, unknown> } | undefined
    expect(Object.keys(lines?.type ?? {})).toEqual([...LINE_TYPES])
    expect(Object.keys(lines?.corner ?? {})).toEqual([...SPIRAL_CORNERS])
  })
})
