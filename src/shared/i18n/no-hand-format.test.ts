import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..')
const FORBIDDEN = ['toFixed(', 'String(roundForUnit']
const ALLOWED = new Set(['shared/i18n/format.ts'])

function sources(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => f.split('\\').join('/'))
}

function handFormatted(files: readonly string[], read: (file: string) => string): string[] {
  return files.flatMap((file) =>
    ALLOWED.has(file)
      ? []
      : read(file)
          .split('\n')
          .flatMap((line, i) =>
            FORBIDDEN.some((f) => line.includes(f)) ? [`src/${file}:${String(i + 1)}`] : [],
          ),
  )
}

describe('no number is formatted by hand (M6-R7)', () => {
  it('scans a non-empty source tree', () => {
    const files = sources()
    expect(files).toContain('shared/i18n/format.ts')
    expect(files.length).toBeGreaterThan(100)
  })

  it('finds toFixed and String(roundForUnit outside format.ts', () => {
    const fake: Record<string, string> = {
      'a.ts': 'const x = n.toFixed(1)',
      'b.tsx': 'ok\nString(roundForUnit(v, unit))',
      'shared/i18n/format.ts': 'n.toFixed(2)',
    }
    expect(handFormatted(Object.keys(fake), (f) => fake[f] ?? '')).toEqual([
      'src/a.ts:1',
      'src/b.tsx:2',
    ])
  })

  it('has no hit in src', () => {
    expect(handFormatted(sources(), (f) => readFileSync(join(SRC, f), 'utf8'))).toEqual([])
  })
})
