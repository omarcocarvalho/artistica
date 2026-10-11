import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..')
const TRANSLATE = /(?:^|[^\w$.])(?:i18n\.|i18next\.)?t\(/
const PLUS_JOIN =
  /(?:^|[^\w$.])(?:i18n\.|i18next\.)?t\([^)]*\)\s*\+(?!\+)|(?<!\+)\+\s*(?:i18n\.|i18next\.)?t\(/

interface Template {
  readonly line: number
  readonly text: string[]
  readonly expressions: string[]
}

function sources(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => f.split('\\').join('/'))
}

/** Every template literal in `code`, nested ones included, with its text parts and `${}` expressions. */
function templates(code: string): Template[] {
  const found: Template[] = []
  const lineAt = (i: number) => code.slice(0, i).split('\n').length

  const skipString = (i: number, quote: string): number => {
    let j = i + 1
    while (j < code.length && code[j] !== quote && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1
    return j + 1
  }

  /** Reads code from `i` until an unmatched `}` (or the end); returns the index of that `}`. */
  const readCode = (i: number): number => {
    let depth = 0
    let j = i
    while (j < code.length) {
      const c = code[j]
      const next = code[j + 1]
      if (c === '/' && next === '/') {
        const end = code.indexOf('\n', j)
        j = end === -1 ? code.length : end
      } else if (c === '/' && next === '*') {
        const end = code.indexOf('*/', j + 2)
        j = end === -1 ? code.length : end + 2
      } else if (c === "'" || c === '"') {
        j = skipString(j, c)
      } else if (c === '`') {
        j = readTemplate(j)
      } else if (c === '{') {
        depth += 1
        j += 1
      } else if (c === '}') {
        if (depth === 0) return j
        depth -= 1
        j += 1
      } else {
        j += 1
      }
    }
    return j
  }

  /** Reads the template literal opening at `i`; returns the index after its closing backtick. */
  const readTemplate = (i: number): number => {
    const template: Template = { line: lineAt(i), text: [], expressions: [] }
    found.push(template)
    let j = i + 1
    let text = ''
    while (j < code.length && code[j] !== '`') {
      if (code[j] === '\\') {
        text += code.slice(j, j + 2)
        j += 2
      } else if (code[j] === '$' && code[j + 1] === '{') {
        template.text.push(text)
        text = ''
        const end = readCode(j + 2)
        template.expressions.push(code.slice(j + 2, end))
        j = end + 1
      } else {
        text += code.charAt(j)
        j += 1
      }
    }
    template.text.push(text)
    return j + 1
  }

  readCode(0)
  return found
}

/** `file:line` of each message built by joining a translation with anything else. */
function concatenated(files: readonly string[], read: (file: string) => string): string[] {
  return files.flatMap((file) => {
    const code = read(file)
    const joined = templates(code)
      .filter(
        (tpl) =>
          tpl.expressions.some((e) => TRANSLATE.test(e)) &&
          tpl.expressions.length + tpl.text.filter((s) => s.trim() !== '').length > 1,
      )
      .map((tpl) => tpl.line)
    const plus = code.split('\n').flatMap((line, i) => (PLUS_JOIN.test(line) ? [i + 1] : []))
    return [...new Set([...joined, ...plus])]
      .sort((a, b) => a - b)
      .map((line) => `src/${file}:${String(line)}`)
  })
}

describe('every message is one key (M6-R10)', () => {
  it('scans a non-empty source tree', () => {
    const files = sources()
    expect(files).toContain('app/import-notices.ts')
    expect(files.length).toBeGreaterThan(100)
  })

  it('finds a translation joined with text, another value or another translation', () => {
    const fake: Record<string, string> = {
      'label.tsx': "const label = `${t('theme.change')}: ${current}`",
      'two.ts': "notify(`${t('a.title')} ${t('a.message')}`)",
      'nested.ts': 'const s = `${t(`guides.${kind}.none`)} ${t(`guides.${kind}.hint`)}`',
      'suffix.ts': "const s = `${i18n.t('a')}…`",
      'plus.ts': "const s = t('a') + ' ' + name\nconst u = name + t('b')",
      'multi.ts': "const s = [\n  `${\n    t('a', { n })\n  } and more`,\n]",
    }
    expect(concatenated(Object.keys(fake), (f) => fake[f] ?? '')).toEqual([
      'src/label.tsx:1',
      'src/two.ts:1',
      'src/nested.ts:1',
      'src/suffix.ts:1',
      'src/plus.ts:1',
      'src/plus.ts:2',
      'src/multi.ts:2',
    ])
  })

  it('accepts one key with interpolation, keys built from templates and code that is not a message', () => {
    const fake: Record<string, string> = {
      'ok.ts': [
        "const a = t('theme.changeLabel', { current })",
        'const b = t(`theme.${theme}`)',
        'const c = `${t(`guides.${kind}.noneWithHint`)}`',
        "const d = `${String(x)}px ${'y'}`",
        'const e = `${count}+${other}`',
        "const f = joinSentences(t, t('a'), t('b'))",
        "// `${t('a')} ${t('b')}` in a comment",
        "const g = '`${t(1)} ${t(2)}`'",
        'i += 1',
      ].join('\n'),
    }
    expect(concatenated(Object.keys(fake), (f) => fake[f] ?? '')).toEqual([])
  })

  it('has no hit in src', () => {
    expect(concatenated(sources(), (f) => readFileSync(join(SRC, f), 'utf8'))).toEqual([])
  })
})
