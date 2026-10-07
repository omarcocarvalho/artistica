import { describe, expect, it } from 'vitest'
import { COMPOSITION_LINE_TYPES, SPIRAL_CORNERS } from '../model/lines'
import { NAMESPACES } from './languages'

const files = import.meta.glob<Record<string, unknown>>('../../locales/en/*.json', {
  eager: true,
  import: 'default',
})

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

describe('English locale files', () => {
  it('has exactly one file per namespace', () => {
    const names = Object.keys(files)
      .map((p) => /\/([^/]+)\.json$/.exec(p)?.[1])
      .sort()
    expect(names).toEqual([...NAMESPACES].sort())
  })

  it('uses camelCase keys and string values everywhere', () => {
    for (const [path, content] of Object.entries(files)) {
      expect(collectBadKeys(content), path).toEqual([])
    }
  })

  it('has the error groups sub-plans C and D add to', () => {
    const errors = Object.entries(files).find(([p]) => p.endsWith('/errors.json'))?.[1]
    expect(errors).toBeDefined()
    expect(Object.keys(errors ?? {})).toEqual(
      expect.arrayContaining(['images', 'export', 'generic']),
    )
  })

  it('names every composition-line type and spiral corner', () => {
    const lines = Object.entries(files).find(([p]) => p.endsWith('/lines.json'))?.[1] as
      { type?: Record<string, unknown>; corner?: Record<string, unknown> } | undefined
    expect(Object.keys(lines?.type ?? {})).toEqual([...COMPOSITION_LINE_TYPES])
    expect(Object.keys(lines?.corner ?? {})).toEqual([...SPIRAL_CORNERS])
  })
})
